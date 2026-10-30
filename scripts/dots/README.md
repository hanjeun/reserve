# dots 감지 입력 관문

중앙 감지·보고는 dots가 맡고 실시간 차단·즉시 임계값 대응은 서버의 결정적 규칙이 맡는다. 이 폴더는 제한된 입력과 공개 의존성 조회 코드다. 실제 dots 스케줄, HTTPS/SSM 연결, 서버 설치, IAM·SSH·Grafana 권한은 등록하지 않는다.

## RESERVE 읽기 전용 gateway

gateway.mjs는 Linux의 로컬 고정 실행 진입점이다. HTTP 서버나 임의 원격 셸을 제공하지 않는다. 표준 입력의 단일 JSON만 받으며 CLI 인자, command, SQL, path, env, URL 입력은 거부한다.

| action | 반환 범위 |
|---|---|
| reserve.snapshot.v1 | 활성 blue/green SHA 태그, 내부 health, 고정 컨테이너 상태, 허용 호스트 지표, app/marketing/legacy 릴리스 포인터, 로그 파일 갱신 나이 |
| reserve.verify_counts.v1 | 기존 verifier의 결제·웹훅·삭제·OAuth unlink·정합성 집계 8개 |
| reserve.alloy_start_once.v1 | 항상 DENIED / WRITE_CAPABILITY_NOT_GRANTED; 실행 코드와 쓰기 권한 없음 |

verifier stdout/stderr, DB 행·식별자, 컨테이너 환경, 키, 파일 경로, 원문 로그는 반환하지 않는다. 어댑터 뒤에도 고정 필드 투영 관문이 있어 추가 필드가 외부 JSON으로 흐르지 않는다. 모니터링 대상의 변경은 하지 않으며 로컬 요청 감사 기록만 쓴다.

요청 필드는 모두 필수다. 추가 필드는 거부한다.

~~~json
{
  "schemaVersion": 1,
  "action": "reserve.snapshot.v1",
  "requestId": "6c3c8310-2915-43a0-9e22-aa5ab0f9f10e",
  "issuedAt": "2026-10-23T00:00:00.000Z",
  "ttlSeconds": 60,
  "expectedRelease": "0000000000000000000000000000000000000000",
  "configHash": "0000000000000000000000000000000000000000000000000000000000000000"
}
~~~

issuedAt은 UTC, TTL은 1~300초이며 30초를 초과한 미래 시각도 거부한다. configHash는 contracts.mjs의 digest(config)에 따른 키 정렬 JSON SHA-256이다. expectedRelease는 설치 구성과 실제 활성 컨테이너의 sha-40hex 태그가 모두 일치해야 한다. 조회 전후 활성 upstream/SHA가 달라져도 UNKNOWN이다. SHA 태그 확인은 이미지 서명·빌드 출처 증명을 대체하지 않는다.

| 대상 | 고정 위치 및 조건 |
|---|---|
| 구성 | /etc/reserve-dots/agent.json, root 소유 일반 파일, 그룹/기타 쓰기 금지 |
| verifier | /usr/local/bin/reserve-post-deploy-verify, root 소유 일반 파일, 구성의 verifierSha256 일치 필수 |
| verifier 자격 구성 | /etc/reserve-dots/verifier.env, root 소유 0600 일반 파일, 전용 읽기 전용 DB 역할 필요 |
| 요청 ledger | /var/lib/reserve-dots, root 소유 0700, UUID별 원자적 claim 및 완료 결과 |

config.example.json은 기본 비활성이다. 실제 구성·고정 실행 파일·보호된 verifier·로컬 권한이 없으면 실행 성공을 반환하지 않는다. 기존 verifier 계약을 재사용하되 자격 파일은 고정된 전용 구성으로만 지정한다. 전용 SELECT 계정 준비와 실제 권한 검증은 설치 시 별도 승인 대상이다. 백업 계정/root 계정을 자동 사용하지 않는다. 원격 요청은 verifier 환경 변수와 자격 파일 위치를 바꿀 수 없다.

