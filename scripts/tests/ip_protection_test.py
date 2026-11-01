import base64
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
import urllib.request
import uuid
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("ip_preparation", Path(__file__).parents[1] / "prepare-ip-protection.py")
OPS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OPS)


def network():
    return {"Name": OPS.NETWORK, "Driver": "bridge", "Internal": True,
            "Labels": {OPS.OWNER_LABEL: "trusted-proxy"}, "IPAM": {"Config": [{"Subnet": str(OPS.SUBNET)}]},
            "Containers": {"proxy": {"Name": "nginxserver", "IPv4Address": "172.30.30.2/29"}}}


class ProxyNetworkTest(unittest.TestCase):
    def test_requires_fixed_isolated_owned_network(self):
        self.assertEqual(OPS.validate_network([network()])["Name"], OPS.NETWORK)
        for field, value in [("Internal", False), ("Driver", "host"), ("Labels", {})]:
            broken = network()
            broken[field] = value
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                OPS.validate_network([broken])

    def test_rejects_overlap_or_unexpected_endpoint_without_changing_network(self):
        overlapping = {"Name": "other", "IPAM": {"Config": [{"Subnet": "172.30.0.0/16"}]}}
        with self.assertRaises(RuntimeError):
            OPS.validate_network([overlapping])
        for name, address in [("other", "172.30.30.5/29"), ("nginxserver", "172.30.30.5/29")]:
            broken = network()
            broken["Containers"]["unexpected"] = {"Name": name, "IPv4Address": address}
            with self.subTest(name=name), self.assertRaises(RuntimeError):
                OPS.validate_network([broken])

    def test_old_docker_cannot_weaken_loopback_isolation(self):
        self.assertFalse(OPS.version_supported("27.5.1"))
        self.assertFalse(OPS.version_supported("unknown"))
        self.assertTrue(OPS.version_supported("28.5.2"))

    @patch.object(OPS, "docker")
    def test_actual_target_requires_loopback_ports_and_its_fixed_ingress_identity(self, docker):
        ports = {"8081/tcp": [{"HostIp": "127.0.0.1", "HostPort": "8081"}]}
        endpoint = {OPS.NETWORK: {"IPAddress": "172.30.30.4", "Aliases": ["reserve-green-ingress"]}}
        docker.side_effect = [json.dumps(ports), json.dumps(endpoint)]
        self.assertTrue(OPS.check_target("green")["ready"])
        for host in ["", "0.0.0.0", "::"]:
            ports["8081/tcp"][0]["HostIp"] = host
            docker.side_effect = [json.dumps(ports)]
            with self.subTest(host=host), self.assertRaises(RuntimeError):
                OPS.check_target("green")
        ports["8081/tcp"][0]["HostIp"] = "127.0.0.1"
        endpoint[OPS.NETWORK]["IPAddress"] = "172.30.30.5"
        docker.side_effect = [json.dumps(ports), json.dumps(endpoint)]
        with self.assertRaises(RuntimeError):
            OPS.check_target("green")

    @patch.object(OPS.subprocess, "run")
    @patch.object(OPS, "inspect_networks", return_value=[])
    @patch.object(OPS, "docker")
    def test_default_check_never_creates_or_connects_network(self, docker, networks, run):
        run.return_value.returncode = 0
        run.return_value.stderr = "nginx/1.29.8"
        run.return_value.stdout = ""
        docker.side_effect = ["28.5.2", "set $service_url blue;"]
        with self.assertRaises(RuntimeError):
            OPS.proxy_network()
        self.assertTrue(all(call.args[0] not in ("network",) for call in docker.call_args_list))

    @patch.object(OPS.subprocess, "run")
    @patch.object(OPS, "inspect_networks")
    @patch.object(OPS, "docker")
    def test_explicit_prepare_preserves_existing_connections_and_adds_only_owned_endpoints(self, docker, networks, run):
        run.return_value.returncode = 0
        run.return_value.stderr = "nginx/1.29.8"
        run.return_value.stdout = ""
        networks.side_effect = [[], [network()]]
        docker.side_effect = ["28.5.2", "set $service_url blue;", "id", "{}", "", "{}", ""]
        result = OPS.proxy_network(apply=True)
        self.assertEqual(result["trustedProxy"], "172.30.30.2/32")
        calls = [call.args for call in docker.call_args_list]
        self.assertEqual(sum(call[:2] == ("network", "create") for call in calls), 1)
        self.assertEqual(sum(call[:2] == ("network", "connect") for call in calls), 2)
        self.assertFalse(any("disconnect" in call or "rm" in call for call in calls))


