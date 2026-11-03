#!/usr/bin/env python3
"""IP 보호의 내부망과 제한 Redis 계정을 명시적 적용 전에 검사해요."""
import argparse
import base64
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import re
import subprocess
import sys

NETWORK = "reserve-ingress"
SUBNET = ipaddress.ip_network("172.30.30.0/29")
ADDRESSES = {"nginxserver": "172.30.30.2", "blue": "172.30.30.3", "green": "172.30.30.4"}
OWNER_LABEL = "kr.it.reserve.role"


def docker(*arguments):
    result = subprocess.run(["docker", *arguments], capture_output=True, text=True, timeout=20)
    if result.returncode:
        raise RuntimeError("Docker prerequisite failed: " + arguments[0])
    return result.stdout.strip()


def version_supported(text):
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", text)
    return match and tuple(map(int, match.groups())) >= (28, 0, 0)


def inspect_networks():
    identifiers = docker("network", "ls", "--format", "{{.ID}}").splitlines()
    return [json.loads(docker("network", "inspect", identifier))[0] for identifier in identifiers]


def validate_network(networks):
    chosen = None
    for network in networks:
        configs = network.get("IPAM", {}).get("Config") or []
        if network["Name"] == NETWORK:
            if (network.get("Driver") != "bridge" or not network.get("Internal")
                    or (network.get("Labels") or {}).get(OWNER_LABEL) != "trusted-proxy"
                    or [entry.get("Subnet") for entry in configs] != [str(SUBNET)]):
                raise RuntimeError("Ingress network has unexpected ownership or isolation")
            chosen = network
        elif any(ipaddress.ip_network(entry["Subnet"]).version == 4
                 and SUBNET.overlaps(ipaddress.ip_network(entry["Subnet"])) for entry in configs if "Subnet" in entry):
            raise RuntimeError("Ingress subnet conflicts with an existing network")
    if chosen:
        for entry in (chosen.get("Containers") or {}).values():
            name = entry["Name"]
            if name not in ADDRESSES or entry.get("IPv4Address") != ADDRESSES[name] + "/29":
                raise RuntimeError("Unexpected ingress endpoint; existing connections were preserved")
    return chosen


def proxy_network(apply=False):
    if not version_supported(docker("version", "--format", "{{.Server.Version}}")):
        raise RuntimeError("Loopback publication requires Docker Engine 28 or newer")
    version = subprocess.run(["docker", "exec", "nginxserver", "nginx", "-v"], capture_output=True, text=True, timeout=10)
    match = re.search(r"nginx/(\d+)\.(\d+)\.(\d+)", version.stderr + version.stdout)
    if version.returncode or not match or tuple(map(int, match.groups())) < (1, 27, 3):
        raise RuntimeError("Dynamic upstream resolution requires nginx 1.27.3 or newer")
    active_marker = docker("exec", "nginxserver", "cat", "/etc/nginx/conf.d/service-env.inc")
    active = {"set $service_url blue;": "blue", "set $service_url green;": "green"}.get(active_marker)
    if not active:
        raise RuntimeError("Active upstream cannot be inferred safely")
    selected = validate_network(inspect_networks())
    if selected is None:
        if not apply:
            raise RuntimeError("Approved ingress network preparation is required")
        docker("network", "create", "--driver", "bridge", "--internal", "--subnet", str(SUBNET),
               "--label", OWNER_LABEL + "=trusted-proxy", NETWORK)
    for name in ("nginxserver", active):
        networks = json.loads(docker("inspect", "--format", "{{json .NetworkSettings.Networks}}", name))
        endpoint = networks.get(NETWORK)
        alias = "reserve-" + name + "-ingress"
        if endpoint:
            if endpoint.get("IPAddress") != ADDRESSES[name] or (name != "nginxserver" and alias not in (endpoint.get("Aliases") or [])):
                raise RuntimeError("Ingress endpoint does not match its fixed proxy identity")
        elif apply:
            args = ["network", "connect", "--ip", ADDRESSES[name]]
            if name != "nginxserver":
                args += ["--alias", alias]
            docker(*args, NETWORK, name)
        else:
            raise RuntimeError("Ingress connection preparation is required")
    validate_network(inspect_networks())
    return {"ready": True, "network": NETWORK, "trustedProxy": ADDRESSES["nginxserver"] + "/32", "active": active}