전용 자격 구성은 DB_NAME=reserve, MYSQL_CONTAINER=mysql, DB_USER=reserve_dots_reader와 DB_PASSWORD의 네 키만 허용한다. 모든 키가 필요하며 중복 키·추가 키·셸 표현식은 거부한다. 값은 단순 문자열 또는 단일 인용 문자열이며 비밀번호는 20자 이상이어야 한다. 구성 검사 결과만 사용하고 값은 반환하지 않는다. 계정 이름 제한은 실제 MySQL GRANT 검증을 대체하지 않는다.

같은 UUID/동일 입력은 DUPLICATE이며 다시 읽지 않는다. UUID/다른 입력은 거부한다. 실행 전 IN_PROGRESS를 기록하고 완료 시 outcome을 갱신한다. 중간 종료 후 같은 요청을 재실행해 성공을 꾸미지 않는다. ledger는 10,000개 상한에서 거부하며, 보존·보관 정책은 운영 등록 전에 정해야 한다. 삭제·회전은 자동 실행하지 않는다. 파싱·쓰기·구성 거부는 auditRecorded:false, claim 이후 결과만 true이며 외부 전송 계층은 거부 요청 감사도 별도로 준비해야 한다.

OBSERVED는 해당 고정 집계가 수집됐다는 뜻이고 전반 운영 안전을 뜻하지 않는다. 0개 집계는 verifier 정상 종료와 전체 필드 일치가 확인된 경우에만 숫자 0으로 반환한다. 실행 실패·누락·계약 불일치는 UNKNOWN, counts는 null이다. 대기 삭제 건수만 있는 경우 기존 verifier의 경고 계약을 유지한다.

기존 호스트 지표에는 샘플 시각·명령 성공 표식이 없고 실패 기본값 0이 존재한다. 따라서 숫자는 허용 목록으로 제공하되 METRIC_SAMPLE_VALIDITY_UNVERIFIED로 남긴다. 오래되거나 불완전한 지표는 값도 null이다. 로그 파일 mtime과 컨테이너 running은 Loki 수집 연속성을 증명하지 않는다. remoteIngestionVerified, offsiteBackupVerified, restoreVerified는 이 관문에서 항상 false다. 원문 조회나 PG·웹훅·outbox 재처리, 백업·복원, 재시작·롤백은 제공하지 않는다.

클라우드에서 호출하려면 인증된 고정 HTTPS 어댑터 또는 승인된 고정 SSM 문서와 특정 노드 권한을 별도로 준비·검증해야 한다. 범용 RunShellScript, 임의 command, root 셸, 광범위 IAM 권한으로 연결하지 않는다. 현재 반환의 transportVerified:false는 실제 연결 검증이 없음을 표시한다.

## 후보 의존성 목록과 명시적 OSV 조회

Node 22.23.4 이상에서 외부 패키지 설치 없이 동작한다.

~~~text
node scripts/dots/scan.mjs all
node scripts/dots/scan.mjs reserve --scan
node scripts/dots/scan.mjs all --scan --remember
~~~

첫 명령은 네트워크와 상태 파일 쓰기를 하지 않는다. 프로젝트 enum은 all, reserve, kiwoom, hktech뿐이다. 경로·URL·환경 변수 옵션을 받지 않는다. 입력은 현재 RESERVE와 고정 형제 프로젝트의 공개 잠금/빌드 파일뿐이며 다른 프로젝트 파일을 수정하지 않는다.

| 입력 | 표시하는 증거와 제한 |
|---|---|
| RESERVE npm/Gradle lock | 정확한 잠금 버전, runtime/build/dev/test 사용 범위, 입력 SHA-256 |
| RESERVE 현재 버전 JAR·프론트 entry | 파일 존재와 해시, 소스 연결·실제 배포 여부 미확인 |
| Kiwoom requirements pins | 검토된 공개 패키지의 정확한 선언 버전; 설치된 Python/OCX/전이 의존성 증거 아님 |
| HKTECH npm/Composer lock·static entry | 후보 목록과 산출물 해시; 실제 공개 배포 증거 아님 |

모든 로컬 입력은 deploymentScope:candidate다. production 목록은 실제 배포 산출물·서버 인벤토리가 연결되기 전까지 unverified다. 사용 범위 runtime과 배포 범위 production은 서로 다른 필드다. OS·컨테이너 베이스, 설치 런타임, 브라우저·OCX 및 Python 전이 패키지는 전체 수집 범위에 포함하지 않는다. 잠금 파일 자체가 오래된 빌드·운영 이미지와 같다는 가정을 하지 않는다.