class RedisAclTest(unittest.TestCase):
    def test_generated_acl_preserves_admin_and_never_contains_plaintext_passwords(self):
        admin = "synthetic-administrator-credential" * 2
        application = base64.b64encode(bytes(range(32))).decode()
        rendered = OPS.render_acl(admin, application)
        self.assertNotIn(admin, rendered)
        self.assertNotIn(application, rendered)
        self.assertIn("user default reset on #", rendered)
        self.assertIn("user reserve_app reset on -@all", rendered)
        self.assertIn("~reserve:prod:*", rendered)
        self.assertIn("&reserve:prod:*", rendered)
        self.assertNotIn("+config", rendered)
        self.assertNotIn("+flushall", rendered)

    def test_short_shared_or_malformed_credentials_are_rejected(self):
        for admin, app in [("short", "invalid"), ("x" * 44, "x" * 44), ("admin" * 10, "invalid")]:
            with self.subTest(admin_length=len(admin)), self.assertRaises(RuntimeError):
                OPS.render_acl(admin, app)

    def user(self):
        rules = (Path(OPS.__file__).with_name("redis-app.rules")).read_text().split()
        return {"flags": ["on"], "passwords": ["synthetic-hash"],
                "commands": "-@all " + " ".join(rule for rule in rules if rule.startswith("+")),
                "keys": "~reserve:prod:*", "channels": "&reserve:prod:*"}

    def metadata(self, user=None, memory=None, policy="noeviction", aclfile="/private/users.acl"):
        return [user if user is not None else self.user(), memory or "maxmemory:67108864\r\nused_memory:1048576\r\n",
                ["maxmemory-policy", policy], ["aclfile", aclfile]]

    @patch.object(OPS, "docker", return_value="{}")
    @patch.object(OPS, "redis_metadata")
    def test_ready_requires_exact_key_channel_command_and_durable_memory_contract(self, redis, docker):
        redis.side_effect = self.metadata()
        self.assertTrue(OPS.check_redis()["ready"])
        for field, value in [("commands", "+@all"), ("keys", "~*"), ("channels", "&*"),
                             ("flags", ["on", "nopass"]), ("passwords", []), ("selectors", [{"commands": "+@all"}])]:
            user = copy.deepcopy(self.user())
            user[field] = value
            redis.side_effect = self.metadata(user=user)
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                OPS.check_redis()
        for overrides in [{"memory": "maxmemory:67108864\r\nused_memory:67108864\r\n"},
                          {"policy": "allkeys-lru"}, {"aclfile": ""}]:
            redis.side_effect = self.metadata(**overrides)
            with self.subTest(overrides=overrides), self.assertRaises(RuntimeError):
                OPS.check_redis()

    @patch.object(OPS, "docker", return_value='{"6379/tcp":[{"HostIp":"","HostPort":"6379"}]}')
    def test_published_redis_is_rejected_before_reading_credentials(self, docker):
        with patch.object(OPS, "redis_metadata") as redis, self.assertRaises(RuntimeError):
            OPS.check_redis()
        redis.assert_not_called()

    def test_invalid_key_file_and_existing_acl_are_preserved(self):
        with tempfile.TemporaryDirectory(prefix="reserve-ip-acl-test-") as temp:
            root = Path(temp)
            key = root / "key"
            key.write_text("invalid")
            key.chmod(0o600)
            with self.assertRaises(RuntimeError):
                OPS.private_file(root / "missing")
            self.assertEqual(key.read_text(), "invalid")

    def test_acl_file_creation_is_private_and_never_overwrites_an_existing_file(self):
        with tempfile.TemporaryDirectory(prefix="reserve-ip-acl-test-") as temp:
            root = Path(temp)
            root.chmod(0o700)
            admin = "synthetic-administrator-credential" * 2
            app = base64.b64encode(bytes(range(32))).decode()
            config, key, output = root / "redis.conf", root / "app.key", root / "users.acl"
            config.write_text("requirepass " + admin + "\n", encoding="utf-8")
            key.write_text(app, encoding="utf-8")
            config.chmod(0o600); key.chmod(0o600)
            existing = {"commands": "+@all", "keys": "~*", "channels": "&*",
                        "passwords": [OPS.hashlib.sha256(admin.encode()).hexdigest()]}
            with patch.object(OPS.os, "geteuid", return_value=0, create=True), patch.object(OPS.os, "chown", create=True), \
                    patch.object(OPS, "redis_metadata", side_effect=lambda *args: ["default"] if args == ("ACL", "USERS") else existing):
                self.assertTrue(OPS.write_acl(config, key, output)["aclPrepared"])
                original = output.read_bytes()
                with self.assertRaises(RuntimeError):
                    OPS.write_acl(config, key, output)
                self.assertEqual(output.read_bytes(), original)


