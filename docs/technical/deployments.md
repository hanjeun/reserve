# 배포 운영

릴리즈 노트 동기화, GitHub Deployments 기록, CI 구조, 배포 후 점검과 롤백을 한곳에 모은 런북이에요.

모든 명령은 **레포 루트에서 `gh` 로그인 상태**로 실행해요. 대상 저장소는 `REPO` 환경변수로 바꿀 수 있어요(기본 `hanjeun/reserve`).
버전별 변경 내용은 [업데이트 소식](../CHANGELOG.md), 기능별 상태는 [현재 상태](current-status.md)를 봐요.

## 기본 규칙

- 커밋, PR, merge, tag, 배포, GitHub 설정 변경, 운영 쓰기는 **각각 현재 대화에서 별도 승인**을 받아요.
- `sync-release-notes.mjs --apply`와 `backfill-deployments.mjs --apply`도 외부 GitHub 기록을 바꾸니 릴리스 승인 뒤에만 실행해요.
- 배포 직전에는 실제 서버 SSH fingerprint를 신뢰할 수 있는 별도 경로로 다시 확인해요.
- 의존성 PR과 제품 통합은 분리해요.

## 릴리즈 순서

1. `dev` → `main` release PR을 **Squash and merge**로 머지해요. `main`은 선형 히스토리 강제라 merge commit을 받지 못해요.
2. squash로 끊긴 계보를 `dev`에 다시 이어요. 빼먹으면 다음 릴리즈 PR에서 이미 배포된 내용이 충돌로 되살아나요.
   ```bash
   git merge -s ours origin/main -m "chore: record vX.Y.Z release squash into dev"
   ```
