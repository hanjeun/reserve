# Deployments & 릴리즈 운영 가이드

RESERVE의 릴리즈 노트 동기화, GitHub Deployments 기록, 저장소 보호 설정을 한곳에 정리한 문서.
모든 명령은 **레포 루트에서 `gh` 로그인 상태**로 실행한다. 대상 저장소는 `REPO` 환경변수로 바꿀 수 있다(기본 `hanjeun/reserve`).

---

## 1. 릴리즈 노트 동기화 (CHANGELOG → GitHub 릴리즈)

`docs/CHANGELOG.md` 의 버전별 사용자 요약을 각 GitHub 릴리즈 설명 상단에 얹는다.
기존 자동 생성 PR 목록은 그대로 두고, 요약만 `<!-- changelog:start/end -->` 마커로 감싸 중복 없이 갱신한다.

```bash
# 전체 미리보기 (아무것도 바꾸지 않음)
node scripts/sync-release-notes.mjs

# 전체 반영
node scripts/sync-release-notes.mjs --apply

# 특정 버전만
node scripts/sync-release-notes.mjs v1.13.0 --apply
```

CHANGELOG를 고칠 때마다 다시 돌리면 릴리즈 설명이 최신 요약으로 교체된다(idempotent).

---

## 2. GitHub Deployments (배포 이력 기록)

### 지금 상태

`.github/workflows/CICD.yml`의 `deploy-backend` 잡이 job-level `deployments: write` 권한과
SHA로 고정한 `actions/github-script`를 사용해 **배포 시작 → 성공/실패**를 기록한다.
2026-09-02 읽기 전용 확인에서 최신 production Deployment(`89420844…`, 2026-08-29)가 `success`였고,
실제 Actions 로그의 blue→green 전환과 health check도 일치했다.

`production` Environment 자체는 존재하지만 protection rule·deployment branch policy·environment secret은
비어 있다. 현재 잡에는 `environment:` 선언이 없어 Environment 승인 관문이 배포를 막는 구조도 아니다.
이 설정 변경은 저장소 코드 수정과 별개의 GitHub 원격 변경이므로 명시적 승인 후 진행한다.

### 2-1. 태그 백필

기록이 없는 태그에만 Deployment(+success)를 만든다. **시각은 '지금'으로 찍힌다**(과거 배포 시각 아님, 일관성/기록용).

```bash
node scripts/backfill-deployments.mjs               # 미리보기 — 무엇을 만들지
node scripts/backfill-deployments.mjs --apply       # 빠진 것만 생성
node scripts/backfill-deployments.mjs --tag v2.2.0 --apply   # 특정 태그만
```

**증분이라 몇 번을 돌려도 안전하다.** 태그를 커밋 SHA로 풀어서 이미 그 커밋에 배포 기록이 있으면
건너뛴다 — 기존 기록의 ref 가 태그명이든 SHA 든 상관없다.

> ⚠️ **`--reset` 은 제거됐다 (2026-08-11).** 그 플래그는 `environment=production` 인 배포를 전부 지우고
> 다시 만들었는데, 거기에는 **CI/CD 가 배포 순간에 만든 진짜 기록(ref 가 커밋 SHA)**도 포함돼 있었다.
> GitHub API 는 Deployment 생성 시각을 지정할 수 없어 **진짜 배포 시각은 복구되지 않는다.**
> 2026-08-11 에 실제로 7건을 잃었다. 지금은 `--reset` 을 치면 에러와 함께 설명이 나온다.
>
> 이 스크립트가 만든 것만 지우려면 `--prune-backfilled` 를 쓴다. `description` 의
> `backfilled-by-script` 표식으로 대상을 고르므로 CI/CD 기록에는 손대지 않는다.
>
> ```bash
> node scripts/backfill-deployments.mjs --prune-backfilled           # 미리보기
> node scripts/backfill-deployments.mjs --prune-backfilled --apply
> ```

> `production` environment는 2026-09-03 현재 존재한다. 다만 보호 규칙과 배포 브랜치 제한은
> 비어 있으므로 별도 승인 뒤 `main` 전용 정책을 설정한다.