def check_target(target):
    if target not in ("blue", "green"):
        raise RuntimeError("A known deployment target is required")
    port = "8080" if target == "blue" else "8081"
    ports = json.loads(docker("inspect", "--format", "{{json .HostConfig.PortBindings}}", target))
    if ports != {port + "/tcp": [{"HostIp": "127.0.0.1", "HostPort": port}]}:
        raise RuntimeError("Target backend has an unexpected host port binding")
    networks = json.loads(docker("inspect", "--format", "{{json .NetworkSettings.Networks}}", target))
    endpoint = networks.get(NETWORK) or {}
    if endpoint.get("IPAddress") != ADDRESSES[target] or "reserve-" + target + "-ingress" not in (endpoint.get("Aliases") or []):
        raise RuntimeError("Target backend is not on its isolated ingress address")
    return {"ready": True, "target": target, "loopbackPortsOnly": True, "isolatedIngress": True}


def private_file(path):
    path = Path(path)
    if not path.is_absolute() or path.is_symlink() or not path.is_file():
        raise RuntimeError("An existing absolute protected file is required")
    if os.name != "nt" and path.stat().st_mode & 0o077:
        raise RuntimeError("Credential input must be private")
    return path.read_text(encoding="utf-8").strip()


def render_acl(admin_password, app_password):
    if len(admin_password) < 32 or app_password == admin_password:
        raise RuntimeError("Independent administrator and application credentials are required")
    try:
        if len(base64.b64decode(app_password, validate=True)) != 32:
            raise ValueError()
    except ValueError:
        raise RuntimeError("Application credential must encode 32 random bytes") from None
    digest = lambda value: hashlib.sha256(value.encode()).hexdigest()
    rules = " ".join(Path(__file__).with_name("redis-app.rules").read_text(encoding="utf-8").split())
    return ("user default reset on #" + digest(admin_password) + " ~* &* +@all\n"
            + "user reserve_app " + rules + " #" + digest(app_password) + "\n")


def write_acl(config_path, key_path, output_path):
    # 기존 관리자 인증은 보존하며 앱에는 별도 암호와 환경별 권한만 부여해요.
    if os.name != "nt" and os.geteuid() != 0:
        raise RuntimeError("ACL preparation requires the approved root role")
    config = private_file(config_path)
    values = re.findall(r"(?m)^requirepass ([A-Za-z0-9+/=_-]{32,})$", config)
    if len(values) != 1:
        raise RuntimeError("Existing administrator credential format is unsupported")
    if redis_metadata("ACL", "USERS") != ["default"]:
        raise RuntimeError("Existing Redis users require an explicit migration review")
    existing = pairs(redis_metadata("ACL", "GETUSER", "default"))
    if (existing.get("commands") != "+@all" or existing.get("keys") != "~*" or existing.get("channels") != "&*"
            or existing.get("passwords") != [hashlib.sha256(values[0].encode()).hexdigest()]):
        raise RuntimeError("Existing administrator ACL must be reviewed before migration")
    content = render_acl(values[0], private_file(key_path))
    destination = Path(output_path)
    if not destination.is_absolute() or destination.exists() or destination.is_symlink() or destination.parent.is_symlink():
        raise RuntimeError("ACL destination must be a new protected absolute path")
    if os.name != "nt" and destination.parent.stat().st_mode & 0o077:
        raise RuntimeError("ACL directory must be private")
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write(content)
    if os.name != "nt":
        os.chown(destination, 999, 999)
    return {"aclPrepared": True, "applicationUser": "reserve_app", "plainCredentialsWritten": False}


def pairs(value):
    return value if isinstance(value, dict) else dict(zip(value[::2], value[1::2]))


def redis_metadata(*arguments):
    command = 'export REDISCLI_AUTH="$(sed -n \'s/^requirepass //p\' /usr/local/etc/redis/redis.conf)"; exec redis-cli --json "$@"'
    response = docker("exec", "reserve-redis-redis-1", "sh", "-c", command, "sh", *arguments)
    if arguments[:1] == ("INFO",):
        return json.loads(response) if response.startswith('"') else response
    return json.loads(response) if response else None


