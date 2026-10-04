# 배포 운영

릴리즈 노트 동기화, GitHub Deployments 기록, CI 구조, 배포 후 점검과 롤백 절차예요.

모든 명령은 **레포 루트에서 `gh` 로그인 상태**로 실행해요. 대상 저장소는 `REPO` 환경변수로 바꿀 수 있어요(기본 `hanjeun/reserve`).
버전별 변경 내용은 [업데이트 소식](../CHANGELOG.md)을 봐요.

## 기본 규칙

- 커밋, PR, merge, tag, 배포, GitHub 설정 변경, 운영 쓰기는 **각각 현재 대화에서 별도 승인**을 받아요.
- `sync-release-notes.mjs --apply`는 릴리스 승인 뒤에 실행해요.
- 배포 직전에는 서버 SSH fingerprint를 별도 경로로 확인해요.
- 의존성 PR과 제품 통합은 분리해요.

## 릴리즈 순서

1. `dev` → `main` release PR을 **Squash and merge**로 머지해요.
2. [dev를 main에 맞추는 PR](../rules/git-workflow.md#릴리즈-후-dev-맞추기)을 올려요.
   ```bash
   git merge -s ours origin/main -m "chore: sync dev with vX.Y.Z release"
   ```
3. `gh release create`로 릴리즈를 먼저 만들어요. 릴리즈가 없는 버전은 동기화 스크립트가 건너뛰어요.
4. [릴리즈 노트를 동기화](#1-릴리즈-노트-동기화-changelog--github-릴리즈)해요.
5. `main` push로 CI/CD가 배포하면 [배포 직후 서버 작업](#4-배포-직후-서버-작업)을 진행해요.

브랜치별 머지 방식은 [Git 워크플로우](../rules/git-workflow.md)를 따라요.

## CI 잡 구조

`.github/workflows/CICD.yml`은 `main` push, `main`·`dev` 대상 PR, 수동 실행에서 돌아요. 배포 잡은 `main` push에서만 실행돼요.

| 잡 | 선행 | 하는 일 |
|---|---|---|
| `test-backend` | — | 백엔드 unit·Spring/H2 통합 테스트 |
| `test-frontend` | — | 문서 링크·Grafana·스냅샷·운영 스크립트 검사, ESLint, 품질 정책, Vitest, PC·모바일 Playwright |
| `build-frontend` | `test-frontend` | Vite 빌드 후 이 실행의 dist 아티팩트 업로드 |
| `build-backend` | `test-backend`, `build-frontend` | 같은 실행의 HTML을 포함한 bootJar, main에서 Docker 이미지 push |
| `stage-release` | `build-backend`, `build-frontend` | 아티팩트를 서버 `releases/<SHA>`에 staging. live는 바꾸지 않아요 |
| `deploy-backend` | 위 전부 | 새 서버 기동, 준비 확인, 원자 전환, smoke, 실패 복구 |

- 브랜치 보호의 필수 체크는 `build-backend`·`build-frontend`예요.
- `production` Environment는 `deploy-backend` 하나에만 둬요.
- `deploy-backend`는 공개 가게 목록 GET 준비 확인(2회 연속 2.5초 미만)이 실패하면 구 운영 경로를 유지해요.
- Actions는 전체 커밋 SHA로 고정해요.
- CI에서만 Vitest/Playwright 워커를 2개 써요(로컬은 1개). Playwright trace는 첫 재시도에만 수집해요.
- 2026-10-04부터 Sonar 자동 실행과 커버리지 80% 목표를 맞추기 위한 반복 테스트·빌드·PR을 중지해요.
  일반 CI는 커버리지 계측 없이 기존 테스트를 실행하고 필수 빌드·보안 검사는 유지해요.
  `.github/workflows/sonar.yml`은 요청한 수동 `workflow_dispatch` 정적 분석에만 사용해요.
  분석 입력을 컴파일하지만 테스트 실행이나 커버리지 수집을 추가하지 않아요.

### 테스트 증거 재사용

`scripts/ci-evidence.mjs`는 7일 이내 성공한 같은 저장소 CICD 실행의 테스트 증거를 재사용해요.

- 소스·테스트·잠금 파일·공유 스크립트·워크플로의 Git blob과 Node/JDK·러너 이미지·설정 리비전이 모두 같을 때만 재사용해요.
- 조건이 맞지 않거나 오류가 나면 정상 테스트 실행으로 돌아가요.
- 재사용 대상은 백엔드 unit/Spring-H2와 프론트 unit/PC·모바일 Chromium 검사예요. build와 운영 smoke는 매번 실행해요.
- 수동 `workflow_dispatch` 또는 저장소 변수 `CI_FORCE_TESTS=true`는 재사용을 꺼요. 테스트 환경 설정이 바뀌면 `CI_TEST_CONFIG_REVISION`을 올려요.

### API v1과 프론트 동시 릴리스

v2.8.6부터 같은 SHA의 백엔드와 프론트를 함께 배포해 API v1을 사용해요.
백엔드는 기존 `/api/*`와 `/api/v1/*`를 같은 컨트롤러·권한·본문 계약으로 제공하고,
CI 프론트 빌드는 `VITE_API_VERSION=v1`을 사용해 공통 axios 요청 관문에서 경로를 전환해요.
새 백엔드 준비 확인 후 그 릴리스의 프론트를 활성화하는 기존 원자적 배포 순서를 유지해요.
API v1 전환은 아래 v2.8.6 운영 이력부터 적용돼요.

기존 `/api/*`는 열린 구 화면·PG 웹훅·CSP 수집과 호환되도록 유지해요.
OAuth·헬스 체크 경로는 그대로이며, 지원하지 않는 숫자 API 버전은 JSON 404를 반환해요.

### nginx 지연 로그

- route 종류·HTTP 상태·전체/연결/헤더/상류 응답 시간만 기록해요. IP·동적 ID·쿼리·쿠키·토큰·본문은 넣지 않아요.
- `request_time`과 `upstream_*_time`으로 브라우저/CDN 대기와 앱/DB 대기를 구분해요.

## 1. 릴리즈 노트 동기화 (CHANGELOG → GitHub 릴리즈)

`docs/CHANGELOG.md`의 버전별 사용자 요약을 각 GitHub 릴리즈 설명 상단에 `<!-- changelog:start/end -->` 마커로 감싸 얹어요. 다시 돌려도 중복되지 않아요.

```bash
# 전체 미리보기 (아무것도 바꾸지 않음)
node scripts/sync-release-notes.mjs

# 전체 반영
node scripts/sync-release-notes.mjs --apply

# 특정 버전만
node scripts/sync-release-notes.mjs v1.13.0 --apply
```

## 2. GitHub Deployments (배포 이력 기록)

`deploy-backend` 잡은 `environment: production`을 쓰고, GitHub가 Deployment와 상태를 자동으로 기록해요. `production`의 배포 브랜치 정책은 `main`만 허용해요.

### 2-1. 기록 확인

```bash
# 코드: main 전용 stage/활성화와 자동 Environment 기록
rg -n "stage-release:|deploy-backend:|environment:|production|deployments:" .github/workflows/CICD.yml

# 원격: 최신 production 배포와 상태
gh api --method GET repos/hanjeun/reserve/deployments -f environment=production \
  --jq '.[0] | {id,sha,created_at}'
gh api repos/hanjeun/reserve/deployments/<id>/statuses \
  --jq '.[0] | {state,created_at,environment_url}'
```

### 2-2. v2.8.5 배포 확인 (2026-10-03)

릴리스 PR #299를 squash로 머지한 main `c999f6369a098b755cdb8cc9fcd9a32d3c41c766`의
[CI/CD 실행](https://github.com/hanjeun/reserve/actions/runs/37128806865)이 성공했어요.
23:16 KST green 앱·nginx upstream·공개 `release-id.txt`가 같은 SHA를 가리키는 것을 확인했어요.
Actuator health `UP`, 읽기 전용 배포 verifier, 새 heartbeat와 사진 집계의 원본·Loki 수집을
확인했어요. DB 보정이나 스키마 변경은 이번 배포에서 실행하지 않았어요.

릴리스 직후 dev와 main의 파일이 같은지 확인하고 `merge -s ours`로 squash 계보를 연결했어요.
후속 정리는 dev 대상 PR로 검증하며, 운영 배포와 관측 결과는 [모니터링 런북](monitoring.md)을 따라요.

### 2-3. v2.8.6 배포 확인 (2026-10-04)

제품 통합 PR #304와 릴리스 PR #305를 거친 main `3199e48fb9aa6f8c5204c946ec2382487f4c22a0`의
[CI/CD 실행](https://github.com/hanjeun/reserve/actions/runs/37144813467)이 성공했어요.
blue 앱·nginx upstream·공개 `release-id.txt`가 같은 SHA를 가리키고, health는 `UP`예요.
앱 계정은 `reserve_app`, 스키마 모드는 `validate`를 유지해요.

기존 `/api/stores`와 `/api/v1/stores`의 공개 목록·정렬 결과가 같았어요.
없는 가게 5·1000000과 지원하지 않는 `/api/v2/stores`는 404,
미인증 회원 조회는 기존·v1 모두 401로 끝났어요. 브라우저에서도 두 가게 주소는
가게 없음 안내·목록 이동, 없는 화면 주소는 404 안내·홈 이동을 표시했어요.

앱 계정의 원문 LIKE·MATCH+LIKE와 공개 API의 검색 표본은 모두 2행이었어요.
ngram 크기 2·다섯 컬럼 FULLTEXT를 확인했고, 새 앱의 FULLTEXT 폴백 경고는 없었어요.
인덱스 적용 이력·복구 사본은 [`manual-ddl.md`](manual-ddl.md)를 따라요.

릴리스와 main CI는 입력이 같은 성공한 단위·PC·모바일 검사 증거를 재사용했어요.
필수 빌드와 CodeQL은 통과했고 자동 Sonar는 실행하지 않았어요.
릴리스 이름은 `v2.8.6`이며 설명은 CHANGELOG와 동기화했어요.
main과 dev의 파일이 같은 것을 확인한 뒤 `merge -s ours`로 squash 계보를 연결했어요.

### 2-4. v2.8.7 배포 확인 (2026-10-04)

제품 PR #307·#308·#309와 릴리스 PR #310을 거친 main
`c1c08d8b9e197f198e5383746e5a1a389d1b81bb`의
[CI/CD 실행](https://github.com/hanjeun/reserve/actions/runs/37192806934)이 성공했어요.
green 앱·nginx upstream·공개 `release-id.txt`가 같은 SHA를 사용하며 health는 `UP`예요.
제한된 `reserve_app`과 `validate`를 유지하고, 새 모델 34개의 배포 전 대조도 통과했어요.

채팅 파일명·신고 보존 분류·감사 기록·웨이팅 DDL은 보호된 덤프 후 먼저 적용했고,
기존 컬럼 해시는 전후 같아요. 상세는 [수동 DDL 9·10절](manual-ddl.md)을 따라요.
18:44:15 KST 공개 개인정보처리방침과 배포된 고지 내용을 확인한 뒤 실제 게시 확인 시각을 등록했어요.
같은 이미지의 환경 중 보존 설정 다섯 항목만 반영하고, 나머지 환경과 이미지가 같은지 확인했어요.
공개 정책 API는 90일 보관·30일 유예·2026-11-03 18:44:15 KST 적용 시작을 반환했어요.
`enabled=true`, `active=false`로 유예 중이며 채팅·신고 파기는 아직 실행되지 않아요.

릴리스·main CI는 같은 입력의 성공한 단위·브라우저 검사 증거를 재사용했어요.
필수 빌드와 CodeQL은 통과했고 Sonar는 실행하지 않았어요.
릴리스 제목은 `v2.8.7`이며 한국어 설명은 CHANGELOG와 동기화했어요.
main과 dev의 배포 파일이 같은 것을 확인하고 `merge -s ours`로 squash 계보를 연결해요.

## 3. 저장소 보호 & PR/브랜치 정리

### 3-1. 브랜치 보호 (main / dev)

- `main`·`dev` 모두 `build-backend`·`build-frontend`를 필수 체크(strict)로 요구하고, 관리자에게도 적용해요.
- `main`은 PR 필수, 선형 히스토리 강제, 강제 push·삭제 차단이에요.
- `contexts`에는 PR에서 실제로 도는 잡만 넣어요.

```bash
gh api repos/hanjeun/reserve/branches/main/protection
gh api repos/hanjeun/reserve/branches/dev/protection
```

설정 예시(gh CLI, PowerShell here-string):

```powershell
@'
{
  "required_status_checks": { "strict": true, "contexts": ["build-backend", "build-frontend"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
'@ | gh api --method PUT repos/hanjeun/reserve/branches/main/protection --input -
```

### 3-2. 머지된 head 브랜치 자동 삭제

```bash
gh api --method PATCH repos/$REPO -f delete_branch_on_merge=true
```

이미 머지됐지만 남아 있는 브랜치 정리:

```bash
git fetch --prune
git branch --merged main | grep -vE '^\*|main|dev|local-preview-all-changes' | xargs -r -n1 git branch -d
git push origin --delete <branch>   # 원격 브랜치 삭제(필요한 것만)
```

### 3-3. Dependabot

메이저 업그레이드 PR은 닫지 않고 코멘트로 무시를 지시해요.

```bash
gh pr comment 79 -R $REPO --body "@dependabot ignore this major version"
gh pr comment 76 -R $REPO --body "@dependabot ignore this major version"
```

마이너/패치 PR은 승인 뒤 직접 머지해요. dev 대상은 merge commit, main 릴리스는 squash를 사용해요.

```bash
gh pr list -R $REPO --label dependencies       # 목록 확인
gh pr merge <번호> -R $REPO --merge
```

## 4. 배포 직후 서버 작업

### 4-0. DB 구조와 운영 큐 읽기 전용 점검

앱이 새 버전으로 기동한 뒤 `verify-post-deploy-readonly.sh`를 서버에서 실행해요. 환경 파일에는 `DB_PASSWORD`가 있어야 해요.

```bash
scp scripts/verify-post-deploy-readonly.sh scripts/verify-mysql-row-lock.sh ubuntu@<server>:/tmp/
ssh ubuntu@<server>
sudo install -m 0755 /tmp/verify-post-deploy-readonly.sh /usr/local/bin/reserve-post-deploy-verify
sudo install -m 0755 /tmp/verify-mysql-row-lock.sh /usr/local/bin/reserve-mysql-row-lock
sudo RESERVE_VERIFY_ENV=/etc/reserve-backup.env RESERVE_VERIFY_PREVIEW_SCHEMA=1 \
  /usr/local/bin/reserve-post-deploy-verify
```

v2.8.4부터 `RESERVE_VERIFY_PREVIEW_SCHEMA=1`로 광고·채팅의 추가 구조도 검사해요.

읽는 항목:

- `payment_webhook_inbox`, `payment_reconciliation_issue`, `file_deletion_task`,
  `oauth_unlink_task`, `marketing_consent_history` 테이블과 필수 인덱스
- `reservation.checked_in_at`, `member.auth_version` 컬럼
- 관련 테이블의 InnoDB 엔진 여부
- 7일 넘은 `READY`, 열린 대사 건, 미완료 웹훅, 실패한 S3/OAuth outbox, 결제 장부·예약금 플래그 불변식 위반 건수

| 종료 코드 | 뜻 |
|---|---|
| `0` | 구조와 큐 정상 |
| `1` | 구조 오류 |
| `2` | 구조는 정상이지만 수동 확인할 큐 존재 |

`2`가 나오면 오래된 `READY`를 PortOne 콘솔과 대조하고, 관리자 패널의 **재확인**은 별도 승인 뒤 실행해요.

MySQL 행 잠금 점검은 선택한 결제 행을 약 5초간 `FOR UPDATE`로 잠가요. 트래픽이 없는 TEST 결제 ID로 승인된 점검 창에서 실행하고, 두 번째 세션이 lock wait timeout으로 막히면 통과예요.

```bash
sudo RESERVE_VERIFY_ENV=/etc/reserve-backup.env \
  /usr/local/bin/reserve-mysql-row-lock <idle-test-payment-id>
```

### 4-1. CSP 위반 관측

`nginx/default.conf`의 CSP는 **Report-Only**로 나가요. 위반 보고는 `POST /api/csp-reports`로 들어오고, 서버는 지시문 종류와 차단된 URI의 scheme만 `CSP violation observed` 로그로 남겨요.

1. 배포 후 https://reserve.it.kr 에서 개발자도구 콘솔을 열고 **PC와 실제 모바일에서 주요 화면을 한 바퀴 돌며**
   `[Report Only]` 경고를 모아요.
   → 홈 / 가게 목록 · 검색 / 가게 상세(**카카오맵이 뜨는 화면**) / 예약 · **결제** / 로그인(소셜 3사) /
     마이페이지 이미지 업로드 · 미리보기 / 관리자 패널
2. Loki에 `reserve` 스트림이 들어오는지 확인한 뒤 아래 쿼리로 위반을 봐요.

   ```logql
   {job="reserve"} |= `CSP violation observed`
   ```

3. 수동 시나리오를 모두 통과하고 **최소 7일** 동안 설명되지 않는 위반이 없으면 헤더명에서 `-Report-Only`를 지우는 별도 PR을 만들어요.
4. 경고가 있으면 필요한 출처만 해당 지시문에 추가해요. script-src에는 `unsafe-inline`을 넣지 않아요.

### 4-2. 가게 검색 FULLTEXT 후보 방식

10/2 격리 MySQL 8.0.45의 순수 MATCH 실험은 다중 단어와 `%` 결과 차이 때문에 당시 활성화를 보류했어요.
새 구현은 기본 `fulltext-enabled=true`지만 MySQL·ngram 크기 2·정확한 다섯 컬럼의 ngram 인덱스를
처음 한 번 확인한 뒤에만 MATCH 후보를 사용해요. 후보에 원문 LIKE와 같은 공개 필터·정렬을 적용하고,
독립 repeatable-read 조회에서 count가 같을 때만 반환해요. 누락·미설치·실행 오류는 LIKE로 돌아가요.
동등성용 LIKE count 비용을 유지하므로 속도 향상을 약속하지 않아요.

2026-10-04 02:30:57 KST 전후 승인된 `reserve_ddl` 계정으로 운영 `ft_store_search` ngram 인덱스를 설치했어요.
ngram 크기 2·InnoDB·정확한 다섯 컬럼의 FULLTEXT와 기존 가게 3행 유지, MATCH 실행 성공을 확인했어요
(해당 조회 0행). 원래 구조·행의 보호된 백업과 적용 이력은 [`manual-ddl.md`](manual-ddl.md)에 있어요.
v2.8.6 blue 앱으로 후보 검색 기능을 배포했어요. 앱 계정의 원문 LIKE·MATCH+LIKE와
공개 API 검색 표본은 모두 2행이었고, 새 앱의 FULLTEXT 폴백 경고는 없었어요.
미설치 판정은 캐시하므로 실행 중 설치했다면 새 앱 기동 때 다시 탐지해요.
실행 SQL과 접속 절차는 [`manual-ddl.md`](manual-ddl.md)를 따라요. 백업 계정으로 관리자 SQL에 접속하지 않아요.

### 4-3. nginx 로그 수집

운영 nginx는 호스트의 `/var/log/nginx`에 로그를 남기고 Alloy가 Loki로 전송해요.
2026-10-02 수집을 Alloy로 전환했으므로 옛 Promtail을 다시 시작하지 않아요.
설정·positions 보존과 롤백은 [`monitoring.md`](monitoring.md)의 "Alloy 운영 전환"을 따라요.

확인: Grafana에서 `{job="nginx"}`를 조회하고 같은 시각의 원본 access 로그와 대조해요.

### 4-4. 알림 규칙

Contact point의 **Test**로 수신을 확인한 뒤 [모니터링](monitoring.md)의 "알림 규칙"대로 규칙을 만들어요.

## 5. 프론트엔드 원자적 배포와 롤백

프론트는 새 백엔드가 준비된 뒤에 live로 바뀌어요.

1. `stage-release`가 dist 아티팩트를 `/usr/share/nginx/html/releases/<commit-sha>`에 staging하고 SHA별 nginx 템플릿을 보관해요. `current` symlink, nginx 설정, backend upstream은 바꾸지 않아요.
   - `scripts/preserve-frontend-assets.sh`가 live와 보존된 릴리스 하나의 해시 자산을 새 staging에 복사해요.
   - `reserve-assets.sha256`은 각 릴리스의 원래 파일만 기록해요.
   - 파일명이 같은데 SHA-256이 다르면 배포를 중단해요.
2. `deploy-backend`가 nginx의 `service-env.inc`로 live upstream을 읽고 health를 확인한 뒤, 반대편 Blue/Green 컨테이너를 SHA 이미지로 기동해요. 새 컨테이너의 loopback health가 통과해야 다음 단계로 가요.
3. 전환 직전 `default.conf`, `service-env.inc`, `current` 포인터를
   `/home/ubuntu/release-rollback-<새 commit-sha>-<run-id>-<run-attempt>/`에 저장해요.
4. nginx 후보에 새 프론트의 **SHA 절대 경로**와 새 backend upstream을 함께 넣고, `nginx -t`가 통과하면 `current` 포인터를 갱신한 뒤 nginx를 **한 번만 reload**해요.
5. nginx를 거치는 HTML·정적 asset·공개 API smoke가 성공하면 구 backend를 정지하고 오래된 릴리스를 정리해요.
6. health, 후보 검사, reload, smoke 중 하나라도 실패하거나 실행이 취소되면 저장한 두 nginx 파일과 프론트 포인터를 복원하고 새 backend를 제거해요.

- 자동 정리는 현재 프론트와 최신 두 릴리스 디렉터리만 보존해요.
- 배포 워크플로는 호스트 전체 `docker image/system prune`을 실행하지 않아요.

### 수동 롤백

nginx `root`가 SHA 절대 경로에 고정되므로 두 nginx 파일을 함께 복구해요.

1. 대상 SHA와 현재 upstream을 읽기 전용으로 확인하고 별도 승인을 받아요.
2. 해당 실행의 rollback 디렉터리에서 `default.conf`와 `service-env.inc`를 함께 복구해요.
3. `nginx -t` 뒤 한 번 reload해요.

로컬 회귀 검사는 `bash scripts/test-frontend-release-swap.sh`와 `bash scripts/test-frontend-assets.sh`예요.

### TLS 갱신과 원본 가게 HTML

2026-10-02부터 Certbot의 HTTP-01은 nginx의 `/.well-known/acme-challenge/` webroot로 처리해요.
기존 nginx 정지·시작 pre/post 훅은 원본 보관함으로 옮겼고, 갱신 후 reload 훅은 유지해요.
세 도메인 challenge 읽기, 두 인증서의 staging 갱신과 deploy 훅, 별도로 복원한 인증서·키의
일치·체인은 통과했어요. 실제 새 운영 인증서 발급과 staging 시험은 구분해요.
원본과 복원 자료는 `/var/backups/reserve-scripts/20261002-before-tls-webroot/`(root 전용)에 있어요.

가게 상세 원본 HTML은 같은 실행의 frontend-release 아티팩트를 백엔드 JAR에 동봉해 만들어요.
패키징은 프론트 빌드 성공 후 진행하며 HTML 없이 만든 JAR는 거부해요. 공개 가게 조회 정책,
HTML 이스케이프, 공개 썸네일 경로 검사를 거친 이름·설명·사진을 넣고 기존 SPA 자산은 보존해요.
삭제·정지 가게는 404·noindex로 응답해요. 이 변경의 운영 적용은 해당 릴리스 배포에 포함돼요.