@unittest.skipUnless(os.getenv("RESERVE_PROXY_INTEGRATION") == "true", "Explicit isolated Docker gate")
class RedisReadinessIntegrationTest(unittest.TestCase):
    def test_real_persisted_acl_and_memory_metadata_pass_the_deployment_guard(self):
        owner = uuid.uuid4().hex[:12]
        image = "redis@sha256:5f2e6a105b2a8cc721911d5d29aadb032c25fe55b43e829e3d03413753ff47c2"
        original = OPS.docker
        identity = original("run", "--pull=never", "-d", "--network", "none", "--user", "999:999", "--read-only",
                            "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--memory=128m", "--memory-swap=128m",
                            "--label", "kr.it.reserve.ip-fixture=" + owner,
                            "--tmpfs", "/usr/local/etc/redis:rw,noexec,nosuid,size=4m,uid=999,gid=999",
                            "--entrypoint", "sh", image, "-c",
                            "while [ ! -f /usr/local/etc/redis/redis.conf ]; do sleep 0.1; done; exec redis-server /usr/local/etc/redis/redis.conf")
        self.assertRegex(identity, r"^[0-9a-f]{64}$")
        admin = base64.b64encode(os.urandom(32)).decode()
        app = base64.b64encode(os.urandom(32)).decode()

        def write(name, value):
            result = OPS.subprocess.run(["docker", "exec", "-i", identity, "sh", "-c", "umask 077; cat > /usr/local/etc/redis/" + name],
                                        input=value.encode("utf-8"), capture_output=True, timeout=15)
            self.assertEqual(result.returncode, 0)

        def scoped(*arguments):
            return original(*(identity if argument == "reserve-redis-redis-1" else argument for argument in arguments))

        try:
            write("users.acl", OPS.render_acl(admin, app))
            write("redis.conf", "bind 127.0.0.1\nrequirepass " + admin + "\naclfile /usr/local/etc/redis/users.acl\n"
                  + 'save ""\nappendonly no\nmaxmemory 64mb\nmaxmemory-policy noeviction\n')
            with patch.object(OPS, "docker", side_effect=scoped):
                for attempt in range(40):
                    try:
                        if OPS.redis_metadata("PING") == "PONG":
                            break
                    except (RuntimeError, ValueError):
                        time.sleep(0.1)
                self.assertTrue(OPS.check_redis()["ready"])
        finally:
            actual = original("inspect", "--format", '{{index .Config.Labels "kr.it.reserve.ip-fixture"}}', identity)
            self.assertEqual(actual, owner)
            original("rm", "-f", identity)