def check_redis(require_auth=False):
    ports = json.loads(docker("inspect", "--format", "{{json .HostConfig.PortBindings}}", "reserve-redis-redis-1"))
    if any(ports.values()):
        raise RuntimeError("Redis must not publish host ports")
    user = redis_metadata("ACL", "GETUSER", "reserve_app")
    if not user:
        raise RuntimeError("Restricted Redis application user has not been prepared")
    user = pairs(user)
    expected = {rule for rule in Path(__file__).with_name("redis-app.rules").read_text().split() if rule.startswith("+")}
    commands = set(user["commands"].split())
    compatible = [expected | {"-@all"}]
    if not require_auth and os.environ.get("RESERVE_SECURITY_AUTH_LIMITS_ENABLED", "false") != "true":
        compatible.append((expected - {"+info"}) | {"-@all"})
    if (commands not in compatible or user["keys"] != "~reserve:prod:*"
            or user["channels"] != "&reserve:prod:*" or "on" not in user["flags"] or "nopass" in user["flags"]
            or len(user["passwords"]) != 1 or user.get("selectors")):
        raise RuntimeError("Redis application ACL differs from the required scope")
    memory = dict(line.split(":", 1) for line in redis_metadata("INFO", "memory").splitlines() if ":" in line)
    maximum = int(memory["maxmemory"])
    if maximum <= 0 or int(memory["used_memory"]) >= maximum * 0.75:
        raise RuntimeError("Redis requires at least 25 percent configured memory headroom")
    if pairs(redis_metadata("CONFIG", "GET", "maxmemory-policy")).get("maxmemory-policy") != "noeviction":
        raise RuntimeError("Security state requires the noeviction memory policy")
    if not pairs(redis_metadata("CONFIG", "GET", "aclfile")).get("aclfile"):
        raise RuntimeError("Redis application ACL is not durable across restart")
    return {"ready": True, "restrictedApplicationAcl": True, "noPublishedPorts": True,
            "memoryHeadroomAtLeast25Percent": True, "noeviction": True, "durableAcl": True}


def auth_limit_state_key():
    try:
        key = base64.b64decode(os.environ.get("RESERVE_SECURITY_AUTH_LIMITS_FINGERPRINT_KEY", ""), validate=True)
    except ValueError:
        raise RuntimeError("Authentication limits require a dedicated base64 key") from None
    epoch = os.environ.get("RESERVE_SECURITY_AUTH_LIMITS_EPOCH", "")
    if len(key) != 32 or not re.fullmatch(r"[a-zA-Z0-9_-]{8,64}", epoch):
        raise RuntimeError("Authentication limits require a dedicated key and versioned epoch")
    identity = hmac.new(key, ("epoch:" + epoch).encode(), hashlib.sha256).hexdigest()
    return "reserve:prod:auth-limits:v1:{" + identity + "}:state"


def check_auth_limits(apply=False):
    check_redis(require_auth=True)
    state_key = auth_limit_state_key()
    server = dict(line.split(":", 1) for line in redis_metadata("INFO", "server").splitlines() if ":" in line)
    boot = server.get("run_id", "")
    if not re.fullmatch(r"[a-f0-9]{40}", boot):
        raise RuntimeError("Redis server identity is unavailable")
    clock = redis_metadata("TIME")
    now = int(clock[0]) * 1000 + int(clock[1]) // 1000
    state = pairs(redis_metadata("HGETALL", state_key) or {})
    if state.get("boot") != boot or not str(state.get("ready", "")).isdigit():
        if not apply:
            raise RuntimeError("Authentication limits require approved preparation and a full ten-minute recovery wait")
        ready = now + 600000
        redis_metadata("HSET", state_key, "boot", boot, "ready", str(ready))
    else:
        ready = int(state["ready"])
    remaining = max(0, (ready - now + 999) // 1000)
    if remaining and not apply:
        raise RuntimeError("Authentication limit recovery wait has not completed")
    return {"ready": remaining == 0, "recoveryWaitSeconds": remaining, "sharedAuthenticationLimits": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["check-network", "check-target", "check-redis", "check-auth-limits",
                                          "prepare-network", "prepare-acl", "prepare-auth-limits"])
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--admin-config")
    parser.add_argument("--app-key")
    parser.add_argument("--output")
    parser.add_argument("--target", choices=["blue", "green"])
    args = parser.parse_args()
    if args.action.startswith("prepare-") and not args.apply:
        parser.error("Preparation requires the separately approved --apply action")
    try:
        if args.action == "prepare-acl":
            if not all((args.admin_config, args.app_key, args.output)):
                parser.error("ACL preparation requires protected input and output paths")
            result = write_acl(args.admin_config, args.app_key, args.output)
        elif args.action == "check-redis":
            result = check_redis()
        elif args.action in ("check-auth-limits", "prepare-auth-limits"):
            result = check_auth_limits(args.action == "prepare-auth-limits")
        elif args.action == "check-target":
            result = check_target(args.target)
        else:
            result = proxy_network(args.action == "prepare-network")
        print(json.dumps(result))
    except (RuntimeError, OSError, ValueError, TypeError, KeyError, subprocess.TimeoutExpired) as failure:
        # 설정·파일 원문과 Docker 출력은 오류 응답에 포함하지 않아요.
        message = str(failure) if isinstance(failure, RuntimeError) else "IP preparation prerequisite could not be checked"
        print(json.dumps({"ready": False, "reason": message}))
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