### 2-2. 현재 CICD 기록 검증

코드와 GitHub 원격 상태를 둘 다 확인해야 한다. 워크플로에 스텝이 있다는 사실만으로 실제 기록 성공을
증명할 수 없고, Deployment 객체만으로 서버 health check 성공을 증명할 수도 없다.

```bash
# 코드: job-level 최소 권한과 create/status 스텝
rg -n "deployments: write|Create GitHub deployment|Mark deployment" .github/workflows/CICD.yml

# 원격: 최신 production 배포와 상태
gh api --method GET repos/hanjeun/reserve/deployments -f environment=production \
  --jq '.[0] | {id,sha,created_at}'
gh api repos/hanjeun/reserve/deployments/<id>/statuses \
  --jq '.[0] | {state,created_at,environment_url}'
```

`actions/github-script`와 다른 Actions는 태그가 아니라 전체 커밋 SHA로 고정한다. 배포 기록 생성 실패는
실제 배포를 막지 않도록 `continue-on-error`이고, id가 있을 때만 성공·실패 상태를 기록한다.

---

## 3. 저장소 보호 & PR/브랜치 정리

### 3-1. 브랜치 보호 (main / dev)

UI: Settings → Branches → Add rule. gh CLI (PowerShell here-string):

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

> 2026-09-03 읽기 전용 확인: `main`에는 위 두 체크, PR 필수, 선형 히스토리, 강제 push·삭제
> 차단이 적용돼 있다. `strict=false`, 승인 리뷰 수 0이다. `dev`는 현재 보호되지 않았다.
> 아래처럼 실제 값을 다시 읽고, `dev` 보호 추가는 별도 승인 뒤 진행한다.

```bash
gh api repos/hanjeun/reserve/branches/main/protection
gh api repos/hanjeun/reserve/branches/dev/protection
```

> ⚠️ `contexts` 는 **PR에서 실제로 실행되는 잡**만 넣어야 한다. CICD.yml에서 `deploy-backend`는
> `if: github.ref == 'refs/heads/main' && github.event_name == 'push'` 이라 **PR에선 안 돈다** →
> 필수 체크로 걸면 모든 PR이 영영 막힌다. 그래서 PR에서 도는 `build-backend`·`build-frontend`만 필수로 둔다.
>
> ⚠️ 1인 프로젝트에서 `main`에 직접 push 해왔다면, 위 규칙(required_pull_request_reviews) 적용 후엔
> **main 직접 push가 막히고 PR을 거쳐야 한다**. 이게 정석이지만 워크플로가 바뀌니 인지하고 켤 것.
> 지금처럼 직접 push를 유지하려면 `required_pull_request_reviews` 를 빼고 status check·선형 히스토리만 강제해도 된다.

### 3-2. 머지된 head 브랜치 자동 삭제

UI: Settings → General → "Automatically delete head branches" 체크. gh CLI:

```bash
gh api --method PATCH repos/$REPO -f delete_branch_on_merge=true
```

이미 머지됐지만 남아있는 브랜치 정리:

```bash
git fetch --prune
git branch --merged main | grep -vE '^\*|main|dev|local-preview-all-changes' | xargs -r -n1 git branch -d
git push origin --delete <branch>   # 원격 브랜치 삭제(필요한 것만)
```

### 3-3. Dependabot 메이저 무시 (과거 예시)

메이저 업그레이드 PR은 닫지 말고 코멘트로 "이 메이저는 무시" 지시(향후 메이저 PR 재생성 방지):

```bash
gh pr comment 79 -R $REPO --body "@dependabot ignore this major version"
gh pr comment 76 -R $REPO --body "@dependabot ignore this major version"
```

안전한 마이너/패치 PR 머지 후 위 3-2로 브랜치 정리:

```bash
gh pr list -R $REPO --label dependencies       # 목록 확인
gh pr merge <번호> -R $REPO --squash --delete-branch
```

---

## 남은 GitHub 설정 순서 (별도 승인 필요)