@unittest.skipUnless(os.getenv("RESERVE_PROXY_INTEGRATION") == "true", "Explicit isolated Docker gate")
class ProxyIntegrationTest(unittest.TestCase):
    IMAGE = "nginx@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de"

    def test_proxy_overwrites_forged_ip_keeps_loopback_ports_and_recovers_after_dns_change(self):
        owner = uuid.uuid4().hex[:12]
        label = "kr.it.reserve.ip-fixture=" + owner
        network_name = "reserve-ip-fixture-" + owner
        ids = []
        network_created = False

        def start(suffix, address, config, alias=None):
            identity = OPS.docker("run", "--pull=never", "-d", "--name", "reserve-ip-" + owner + suffix,
                                  "--label", label, "--network", "bridge", "--read-only", "--user", "101:101",
                                  "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--memory=64m", "--memory-swap=64m",
                                  "--cpus=0.5", "--pids-limit=32", "--tmpfs", "/tmp:rw,noexec,nosuid,size=8m,mode=1777",
                                  "-p", "127.0.0.1::8080", "--entrypoint", "sh", self.IMAGE, "-c",
                                  "while [ ! -f /tmp/fixture.conf ]; do sleep 0.1; done; exec nginx -c /tmp/fixture.conf -g 'daemon off;'")
            self.assertRegex(identity, r"^[0-9a-f]{64}$")
            ids.append(identity)
            arguments = ["network", "connect", "--ip", address]
            if alias:
                arguments += ["--alias", alias]
            OPS.docker(*arguments, network_name, identity)
            result = OPS.subprocess.run(["docker", "exec", "-i", identity, "sh", "-c", "umask 077; cat > /tmp/fixture.conf"],
                                        input=config.encode("utf-8"), capture_output=True, timeout=15)
            self.assertEqual(result.returncode, 0)
            if OPS.docker("inspect", "--format", "{{.State.Running}}", identity) != "true":
                self.fail("Synthetic nginx failed: " + OPS.docker("logs", identity)[-500:])
            endpoint = OPS.docker("port", identity, "8080/tcp")
            self.assertRegex(endpoint, r"^127\.0\.0\.1:[0-9]+$")
            return identity, "http://" + endpoint

        def fetch(endpoint):
            request = urllib.request.Request(endpoint, headers={"X-Real-IP": "203.0.113.99"})
            with urllib.request.urlopen(request, timeout=1) as response:
                return response.read().decode()

        def await_body(endpoint, expected):
            for _ in range(40):
                try:
                    body = fetch(endpoint)
                    if expected in body:
                        return body
                except (OSError, TimeoutError):
                    pass
                time.sleep(0.25)
            self.fail("Isolated proxy did not recover within its DNS window")

        root = ("pid /tmp/nginx.pid; error_log /dev/stderr warn; events {} http { access_log off; "
                "client_body_temp_path /tmp/client; proxy_temp_path /tmp/proxy; fastcgi_temp_path /tmp/fastcgi; "
                "uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi; ")
        backend = root + 'server { listen 8080; location / { return 200 "$remote_addr|$http_x_real_ip|first"; } } }'
        source = Path(OPS.__file__).parents[1].joinpath("nginx/default.conf").read_text(encoding="utf-8")
        upstreams = OPS.re.search(r"resolver 127\.0\.0\.11.*?\nupstream green \{.*?\n\}", source, OPS.re.S).group()
        proxy = root + upstreams + ' server { listen 8080; location / { proxy_pass http://blue; proxy_set_header X-Real-IP $remote_addr; } } }'
        try:
            OPS.docker("network", "create", "--internal", "--subnet", "172.31.250.0/29", "--label", label, network_name)
            network_created = True
            first, direct = start("-first", "172.31.250.3", backend, "reserve-blue-ingress")
            _, endpoint = start("-proxy", "172.31.250.2", proxy)
            direct_body = await_body(direct, "first")
            self.assertFalse(direct_body.startswith("172.31.250.2|"))
            self.assertIn("203.0.113.99", direct_body)
            body = await_body(endpoint, "first")
            self.assertTrue(body.startswith("172.31.250.2|"))
            self.assertNotIn("203.0.113.99", body)
            OPS.docker("rm", "-f", first)
            ids.remove(first)
            start("-second", "172.31.250.4", backend.replace("|first", "|second"), "reserve-blue-ingress")
            self.assertTrue(await_body(endpoint, "second").startswith("172.31.250.2|"))
        finally:
            for identity in ids:
                actual = OPS.docker("inspect", "--format", '{{index .Config.Labels "kr.it.reserve.ip-fixture"}}', identity)
                self.assertEqual(actual, owner)
                OPS.docker("rm", "-f", identity)
            if network_created:
                actual = OPS.docker("network", "inspect", "--format", '{{index .Labels "kr.it.reserve.ip-fixture"}}', network_name)
                self.assertEqual(actual, owner)
                OPS.docker("network", "rm", network_name)


if __name__ == "__main__":
    unittest.main()