3. `gh release create`로 릴리즈를 먼저 만들어요. 릴리즈가 없는 버전은 동기화 스크립트가 건너뛰어요.
4. [릴리즈 노트를 동기화](#1-릴리즈-노트-동기화-changelog--github-릴리즈)해요.
5. `main` push로 CI/CD가 배포하면 [배포 직후 체크리스트](#4-배포-직후-서버-작업-체크리스트)를 진행해요.

브랜치별 머지 방식은 [Git 워크플로우](../rules/git-workflow.md)를 따라요.

## CI 잡 구조

`.github/workflows/CICD.yml`은 `main` push, `main`·`dev` 대상 PR, 수동 실행에서 돌아요. 배포 잡은 `main` push에서만 실행돼요.

| 잡 | 선행 | 하는 일 |
|---|---|---|
| `test-backend` | — | 백엔드 unit·Spring/H2 통합 테스트 |
| `test-frontend` | — | 문서 링크·Grafana·스냅샷·운영 스크립트 검사, ESLint, 품질 정책, Vitest, PC·모바일 Playwright |
| `build-backend` | `test-backend` | bootJar, 롤백 스키마 호환 검사, Docker 이미지 push |
| `build-frontend` | `build-backend`, `test-frontend` | Vite 빌드 후 이 실행의 dist 아티팩트 업로드 |
| `stage-release` | `build-backend`, `build-frontend` | 아티팩트를 서버 `releases/<SHA>`에 staging. live는 바꾸지 않아요 |
| `deploy-backend` | 위 전부 | 새 서버 기동, 준비 확인, 원자 전환, smoke, 실패 복구 |

- 브랜치 보호의 필수 체크는 `build-backend`·`build-frontend`예요. 잡 이름을 바꾸지 않아요.
- `production` Environment는 실제 활성화 잡인 `deploy-backend` 하나에만 둬요. 자동 기록과 이중 생성되지 않도록 수동 `createDeployment`/상태 쓰기는 없어요.
- `deploy-backend`는 공개 가게 목록 GET 준비 확인(2회 연속 2.5초 미만)이 실패하면 구 운영 경로를 그대로 유지해요.
- Actions는 태그가 아니라 전체 커밋 SHA로 고정해요.

### 테스트 증거 재사용

`scripts/ci-evidence.mjs`는 7일 이내 성공한 같은 저장소 CICD 실행의 테스트 증거를 재사용해요.

- 소스·테스트·잠금 파일·공유 스크립트·워크플로의 Git blob과 Node/JDK·러너 이미지·설정 리비전이 모두 같아야 해요. 이전 실행의 Git tree를 다시 계산하고 ZIP의 SHA-256도 검증해요.
- fork·실패·취소·오래된 실행, API·권한·다운로드 오류는 모두 **정상 테스트 실행으로 복귀**해요. 워크플로가 바뀌면 증거가 무효화돼 전체 CI가 한 번 도는 것은 의도된 동작이에요.
- 재사용 대상은 백엔드 unit/Spring-H2와 프론트 unit/PC·모바일 Chromium 검사예요. 문서·운영 스크립트·스냅샷·lint·품질 정책은 매번 짧게 확인해요.
- build와 운영 smoke는 재사용하지 않아요. 실제 Safari·TEST 결제·S3·운영 DB 확인은 이 CI 증거의 대상이 아니에요.
- 수동 `workflow_dispatch` 또는 저장소 변수 `CI_FORCE_TESTS=true`는 재사용을 꺼요. 테스트 환경 설정이 바뀌면 `CI_TEST_CONFIG_REVISION`을 올려요.
- component는 `backend`·`frontend` 고정 설정만 받아요. 잘못된 mode/component는 명령 실행·파일 생성 전에 거부해요.

CI에서만 Vitest/Playwright 워커를 2개 써요(로컬은 1개). Playwright trace는 첫 재시도에만 수집하고, flaky는 성공으로 숨기지 않아요.

### nginx 지연 로그

- route 종류·HTTP 상태·전체/연결/헤더/상류 응답 시간만 기록해요. IP·동적 ID·쿼리·쿠키·토큰·본문은 넣지 않아요.
- `request_time`과 `upstream_*_time`으로 브라우저/CDN 대기와 앱/DB 대기를 구분해요.
- Promtail에 nginx 수집 job이 없으니 Loki 수집 성공을 전제하지 않아요([4-3](#4-3-nginx-로그를-실제-파일로-그냥-두면-loki-에-0건) 참고).

## 1. 릴리즈 노트 동기화 (CHANGELOG → GitHub 릴리즈)

`docs/CHANGELOG.md`의 버전별 사용자 요약을 각 GitHub 릴리즈 설명 상단에 얹어요.
자동 생성 PR 목록은 그대로 두고, 요약만 `<!-- changelog:start/end -->` 마커로 감싸 중복 없이 갱신해요.

```bash
# 전체 미리보기 (아무것도 바꾸지 않음)
node scripts/sync-release-notes.mjs

# 전체 반영
node scripts/sync-release-notes.mjs --apply

# 특정 버전만
node scripts/sync-release-notes.mjs v1.13.0 --apply
```

CHANGELOG를 고칠 때마다 다시 돌리면 릴리즈 설명이 최신 요약으로 바뀌어요(idempotent).

## 2. GitHub Deployments (배포 이력 기록)

`deploy-backend` 잡은 `environment: production`을 쓰고, GitHub가 이 잡의 Deployment와 상태를 자동으로 기록해요.
`production` Environment의 배포 브랜치 정책은 `main` 하나만 허용해요.

> 주의: 브랜치 보호와 Environment 관리자 우회(`can_admins_bypass`)는 서로 다른 설정이에요. 바꿀 때 각각 확인해요.

### 2-1. 태그 백필

기록이 없는 태그에만 Deployment(+success)를 만들어요. **시각은 '지금'으로 찍혀요**(과거 배포 시각이 아니라 기록용).

```bash
node scripts/backfill-deployments.mjs               # 미리보기 — 무엇을 만들지
node scripts/backfill-deployments.mjs --apply       # 빠진 것만 생성
node scripts/backfill-deployments.mjs --tag v2.2.0 --apply   # 특정 태그만
```

증분이라 몇 번을 돌려도 안전해요. 태그를 커밋 SHA로 풀어서 그 커밋에 배포 기록이 이미 있으면 건너뛰어요 — 기존 기록의 ref가 태그명이든 SHA든 상관없어요.

> 주의: `--reset`은 제거됐어요. CI/CD가 만든 진짜 기록까지 지웠고, GitHub API는 생성 시각을 지정할 수 없어 **진짜 배포 시각은 복구되지 않아요.**
> 스크립트가 만든 것만 지우려면 `--prune-backfilled`를 써요. `description`의 `backfilled-by-script` 표식으로 대상을 고르므로 CI/CD 기록은 건드리지 않아요.
>
> ```bash
> node scripts/backfill-deployments.mjs --prune-backfilled           # 미리보기
> node scripts/backfill-deployments.mjs --prune-backfilled --apply
> ```

### 2-2. 기록 확인

워크플로에 스텝이 있다는 사실만으로 기록 성공을 증명할 수 없고, Deployment 객체만으로 서버 health 성공을 증명할 수도 없어요. 코드와 원격 상태를 둘 다 봐요.

```bash
# 코드: main 전용 stage/활성화와 자동 Environment 기록
rg -n "stage-release:|deploy-backend:|environment:|production|deployments:" .github/workflows/CICD.yml

# 원격: 최신 production 배포와 상태
gh api --method GET repos/hanjeun/reserve/deployments -f environment=production \
  --jq '.[0] | {id,sha,created_at}'
gh api repos/hanjeun/reserve/deployments/<id>/statuses \
  --jq '.[0] | {state,created_at,environment_url}'
```

## 3. 저장소 보호 & PR/브랜치 정리

### 3-1. 브랜치 보호 (main / dev)

현재 규칙이에요. 바꾸기 전에 아래 조회 명령으로 실제 값을 먼저 읽어요.

- `main`·`dev` 모두 `build-backend`·`build-frontend`를 필수 체크(strict)로 요구하고, 관리자에게도 적용해요.
- `main`은 PR 필수, 선형 히스토리 강제, 강제 push·삭제 차단이에요.

```bash
gh api repos/hanjeun/reserve/branches/main/protection
gh api repos/hanjeun/reserve/branches/dev/protection
```

설정 예시(gh CLI, PowerShell here-string):

```powershell
@'
{
  "required_status_checks": { "strict": false, "contexts": ["build-backend", "build-frontend"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
'@ | gh api --method PUT repos/hanjeun/reserve/branches/main/protection --input -
```

> 주의: `contexts`에는 **PR에서 실제로 도는 잡**만 넣어요. `deploy-backend`는
> `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`라 PR에선 안 돌아서, 필수 체크로 걸면 모든 PR이 영영 막혀요.

> 주의: `required_pull_request_reviews`를 켜면 `main` 직접 push가 막히고 PR을 거쳐야 해요.

### 3-2. 머지된 head 브랜치 자동 삭제

UI: Settings → General → "Automatically delete head branches". gh CLI:

```bash
gh api --method PATCH repos/$REPO -f delete_branch_on_merge=true
```

이미 머지됐지만 남아 있는 브랜치 정리:

```bash
git fetch --prune
git branch --merged main | grep -vE '^\*|main|dev|local-preview-all-changes' | xargs -r -n1 git branch -d
git push origin --delete <branch>   # 원격 브랜치 삭제(필요한 것만)
```

### 3-3. Dependabot 메이저 무시 (예시)

메이저 업그레이드 PR은 닫지 말고 코멘트로 무시를 지시해요(향후 메이저 PR 재생성 방지).

```bash
gh pr comment 79 -R $REPO --body "@dependabot ignore this major version"
gh pr comment 76 -R $REPO --body "@dependabot ignore this major version"
```

안전한 마이너/패치 PR은 직접 머지한 뒤 3-2로 브랜치를 정리해요(`@dependabot merge`는 이 레포에서 반응하지 않아요).

```bash
gh pr list -R $REPO --label dependencies       # 목록 확인
gh pr merge <번호> -R $REPO --squash --delete-branch
```

## 4. 배포 직후 서버 작업 체크리스트

레포에는 있지만 **서버에서 손을 대야 비로소 동작하는 것들**이에요. 순서가 중요한 것만 모았고, 상세는 링크된 문서에 있어요.

### 4-0. DB 구조와 운영 큐 읽기 전용 점검

앱이 새 버전으로 정상 기동한 뒤 `verify-post-deploy-readonly.sh`를 서버에 복사해 실행해요.
백업 설정을 아직 만들지 않았다면 별도 root 전용 환경 파일에 `DB_PASSWORD`만 넣어도 돼요.

```bash
scp scripts/verify-post-deploy-readonly.sh scripts/verify-mysql-row-lock.sh ubuntu@<server>:/tmp/
ssh ubuntu@<server>
sudo install -m 0755 /tmp/verify-post-deploy-readonly.sh /usr/local/bin/reserve-post-deploy-verify
sudo install -m 0755 /tmp/verify-mysql-row-lock.sh /usr/local/bin/reserve-mysql-row-lock
sudo RESERVE_VERIFY_ENV=/etc/reserve-verify.env /usr/local/bin/reserve-post-deploy-verify
```

이 점검은 다음만 읽어요.

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

`2`가 나와도 스크립트는 아무 상태도 바꾸지 않아요. 오래된 `READY`는 먼저 PortOne 콘솔과 대조하고,
관리자 패널의 개별 **재확인**은 별도 승인 뒤 실행해요.

MySQL 잠금 실기는 일반 점검과 분리해요. `verify-mysql-row-lock.sh`는 선택한 결제 행을 약 5초간 `FOR UPDATE`로 잠그므로,
트래픽이 없는 TEST 결제 ID와 승인된 점검 창에서만 실행해요. 두 세션 모두 `ROLLBACK`하고, 두 번째 세션이 lock wait timeout으로 막혀야 통과예요.

```bash
sudo RESERVE_VERIFY_ENV=/etc/reserve-verify.env \
  /usr/local/bin/reserve-mysql-row-lock <idle-test-payment-id>
```

> 주의: 이 결과는 InnoDB 행 잠금의 증거일 뿐, 동시에 들어온 두 환불 중 PG 호출이 한 번만 나가는지는 증명하지 않아요.
> 그건 PortOne TEST 결제 두 요청 시나리오로 따로 확인해요.

### 4-1. CSP 위반 관측 (배포 즉시)

`nginx/default.conf`의 CSP는 **Report-Only**로 나가요 — 지금은 아무것도 차단하지 않아요.
브라우저 위반 보고는 `POST /api/csp-reports`로 들어오고, 서버는 URL·쿼리·문서 주소를 버리고
지시문 종류와 차단된 URI의 scheme만 `CSP violation observed` 로그로 남겨요.

1. 배포 후 https://reserve.it.kr 에서 개발자도구 콘솔을 열고 **PC와 실제 모바일에서 주요 화면을 한 바퀴 돌며**
   `[Report Only]` 경고를 모아요.
   → 홈 / 가게 목록 · 검색 / 가게 상세(**카카오맵이 뜨는 화면**) / 예약 · **결제** / 로그인(소셜 3사) /
     마이페이지 이미지 업로드 · 미리보기 / 관리자 패널
2. nginx → `app.log` → Promtail positions/labels → Loki에 `reserve` 애플리케이션 스트림이 실제로 들어오는지 먼저 확인해요.
   스트림이 없거나 다른 로그와 불일치하면 0건은 위반 없음이 아니라 관측 실패예요. 수집 경로를 복구한 뒤 아래 쿼리로 확인해요.

   ```logql
   {job="reserve"} |= `CSP violation observed`
   ```

3. 결제·지도·Sentry를 포함한 수동 시나리오를 모두 통과하고 **최소 7일** 동안 설명되지 않는 위반이 없을 때만
   헤더명에서 `-Report-Only`를 지우는 별도 PR을 만들어요. 콘솔 0건 한 번만으로 강제 전환하지 않아요.
4. 경고가 있으면 필요한 출처만 해당 지시문에 추가해요. **`unsafe-inline`을 script-src에 절대 넣지 않아요** —
   그 순간 CSP가 막아야 할 XSS를 전부 통과시켜요(style-src는 antd 때문에 어쩔 수 없어요).

> 주의: 결제는 PC에서 popup(`window.open`)이라 CSP 대상이 아니지만 **모바일은 리다이렉트/iframe** 경로라 다르게 동작해요. 모바일에서도 한 번 결제해 봐요.
> 자산 현지화가 끝나지 않아 쓰는 Unsplash 허용 출처는 실제 참조를 제거하고 다시 관측하기 전까지 지우지 않아요.

### 4-2. 가게 검색 FULLTEXT (순서 고정 — 뒤집으면 검색이 전부 500)

상세: [`manual-ddl.md`](manual-ddl.md)

```bash
# ① (권장) 먼저 백업
/usr/local/bin/reserve-backup

# ② DDL 적용
export DB_PASSWORD="$(sudo sh -c '. /etc/reserve-backup.env; printf %s "$DB_PASSWORD"')"   # 비밀번호 기준: /etc/reserve-backup.env (backup.md 7장)
docker exec -it -e MYSQL_PWD="$DB_PASSWORD" mysql mysql -u root reserve -e "
ALTER TABLE store ADD FULLTEXT INDEX ft_store_search
  (store_name, description, address, category, keywords) WITH PARSER ngram;
SHOW INDEX FROM store WHERE Index_type = 'FULLTEXT';"
```

③ `manual-ddl.md` 이력 표에 적용 날짜를 기록해요.
④ 그다음 **별도 배포로** `application-prod.yml`의 `fulltext-enabled` 주석을 해제해요.

> 주의: 지금 플래그는 **주석 처리된 상태**예요. 인덱스 없이 켜면
> `Can't find FULLTEXT index matching the column list`로 키워드 검색이 전부 500이 돼요.

### 4-3. nginx 로그를 실제 파일로 (그냥 두면 Loki 에 0건)

상세: [`monitoring.md`](monitoring.md) — "nginx 로그 수집"

공식 nginx 이미지는 `access.log`를 `/dev/stdout`으로 심볼릭 링크해 둬서 **파일이 없어요.**
그래서 promtail이 읽을 게 없어요. 호스트 디렉터리를 마운트해야 실제 파일이 생겨요.

```bash
sudo mkdir -p /var/log/nginx
# nginxserver 재생성 시  -v /var/log/nginx:/var/log/nginx  추가
scp promtail-config.yml ubuntu@<서버>:~/ && ssh ubuntu@<서버> 'docker restart promtail'
```

확인: Grafana에서 `{job="nginx"}`가 0건이면 마운트가 안 된 거예요.

### 4-4. 알림 규칙

상세: [`monitoring.md`](monitoring.md) — "알림 규칙(Grafana Alerting)"

Contact point의 **Test 버튼으로 수신까지** 확인한 뒤 규칙을 만들어요. SMTP가 안 묶여 있으면 알림은 **조용히 안 와요**.

> 주의: 429 알림은 4-3이, 백업 알림은 백업 cron 등록이 먼저여야 해요. 선행 작업 없이 켜 두면 계속 헛되이 울려요.

## 5. 프론트엔드 원자적 배포와 롤백

프론트는 새 백엔드가 준비되기 전에 live로 바뀌지 않아요.

1. `stage-release`는 이 실행의 dist 아티팩트를 `/usr/share/nginx/html/releases/<commit-sha>`에 staging하고
   SHA별 nginx 템플릿을 보관해요. `current` symlink, nginx 설정, backend upstream은 바꾸지 않아요.
   - `scripts/preserve-frontend-assets.sh`는 live와 보존된 릴리스 하나의 원래 해시 자산을 새 staging에 복사해요.
   - `reserve-assets.sha256`은 각 릴리스의 원래 파일만 기록해 상속 자산이 무한히 쌓이지 않게 해요.
   - 파일명이 같은데 SHA-256이 다르면 덮어쓰지 않고 배포를 중단해요. 기존 `/assets/` URL·immutable 캐시 계약은 유지해요.
2. `deploy-backend`는 nginx 컨테이너의 `service-env.inc`를 live upstream 정본으로 읽고, 그 대상의 loopback health가
   200인지 교차 확인한 뒤 반대편 Blue/Green 컨테이너를 SHA 이미지로 기동해요. 둘 다 200이어도 health 순서로 live를 추측하지 않아요.
   새 컨테이너의 loopback health가 통과하기 전에는 live 경로를 건드리지 않아요.
3. 전환 직전 현재 `default.conf`, `service-env.inc`, `current` 포인터를
   `/home/ubuntu/release-rollback-<새 commit-sha>-<run-id>-<run-attempt>/`에 묶어 저장해요.
   실행 시도별 경로라 같은 SHA 재실행이 이전 실행의 rollback marker를 쓰지 않아요.
4. nginx 후보에 새 프론트의 **SHA 절대 경로**와 새 backend upstream을 함께 넣어요. `nginx -t`가 통과하면
   `current` 포인터를 갱신하고 nginx를 **한 번만 reload**해요.
5. nginx를 거치는 HTML·정적 asset·공개 API smoke가 성공한 뒤에만 구 backend를 정지하고 오래된 릴리스를 정리해요.
6. health, 후보 검사, reload, smoke 중 하나라도 실패하거나 실행이 취소·종료 신호를 받으면,
   `set -Eeuo pipefail`과 rollback 경로가 저장한 두 nginx 파일과 프론트 포인터를 함께 복원하고 새 backend를 제거해요.

- 자동 정리는 현재 프론트와 최신 두 릴리스 디렉터리만 보존해요.
- 호스트 전체 `docker image/system prune`은 다른 서비스와 backend rollback 이미지를 지울 수 있어 배포 워크플로에서 실행하지 않아요. 용량 정리는 별도 운영 절차예요.

### 수동 롤백

nginx `root`가 SHA 절대 경로에 고정되므로 **symlink만 되돌리면 완전한 rollback이 아니에요.**

1. 대상 SHA와 현재 upstream을 읽기 전용으로 확인하고 별도 승인을 받아요.
2. 해당 실행의 rollback 디렉터리에서 `default.conf`와 `service-env.inc`를 함께 복구해요.
3. `nginx -t` 뒤 한 번 reload해요.

> 주의: `bash scripts/test-frontend-release-swap.sh`와 `bash scripts/test-frontend-assets.sh`는 로컬 회귀 검사일 뿐이에요.
> GitHub Actions 표현식, SSH 환경, 운영 nginx 권한·마운트·설정 복구는 증명하지 않아요.
> 운영 롤백 훈련(보존된 직전 조합으로 되돌렸다가 복귀)은 서로 다른 프론트 릴리스가 보존된 뒤 별도 승인 창에서 해요.
> 배포 전 옛 화면을 열어 둔 채 전환해, 아직 로드하지 않은 화면의 JS/CSS/font 요청이 HTML fallback 없이 성공하는지도 확인해요.