1. `dev`에 PR·`build-backend`·`build-frontend`·강제 push/삭제 차단을 적용한다.
2. 이미 존재하는 `production` environment를 `main` 배포만 허용하도록 제한하고 필요하면 수동 승인자를 둔다.
3. `sync-release-notes.mjs --apply`와 `backfill-deployments.mjs --apply`는 외부 GitHub 기록을 바꾸므로
   릴리스 작업 승인을 받은 뒤에만 실행한다.

2026-09-03 현재 머지 후 head 브랜치 자동 삭제와 `protect-release-tags` ruleset은 적용돼 있다.
`production` environment는 존재하지만 protection rule과 deployment branch policy가 없다.

---

## 4. 배포 직후 서버 작업 체크리스트

레포에는 들어가 있지만 **서버에서 손을 대야 비로소 동작하는 것들**이다.
순서가 중요한 것만 모았고, 각 항목의 상세는 링크된 문서에 있다.

### 4-0. DB 구조와 운영 큐 읽기 전용 점검

앱이 새 버전으로 정상 기동한 뒤 `verify-post-deploy-readonly.sh`를 서버에 복사해 실행한다.
백업 설정을 아직 만들지 않았다면 별도 root 전용 환경 파일에 `DB_PASSWORD`만 넣어도 된다.

```bash
scp scripts/verify-post-deploy-readonly.sh scripts/verify-mysql-row-lock.sh ubuntu@<server>:/tmp/
ssh ubuntu@<server>
sudo install -m 0755 /tmp/verify-post-deploy-readonly.sh /usr/local/bin/reserve-post-deploy-verify
sudo install -m 0755 /tmp/verify-mysql-row-lock.sh /usr/local/bin/reserve-mysql-row-lock
sudo RESERVE_VERIFY_ENV=/etc/reserve-verify.env /usr/local/bin/reserve-post-deploy-verify
```

이 점검은 다음만 읽는다.

- `payment_webhook_inbox`, `payment_reconciliation_issue`, `file_deletion_task` 테이블과 필수 인덱스
- `reservation.checked_in_at` 컬럼
- 관련 테이블의 InnoDB 엔진 여부
- 7일 넘은 `READY`, 열린 대사 건, 미완료 웹훅, 실패한 S3 삭제 outbox 건수

종료 코드는 `0=구조와 큐 정상`, `1=구조 오류`, `2=구조는 정상이지만 수동 확인할 큐 존재`다.
`2`가 나와도 스크립트는 아무 상태도 바꾸지 않는다. 특히 오래된 `READY`는 먼저 PortOne 콘솔과
대조하고, 관리자 패널의 개별 **재확인** 동작은 별도 승인 뒤 실행한다.

MySQL 잠금 실기는 일반 점검과 분리한다. `verify-mysql-row-lock.sh`는 선택한 결제 행을 약 5초간
`FOR UPDATE`로 잠그므로, 트래픽이 없는 TEST 결제 ID와 승인된 점검 창에서만 실행한다. 두 세션은
모두 `ROLLBACK`하며 두 번째 세션이 lock wait timeout으로 막혀야 통과한다.

```bash
sudo RESERVE_VERIFY_ENV=/etc/reserve-verify.env \
  /usr/local/bin/reserve-mysql-row-lock <idle-test-payment-id>
```

이 스크립트 결과는 실제 InnoDB 행 잠금의 증거지만, 동시에 들어온 두 환불 중 PG 호출이 한 번만
나가는지까지 증명하지는 않는다. 그 마지막 검증은 PortOne TEST 결제 두 요청 시나리오로 별도 수행한다.

### 2026-09-05 — v2.5.0 운영 검증 기록

검증 기준 커밋은 `6e9dfdc69770d0f6af339cdb9e6d3d38ffa6698e`이며 `main`과 `v2.5.0` 태그가
같은 커밋을 가리킨다. GitHub Actions run `33958795226`의 재실행 attempt 2에서 백엔드 배포와
의존 build job이 모두 성공했고, Production deployment는 `2026-09-05T10:18:50Z`에 성공으로 끝났다.

