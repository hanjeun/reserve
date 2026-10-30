#!/usr/bin/env python3
"""Ubuntu의 로컬 보안 점검 입력만 읽어요. 패치·네트워크 요청·CVE 판정은 하지 않아요.

필수 관측 실패는 PARTIAL과 종료 코드 2로 표시해요. APT 성공 stamp의 부재만 선택 항목이에요.
OBSERVED와 종료 코드 0은 수집 완료이며 보안 판정이 아니에요.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import platform
import re
import subprocess
import sys


DPKG_COMMAND = (
    "/usr/bin/dpkg-query", "--show",
    "--showformat=${binary:Package}\t${Version}\t${db:Status-Status}\n",
)
PACKAGE_NAMES = frozenset({
    "apt", "dpkg", "unattended-upgrades", "ubuntu-keyring", "linux-base",
    "systemd", "libsystemd0", "udev", "sudo", "polkitd", "policykit-1",
    "bash", "coreutils", "util-linux", "login", "passwd", "libpam0g",
    "libpam-modules", "libpam-runtime", "openssh-client", "openssh-server",
    "openssh-sftp-server", "libc6", "libc-bin", "openssl", "libssl3",
    "libssl3t64", "ca-certificates", "curl", "libcurl4", "libcurl4t64",
    "zlib1g", "libbrotli1", "brotli", "docker.io", "docker-ce",
    "docker-ce-cli", "docker-buildx-plugin", "docker-compose-plugin",
    "containerd", "containerd.io", "runc", "nginx", "nginx-core",
    "nginx-common", "nginx-full", "nginx-light", "nginx-extras",
})
KERNEL_PACKAGE = re.compile(r"linux-(?:image|modules|headers|generic|virtual|aws|azure|gcp|oracle)(?:-[a-z0-9.+-]+)?")


def unknown(reason):
    return {"status": "UNKNOWN", "reason": reason}


def utc(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def os_release():
    try:
        with Path("/etc/os-release").open(encoding="utf-8") as source:
            text = source.read(16_385)
        if len(text) > 16_384:
            return unknown("os_release_too_large")
        values = dict(line.split("=", 1) for line in text.splitlines() if "=" in line and not line.startswith("#"))
        identifier = values.get("ID", "").strip("\"'")
        version = values.get("VERSION_ID", "").strip("\"'")
        if identifier != "ubuntu":
            return unknown("ubuntu_required")
        if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)*", version):
            return unknown("ubuntu_version_unavailable")
        return {"status": "OBSERVED", "id": identifier, "version_id": version}
    except (OSError, UnicodeError):
        return unknown("os_release_unreadable")


def packages():
    try:
        result = subprocess.run(DPKG_COMMAND, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                text=True, encoding="utf-8", timeout=10, check=False,
                                env={"LC_ALL": "C", "PATH": "/usr/bin:/bin"})
        if result.returncode != 0:
            return unknown("dpkg_query_failed")
        if len(result.stdout) > 8 * 1024 * 1024:
            return unknown("dpkg_output_too_large")
        found = []
        for line in result.stdout.splitlines():
            fields = line.split("\t")
            if len(fields) != 3:
                return unknown("dpkg_output_invalid")
            name, version, state = fields
            base = name.split(":", 1)[0]
            if state != "installed" or (base not in PACKAGE_NAMES and not KERNEL_PACKAGE.fullmatch(base)):
                continue
            if not re.fullmatch(r"[a-z0-9.+-]+(?::[a-z0-9-]+)?", name) or not re.fullmatch(r"[0-9A-Za-z.+:~_-]+", version):
                return unknown("package_metadata_invalid")
            found.append({"name": name, "version": version})
        return {"status": "OBSERVED", "items": sorted(found, key=lambda item: item["name"])} if found else unknown("selected_packages_unavailable")
    except (OSError, subprocess.SubprocessError, UnicodeError):
        return unknown("dpkg_query_unavailable")


def reboot_required():
    try:
        Path("/run/reboot-required").stat()
        return {"status": "OBSERVED", "marker_present": True}
    except FileNotFoundError:
        return {"status": "OBSERVED", "marker_present": False}
    except OSError:
        return unknown("reboot_marker_unreadable")


def apt_cache():
    try:
        stamp = {"status": "OBSERVED", "mtime_utc": utc(Path("/var/lib/apt/periodic/update-success-stamp").stat().st_mtime)}
    except FileNotFoundError:
        stamp = unknown("update_success_stamp_absent")
    except (OSError, ValueError, OverflowError):
        stamp = unknown("update_success_stamp_unavailable")
    try:
        times = [path.stat().st_mtime for path in Path("/var/lib/apt/lists").iterdir()
                 if path.name.endswith(("_InRelease", "_Release")) and path.is_file()]
        releases = ({"status": "OBSERVED", "file_count": len(times), "oldest_mtime_utc": utc(min(times)),
                     "newest_mtime_utc": utc(max(times))} if times else unknown("release_metadata_unavailable"))
    except (OSError, ValueError, OverflowError):
        releases = unknown("release_metadata_unreadable")
    return {"update_success_stamp": stamp, "release_metadata": releases}


def collect():
    if sys.platform != "linux":
        return unknown("ubuntu_linux_required")
    release = os_release()
    if release["status"] != "OBSERVED":
        return {"status": "UNKNOWN", "os": release}
    try:
        kernel = platform.release()
    except OSError:
        kernel = ""
    result = {"status": "OBSERVED", "observed_at_utc": datetime.now(timezone.utc).isoformat(),
            "scope": "local_metadata_only", "cve_assessment": "UNKNOWN", "os": release,
            "running_kernel": ({"status": "OBSERVED", "release": kernel} if re.fullmatch(r"[A-Za-z0-9._+-]{1,128}", kernel)
                               else unknown("kernel_release_invalid")),
            "packages": packages(), "reboot_required": reboot_required(), "apt_cache": apt_cache(),
            "limitations": "로컬 메타데이터예요. 캐시 시각은 최신 패치 적용이나 CVE 미영향을 증명하지 않아요. 재부팅 marker 부재도 재부팅 불필요를 증명하지 않아요."}
    required = (result["running_kernel"], result["packages"], result["reboot_required"],
                result["apt_cache"].get("release_metadata", {}))
    stamp = result["apt_cache"].get("update_success_stamp", {})
    # Ubuntu의 갱신 방식에 따라 성공 stamp가 없을 수 있다. 부재만 선택 항목이며 읽기 오류는 수집 실패다.
    stamp_complete = stamp.get("status") == "OBSERVED" or stamp.get("reason") == "update_success_stamp_absent"
    if not stamp_complete or any(item.get("status") != "OBSERVED" for item in required):
        result["status"] = "PARTIAL"
    return result


def main():
    result = unknown("arguments_not_supported") if len(sys.argv) != 1 else collect()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "OBSERVED" else 2


if __name__ == "__main__":
    sys.exit(main())
