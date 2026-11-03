# 배포

RESERVE는 GitHub Actions와 Docker Blue/Green 방식으로 배포해요.

## 브랜치

| 브랜치 | 역할 |
|---|---|
| feature·fix·chore | 개별 변경 |
| dev | 변경 통합 |
| main | 운영 배포 |

dev 대상 PR은 merge commit, main 대상 릴리스 PR은 squash를 사용해요. main 릴리스 뒤에는 dev에 main의 계보를 연결해요.

## 배포 흐름

1. 백엔드·프론트엔드 검사와 필수 보안 검사를 실행해요.
2. 같은 커밋으로 API 이미지와 앱·소개·이전 주소 호환 화면을 만들어요.
3. 새 서버와 화면을 준비하고 정상 응답을 확인해요.
4. Nginx가 API와 화면을 함께 전환해요.
5. 전환 뒤 상태를 확인하고, 실패하면 이전 API와 화면으로 함께 돌아가요.

같은 입력의 성공 검사 결과는 유효한 증거가 있을 때 재사용해요. 필수 빌드와 보안 검사는 유지해요.

CI.yml은 검사·필수 빌드·보안 검사와 같은 이미지의 게시를 맡아요. main push의 필수 잡이 성공하면 같은 실행에서 CD.yml을 재사용 워크플로로 호출해요. PR과 수동 CI는 서버에 접근하지 않으며 CD 전용 실행 기록을 추가하지 않아요.

CD는 원래 main push의 저장소·SHA·실행과 필수 잡 성공, 같은 SHA의 최신 CodeQL 성공을 확인해요. 프론트·소개 화면은 같은 실행의 SHA별 산출물을 받고, 백엔드는 그 실행이 게시한 digest로 고정해요. 다른 저장소·PR 산출물·최신 태그로 바꾸지 않으며 더 새로운 main이 있으면 서버 접근 전에 중단해요. SSH 준비와 전환은 CD에만 두고 production 환경·건강 확인·스키마·RAM·복구 관문을 유지해요.

## 구성 파일 위치

Compose 파일은 infra/compose, Alloy·Promtail 설정은 infra/logging에 있어요. 저장소에서는 프로젝트 루트·환경 파일·상대 mount 기준을 유지하는 다음 도구를 사용해요.

```sh
bash scripts/compose.sh mysql config
bash scripts/compose.sh monitoring -f infra/compose/docker-compose-observability.yml config
```

monitoring-email·observability·alloy는 독립 프로젝트가 아닌 monitoring의 overlay예요. monitoring과 -f로 함께 지정하고 실제 기동할 서비스도 명시해요. Alloy와 Promtail을 동시에 기동하지 않아요.

기존 COMPOSE_PROJECT_NAME과 -p 선택은 유지하며 이름을 바꿔 새 데이터 볼륨을 만들지 않아요. 운영 앱 배포는 Compose 파일만 /home/ubuntu에 펼쳐 기존 경로를 사용하고 보조 스크립트는 /home/ubuntu/scripts에 유지해요. 운영 모니터링·DB·Redis를 이 도구로 재생성하는 승인은 포함하지 않아요. 기존 Alloy 설정 경로는 RESERVE_ALLOY_CONFIG_PATH로 지정할 수 있어요.

## 배포 조건

- 새 서버가 실제 데이터 구조와 호환되어야 해요.
- 새 앱을 시작하기 직전에 가용 물리 메모리를 확인해요. 초기 기준은 기존 앱 사용량과 768MiB 중 큰 값에 256MiB 여유를 더하며, 이미 실행 중인 대상 앱은 추가 성장분만 계산해요. swap을 가용 RAM으로 더하지 않고, 읽기 실패나 부족 시 기존 서비스를 유지한 채 배포를 중단해요. 이 기준은 부하 수용량을 보장하지 않아요.
- 운영 앱 계정은 제한된 권한과 스키마 검사 설정(validate)을 사용해요.
- 데이터 구조가 바뀌면 기존 데이터와 복구 버전의 호환성을 확인해요.
- 운영 전환과 데이터·결제·권한 변경은 승인된 범위에서 진행해요.
- 기기 세션과 입장 대기를 포함하는 이미지는 같은 계약의 복구 이미지를 요구해요. 이전 이미지를 호환 버전으로 다시 표시해서 통과시키지 않아요.
- 자동 비상 입장 정책을 포함하는 후보와 복구 이미지는 모두 `waiting-signup-hidden-feed-oauth-login-session-admission-mfa-completion-test-settlement-v11` 계약과 실제 구현을 갖춰야 해요.
- 새 세션·예약 요청·MFA·가상 정산 테이블과 예약 종료 컬럼을 준비한 뒤 실제 후보와 복구 JAR의 제한 계정 validate를 확인해요.
- MFA 등록 전에는 후보·복구 이미지 모두 v11 계약과 같은 MFA 암호화 키를 갖춰야 해요. v10 이미지에 새 라벨만 붙여 복구에 사용하지 않아요.
- MFA 필수 정책·자동 완료 작업·TEST 정산은 각 설정으로 활성화해요. DDL 준비와 운영 활성화는 별도예요.
- 인기 예약 입장 대기는 기본으로 꺼져 있어요. 운영 Redis·행사 설정·상태 marker를 별도로 준비해야 켤 수 있어요.

현재 실행 버전이 새 데이터 계약을 읽지 못하면 일반 자동 배포는 시작 단계에서 거부돼요. 첫 계약 전환은 검증된 새 계약의 복구 묶음과 직전 백업을 준비하고, 승인된 쓰기 중지·DDL·실제 JAR 검사·수동 전환을 거쳐요. 새 세션이 발급된 뒤에는 이전 계약 이미지나 테이블 삭제로 단순 복귀하지 않아요.

