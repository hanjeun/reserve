#!/usr/bin/env bash
set -euo pipefail

# 빌드한 로컬 이미지 하나만 검사하고 레지스트리 조회·실행·푸시는 하지 않아요.
[[ $# == 1 && "$1" =~ ^reserve-security:[0-9a-f]{40}$ ]] || {
  echo 'Expected a local reserve-security image with a full commit SHA' >&2
  exit 1
}
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || {
  echo 'This scanner requires Linux x86_64' >&2
  exit 1
}
IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$1")
[[ "$IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1

# 공식 immutable release의 파일 해시를 고정하며 원격 설치 스크립트를 실행하지 않아요.
TASK_DIR=$(mktemp -d)
trap 'rm -f -- "$TASK_DIR/trivy.tar.gz" "$TASK_DIR/trivy" "$TASK_DIR/trivy.yaml"; rmdir -- "$TASK_DIR"' EXIT
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  --connect-timeout 15 --max-time 180 \
  'https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_Linux-64bit.tar.gz' \
  -o "$TASK_DIR/trivy.tar.gz"
printf '%s  %s\n' 'c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0' "$TASK_DIR/trivy.tar.gz" | sha256sum --check --status
tar -xzf "$TASK_DIR/trivy.tar.gz" -C "$TASK_DIR" trivy
printf '{}\n' > "$TASK_DIR/trivy.yaml"

# OS 패키지와 JAR 의존성을 함께 검사해요. DB 다운로드 실패도 배포 중단이에요.
"$TASK_DIR/trivy" image --config "$TASK_DIR/trivy.yaml" --image-src docker \
  --scanners vuln --pkg-types os,library --severity HIGH,CRITICAL \
  --ignorefile /dev/null --exit-code 1 --exit-on-eol 1 --timeout 10m \
  --disable-telemetry --offline-scan --no-progress "$IMAGE_ID"