| 항목 | 실제 확인 결과 |
|---|---|
| 애플리케이션 | blue 컨테이너가 8080에서 활성, green/8081 비활성, nginx upstream은 blue |
| 외부 상태 | `/`와 `/actuator/health` 모두 HTTP 200, HSTS·nosniff·CSP Report-Only 헤더 확인 |
| DB 구조 | 세 운영 테이블, `reservation.checked_in_at`, 필수 인덱스, InnoDB 엔진 확인 |
| 운영 큐 | 열린 대사 0, 미완료 웹훅 0, S3 삭제 pending/failed 0, 7일 넘은 `READY` 2건 |
| MySQL 잠금 | 승인한 비활성 TEST 결제 행에서 두 번째 트랜잭션 timeout 및 양쪽 rollback 확인 |
| 프론트 배포 | `current`가 위 커밋 SHA 디렉터리를 가리키는 원자 전환 확인 |
| 미완료 | PortOne 콘솔 호출 테스트, 오래된 `READY` 2건의 관리자 재확인, CSP 7일 관측 |

Sentry DSN은 실행 중이던 컨테이너의 유효 값을 화면·파일·명령 인자에 노출하지 않고 GitHub
repository secret으로 갱신한 뒤 재배포했다. GitHub는 secret 값을 다시 보여주지 않으므로 갱신 시각과
새 컨테이너의 정상 기동만 확인했고, 문서나 로그에는 값을 기록하지 않는다.

### 4-1. CSP 위반 관측 (배포 즉시)

`nginx/default.conf` 의 CSP 는 **Report-Only** 로 나간다 — 지금은 아무것도 차단하지 않는다.
브라우저 위반 보고는 `POST /api/csp-reports`로 들어오며, 서버는 URL·쿼리·문서 주소를 버리고
지시문 종류와 차단된 URI의 scheme만 `CSP violation observed` 로그로 남긴다.

1. 배포 후 https://reserve.it.kr 에서 개발자도구 콘솔을 열고 **PC와 실제 모바일에서 주요 화면을 한 바퀴 돌면서**
   `[Report Only]` 경고를 모은다.
   → 홈 / 가게 목록 · 검색 / 가게 상세(**카카오맵이 뜨는 화면**) / 예약 · **결제** / 로그인(소셜 3사) /
     마이페이지 이미지 업로드 · 미리보기 / 관리자 패널
2. Grafana Explore에서 아래 쿼리로 배포 뒤 수집된 위반을 확인한다.

   ```logql
   {job="reserve"} |= `CSP violation observed`
   ```

3. 수동 시나리오를 모두 통과하고 **최소 7일** 동안 실제 트래픽에서도 설명되지 않는 위반이 없을 때만
   헤더명에서 `-Report-Only`를 지우는 별도 PR을 만든다. 한 번의 콘솔 0건만으로 강제 전환하지 않는다.
4. 경고가 있으면 필요한 출처만 해당 지시문에 추가한다. **절대 `unsafe-inline` 을 script-src 에 넣지 말 것**
   — 그순간 CSP 가 막아야 할 XSS 를 전부 통과시킨다(style-src 는 antd 때문에 어쩔 수 없다).

> 결제는 PC 에서 popup(`window.open`)이라 CSP 대상이 아니지만 **모바일은 리다이렉트/iframe**
> 경로라 다르게 동작한다. 모바일에서도 한 번 결제해볼 것.

### 4-2. 가게 검색 FULLTEXT (순서 고정 — 뒤집으면 검색이 전부 500)

상세: [`manual-ddl.md`](manual-ddl.md)

```bash
# ① (권장) 먼저 백업
/usr/local/bin/reserve-backup

# ② DDL 적용
docker exec -it -e MYSQL_PWD="$DB_PASSWORD" mysql mysql -u root reserve -e "
ALTER TABLE store ADD FULLTEXT INDEX ft_store_search
  (store_name, description, address, category, keywords) WITH PARSER ngram;
SHOW INDEX FROM store WHERE Index_type = 'FULLTEXT';"
```