npm은 공개 npm registry의 해당 패키지 경로, Composer는 Packagist 표식, Maven/PyPI는 코드의 검토된 공개 그룹/패키지 목록이 있어야 조회 대상이 된다. private/workspace/VCS URL·범위 버전·미검토 패키지는 이름·버전·경로를 외부로 보내지 않고 제외 개수만 표시한다. 새 공개 그룹/패키지는 목록의 코드 검토가 필요하다. 원본 lock, URL, 프로젝트 이름, 자격, 경로, 해시는 OSV 요청에 들어가지 않는다.

--scan에서만 고정 https://api.osv.dev/v1/querybatch로 ecosystem/name/version을 보낸다. pagination의 불투명 page token과 공개 advisory ID 조회도 같은 api.osv.dev에만 보낸다. redirects는 거부한다. 상한은 batch 100개, 요청 10초, 응답 2 MiB, query당 10페이지, 총 패키지 10,000개, advisory 500개, 요청 650회다. 상한·timeout·429·JSON 오류·불완전 결과는 unknown이다. 미완료 조회를 0건으로 해석하지 않는다.

별칭을 합쳐 CVE/GHSA 중복을 억제하고 프로젝트·candidate/production을 분리한다. advisory 원문 summary/details는 출력하지 않는다. 공개 advisory ID, 별칭, 확인 가능한 severity, fixed version 자료, HTTPS 1차 reference를 데이터로 유지한다. reference URL을 따라가거나 advisory 내용으로 명령을 실행하지 않는다. fixed version은 업그레이드 호환성 검토 결과가 아니다. API 계약은 [OSV querybatch](https://google.github.io/osv.dev/post-v1-querybatch/)와 [advisory 조회](https://google.github.io/osv.dev/get-v1-vulns/)를 따른다.

severity는 OSV가 반환한 평가이며 severitySource로 필드 출처를 advisory·별칭 집계·경고·event에 보존한다. 공급자 공식 공지와 OSV/GHSA의 등급이 다를 수 있다. 다른 출처의 낮은 등급으로 덮어쓰지 않으며 applicability:NOT_ASSESSED를 유지한다. 실제 서비스 도달성·설정·노출 조건 검토는 별도 필수 판단이다.

--remember는 현재 실행 사용자의 고정 홈 아래 .codex/state/dots-cve/state.json에 경고 상태만 원자적으로 저장한다. 임의 경로는 받지 않는다. 파일 잠금으로 동시 writer를 차단하고 잘못된 상태 파일은 초기화하지 않는다. 새 취약점, 계속 영향을 받는 버전 변경, severity 상향, 확인된 해결/재발, 수집 상태 변화만 event로 반환한다. 동일 상태는 조용히 유지한다. alias가 추가되어도 같은 경고를 다시 열지 않는다. 실패 시 기존 severity와 reference를 보존한다.

상태 저장을 선택하지 않은 실행은 과거 경고를 알 수 없어 persistence:not-recorded다. 실제 중앙 감지에 쓰려면 승인된 실행 장치의 지속 상태 보존이 필요하다. 24시간이 지난 결과, 조회 오류, 일부 누락, PC offline, Kiwoom 데이터 부재는 기존 경고를 닫지 않는다. HKTECH는 실제 서비스 배포 확인 전 production health schedule을 만들지 않는다. 이 폴더는 dots/Codex automation이나 프로젝트 실행·broker 접속을 생성하지 않는다.

CLI exit code는 0=요청 범위 수집/조회 완료, 2=알려진 열린 경고, 1=거부/불명/불완전이다. 후보의 0건은 운영의 취약점 부재를 뜻하지 않는다.

## 격리 검사

tests/*.test.mjs는 Node test runner용 fixture/mock 검사다. gateway 호출은 메모리 ledger/provider, OSV는 mock fetch를 사용하며 운영·외부 네트워크·broker에 접속하지 않는다. 실제 source snapshot, 보호 파일 권한, 전용 DB 역할, 고정 transport와 실운영 수집·복구 증거는 별도 설치 검증 범위다.