## 이미지와 Ubuntu 보안

PR과 main 빌드 모두 최신 기반 이미지를 가져와 캐시 없이 앱 이미지를 만들고, 고정 버전·SHA-256을 확인한 Trivy로 OS 패키지와 JAR 의존성을 검사해요. HIGH·CRITICAL 취약점, 지원 종료 OS 또는 검사 실패는 이미지 게시와 배포를 중단해요. 수정 버전이 없는 취약점도 자동으로 제외하지 않아요. 검사가 끝난 동일 이미지에만 커밋 태그를 붙여요. 앱 컨테이너는 기존 일반 사용자 실행에 더해 Linux capability를 모두 제거하고 추가 권한 획득을 차단해요.

앱의 Alpine 기반 이미지 검사와 Ubuntu 호스트 검사는 별개예요. 호스트에서는 `python3 scripts/inspect-ubuntu-security.py`로 Ubuntu 버전·실행 커널·주요 설치 패키지·재부팅 필요 표식·APT 캐시 시각만 읽을 수 있어요. 이 도구는 네트워크 연결, 패키지 갱신, 재시작을 하지 않으며 결과만으로 취약점이 없다고 판정하지 않아요. 실제 설치 버전을 [Ubuntu 보안 공지](https://ubuntu.com/security/notices) 및 해당 Ubuntu 릴리스의 수정 패키지 버전과 대조해야 해요.

필수 항목을 읽지 못하면 `PARTIAL` 또는 `UNKNOWN`과 종료 코드 2를 반환해요. APT 성공 stamp가 원래 없는 구성은 그 부재만으로 실패하지 않지만 Release 메타데이터도 없거나 읽지 못하면 `PARTIAL`이에요. `OBSERVED`와 종료 코드 0은 수집 완료만 뜻하며 패치 완료나 CVE 미영향을 뜻하지 않아요.

운영 패치에는 해당 CVE·패키지·서비스 영향·백업과 복구 경로·재시작 시간을 먼저 확정해요. 배포 중에는 `apt upgrade`, Docker·SSH 재시작, 커널 재부팅을 함께 실행하지 않아요. 패치 뒤 설치 버전뿐 아니라 실제 실행 커널과 서비스도 확인해요. nginx·MySQL·Redis·관측 컨테이너는 앱 이미지 검사 범위에 포함되지 않으므로 각 실행 이미지와 보존 볼륨을 별도로 검증해요.

앱 포트 8080·8081은 호스트 루프백에만 연결하고 nginx는 `reserve-ingress` 내부망의 전용 별칭으로 앱에 연결해요. nginx `172.30.30.2`, blue `.3`, green `.4`를 `172.30.30.0/29`에서 고정하고 nginx 주소 하나만 신뢰해요. 이 전환에는 Docker Engine 28 이상과 nginx 1.27.3 이상이 필요해요. nginx는 Docker DNS와 공유 upstream zone을 사용해 비활성 앱의 부재·교체를 처리해요. [Docker 포트 공개](https://docs.docker.com/engine/network/port-publishing/)와 [nginx 동적 주소 확인](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#resolve)을 참고해요.

최초 전환은 별도 승인 후 `python3 scripts/prepare-ip-protection.py prepare-network --apply`로 내부망을 만들고 nginx와 현재 활성 앱에 추가 연결해요. 기존 망·라우팅을 먼저 끊지 않아요. 도구는 대역 충돌·소유·고정 주소·실제 활성 upstream을 검사해요. 배포는 `check-network`를 통과한 뒤 새 앱을 만들며 기존 메모리·호환성·원자적 전환·복구 관문을 유지해요. 이전 호스트 사설 주소를 쓰는 nginx에 포트 제한만 먼저 적용하지 않아요.

Redis 계정 전환도 별도 승인해요. 기존 관리자 설정과 독립된 앱 키를 보호 파일로 준비하고 `prepare-ip-protection.py prepare-acl --apply --admin-config <보호된 redis.conf> --app-key <보호된 앱 키> --output <새 보호된 users.acl>`을 사용해요. 도구는 기존 관리자 권한·인증을 대조하고 앱 권한만 제한하며 ACL을 Redis UID 999가 읽도록 저장해요. `RESERVE_REDIS_ACL_PATH`와 읽기 전용 ACL을 적용하는 Redis 재시작은 진행 중 입장 관문·쓰기를 확인한 승인된 중지 시간에 수행해요. 앱은 새 `RESERVE_REDIS_USERNAME=reserve_app`·전용 암호를 사용해요. 기존 관리자 암호·설정과 직전 compose는 복구에 보존해요.

첫 배포는 IP 보호를 끈 상태로 프록시·제한 Redis 계정·새 앱을 전환하고 같은 SHA의 호환 복구를 확인해요. `check-redis`·필수 CI·외부 앱 포트의 직접 연결 차단·실제 프록시 경유 로그인 확인 뒤 같은 검증 이미지로 IP 보호만 활성화해요. 인증 상태가 새로 생긴 뒤에는 IP 변수를 끈 같은 SHA를 우선 복구 대상으로 사용해요. 최초 인프라 전환이 실패하면 직전 앱·nginx·프론트와 Redis 설정·인증으로 복귀하며 새 내부망은 롤백 확인 전에 제거하지 않아요. 격리 프록시 검사는 `RESERVE_PROXY_INTEGRATION=true python3 scripts/tests/ip_protection_test.py ProxyIntegrationTest`예요.

## 관련 코드

- [CI](../../.github/workflows/CI.yml) · [CD](../../.github/workflows/CD.yml)
- [Nginx 설정](../../nginx)
- [화면 전환 도구](../../scripts/domain-release.sh)