③ `manual-ddl.md` 이력 표에 한 줄 기록(현재 `_(미적용)_`)
④ 그 다음 **별도 배포로** `application-prod.yml` 의 `fulltext-enabled` 주석을 해제

> 현재 플래그는 안전하게 **주석 처리된 상태**다. 인덱스 없이 켜면
> `Can't find FULLTEXT index matching the column list` 로 키워드 검색이 전부 500 이 된다.

### 4-3. nginx 로그를 실제 파일로 (그냥 두면 Loki 에 0건)

상세: [`monitoring.md`](monitoring.md) — "nginx 로그 수집"

공식 nginx 이미지는 `access.log` 를 `/dev/stdout` 으로 심볼릭 링크해둔다 — **파일이 없다.**
그래서 promtail 이 읽을 게 없다. 호스트 디렉토리를 마운트해야 실제 파일이 생긴다.

```bash
sudo mkdir -p /var/log/nginx
# nginxserver 재생성 시  -v /var/log/nginx:/var/log/nginx  추가
scp promtail-config.yml ubuntu@<서버>:~/ && ssh ubuntu@<서버> 'docker restart promtail'
```

확인: Grafana 에서 `{job="nginx"}` 가 0건이면 마운트가 안 된 것이다.

### 4-4. 알림 규칙

상세: [`monitoring.md`](monitoring.md) — "알림 규칙(Grafana Alerting)"

Contact point 의 **Test 버튼으로 수신까지** 확인한 뒤 규칙을 만든다.
SMTP 가 안 묶여 있으면 알림은 **조용히 안 온다**.

> 429 알림은 4-3 이, 백업 알림은 백업 cron 등록이 선행돼야 한다.
> 선행 작업 없이 먼저 켜두면 부질없이 계속 울린다.

---

## 5. 프론트엔드 원자적 배포와 롤백

`build-frontend`는 단위 테스트와 Playwright smoke test를 통과한 산출물을
`/usr/share/nginx/html/releases/<commit-sha>`에 완성한 뒤, 같은 디렉터리의 `current.next`를
`current`로 원자적 rename한다. Nginx root는 `/usr/share/nginx/html/current`이며 현재 릴리스와
직전 두 릴리스만 보존한다. 따라서 파일을 한 개씩 덮어쓰는 동안 구·신 청크가 섞이지 않는다.

문제가 생기면 보존된 40자리 커밋 SHA를 확인한 뒤 다음처럼 symlink만 되돌린다.

```bash
RELEASE_ROOT=/usr/share/nginx/html/releases
ROLLBACK_SHA=<보존된-40자리-커밋-SHA>
test -d "$RELEASE_ROOT/$ROLLBACK_SHA"
sudo ln -sfn "releases/$ROLLBACK_SHA" /usr/share/nginx/html/current.next
sudo mv -Tf /usr/share/nginx/html/current.next /usr/share/nginx/html/current
```

2026-09-05 v2.5.0 배포에서 운영 `current`가 새 SHA 디렉터리를 가리키는 최초 원자 전환은 확인했다.
다만 서버의 `releases` 아래 보존된 디렉터리가 현재 SHA 하나뿐이어서 **과거 버전으로 되돌리는 운영
롤백 훈련은 실행할 대상이 없었다.** 다음 서로 다른 프론트 릴리스가 한 번 더 쌓인 뒤 수행한다.

`bash scripts/test-frontend-release-swap.sh`는 CI에서 매번 임시 디렉터리로 배포와 롤백의
symlink 원자 교체를 재현한다. 이 통과는 Linux 파일시스템 명령의 회귀를 막는 로컬 증거일 뿐,
운영 Nginx 권한·마운트·보존 디렉터리를 증명하지 않는다. 첫 정식 배포 뒤에는 실제 서버에서
`current`가 새 40자리 SHA를 가리키는지 확인하고, 보존된 직전 SHA로 한 번 되돌렸다가 다시
현재 SHA로 복귀하는 훈련을 별도 승인 창에서 실행한다.
