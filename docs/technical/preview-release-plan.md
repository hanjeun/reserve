# 프리뷰 변경 분리·릴리스 계획

> 기준: `local-preview-all-changes`의 미커밋 프리뷰. 이 문서는 Git 작업을 실행하지 않는다.
> 커밋, 브랜치 생성, push, PR 생성·머지, 태그, 배포는 현재 대화의 별도 승인 뒤에만 수행한다.

## 왜 순차 분리하는가

현재 프리뷰는 보안, 결제, 데이터 생명주기, 관리자 API, QR, 프론트 디자인 시스템, 테스트,
모니터링과 배포가 한 작업 트리에 함께 있다. 일부 파일(`CICD.yml`, `AdminPanel.jsx`, 공통 CSS,
기술 문서)은 여러 주제의 변경을 함께 담으므로 파일 단위 복사만으로는 안전하게 분리되지 않는다.

승인 후 먼저 프리뷰 전체를 **로컬 전용 snapshot 커밋**으로 보존한다. 이후 각 브랜치는 직전 PR이
머지된 최신 `dev`에서 만들고, snapshot의 필요한 파일과 hunk만 가져온다. 각 PR이 독립적으로 전체
검증을 통과한 뒤 다음 PR을 시작한다. `git add .`는 쓰지 않고 `git add -p`와 명시적 pathspec을 쓴다.

## PR 순서

| 순서 | 브랜치 | PR 제목 | 핵심 범위 | 선행 |
|---:|---|---|---|---|
| 1 | `fix/security-boundaries` | `fix: harden identity and public data boundaries` | 역할 주입 차단, 공개 리뷰 DTO, 강제 삭제 차단, 인증·PII 로그, Sentry 마스킹 | 없음 |
| 2 | `feature/payment-lifecycle-safety` | `feat: add durable payment and deletion recovery` | 웹훅 inbox, PAID 복구, 만료 재확인, 대사 큐, 탈퇴·폐업 guard, 파일 삭제 outbox | 1 |
| 3 | `feature/admin-server-operations` | `feat: add paginated admin operations` | 사업자·가게·예약 서버 검색/페이지네이션, 결제 운영 탭과 수동 재확인 경로 | 2 |
| 4 | `fix/concurrency-and-upload-atomicity` | `fix: prevent lost updates and preserve uploaded files` | 커뮤니티·채팅 원자 갱신, 사업자·프로필 새 파일 우선 교체 | 2 |
| 5 | `feature/attendance-checkin` | `feat: record attendance separately from approval` | `checked_in_at`, QR 토큰·응답·UI·문서와 멱등 테스트 | 2 |
| 6 | `fix/frontend-system-and-seo` | `fix: align accessibility design tokens and public seo` | Button/Card/Favorite/Form 관문, reduced motion, CSS·토큰 정리, sitemap/메타데이터, 초기 청크 분리 | 1 |
| 7 | `chore/verification-and-operations` | `chore: add regression and deployment verification` | Vitest/RTL/Playwright, Grafana P0, CSP 관측, 원자 배포·롤백 점검, 운영 런북 | 2, 3, 5, 6 |

위 일곱 이름은 2026-09-03 로컬·원격 브랜치 목록과 충돌하지 않는다. 실행 직전에는 다시 확인한다.

각 PR의 문서는 해당 코드와 같이 넣는다. 예를 들어 결제 계약은 2번, QR 사용자 문구는 5번,
디자인 시스템과 SEO 문서는 6번, 모니터링·배포 문서는 7번에서 이동한다. README는 최종 동작과
표현이 모두 확정되는 7번에서 마지막으로 맞춘다.

## 승인 뒤 실제 작업 절차

아래 명령은 계획이며 아직 실행하지 않는다. `<snapshot>`과 PR 번호는 실행 시 실제 값으로 바꾼다.

```bash
# 1. 프리뷰 전체 보존 — 별도 승인 필요
git status --short --branch
git add -A
git diff --cached --check
git commit -m "chore: snapshot local preview changes"

# 2. 첫 기능 브랜치 — 각 PR 머지 뒤 같은 순서를 반복
git fetch origin
git checkout -b fix/security-boundaries origin/dev
git restore --source <snapshot> -- <이 PR의 완전 소유 파일>
git restore -p --source <snapshot> -- <겹치는 파일>
git add -p
git diff --cached --check
git diff --cached
```

## 현재 GitHub gate (2026-09-03 읽기 전용 확인)

- 기본 브랜치는 `dev`, 머지 후 브랜치 자동 삭제는 켜져 있다.
- `main`은 PR과 `build-backend`·`build-frontend`를 요구하고 선형 히스토리·강제 push/삭제 차단이
  켜져 있다. `strict`는 false이고 승인 리뷰 수는 0이다.
- `dev`는 현재 **보호되지 않았다**. 첫 기능 PR 전에 직접 push/강제 push/삭제를 막고 PR 및 두
  빌드 체크를 요구하는 보호 규칙을 별도 승인으로 적용해야 한다.
- `protect-release-tags` ruleset은 active다.
- `production` environment는 존재하지만 protection rule과 deployment branch policy가 없다.
  `main`만 배포하도록 제한하고 필요한 경우 수동 승인자를 두는 설정은 별도 GitHub 변경 승인 대상이다.

이 절은 조회 결과 기록일 뿐 설정을 바꾸지 않았다. 실제 Git 작업 직전에 다시 조회한다.

커밋은 PR 하나에 논리 단위 1~3개를 권장한다. 예시는 다음과 같다.

```text
fix: reject privileged signup roles
fix: remove private fields from public reviews
chore: cover identity boundary regressions
```

실제 제목은 staged diff를 본 뒤 확정하며, 이 프로젝트의 허용 type 밖인 `test`는 쓰지 않는다.

## PR 본문과 라벨

모든 PR 본문은 같은 네 절을 쓴다.

```markdown
## 변경
- 실제 변경 사항

## 위험과 경계
- 돈·개인정보·DB·외부 제공자에 미치는 영향

## 검증
- 실행한 명령과 결과

## 배포 후 확인
- 로컬에서 증명할 수 없어 남은 항목
```

2026-09-03 읽기 전용 조회 기준 저장소의 업무 라벨은 기본 `bug`, `enhancement`, `documentation`뿐이다.
1·4·6번은 `bug`, 2·3·5번은 `enhancement`, 7번은 `documentation`을 사용한다. 코드와 문서가 함께인
PR에는 성격 라벨과 `documentation`을 같이 붙일 수 있다. 존재하지 않는 `security`, `backend`,
`frontend`, `payments`, `operations` 라벨을 임의 생성하지 않는다. 실제 PR 생성 직전에는
`gh label list -R hanjeun/reserve`로 한 번 더 확인한다.

## PR별 공통 합격선

```bash
cd backend && ./gradlew test
cd frontend && npm run lint:ci
cd frontend && npm run test:run
cd frontend && npm run test:e2e
cd frontend && npm run build
node scripts/validate-grafana-dashboards.mjs
bash scripts/test-frontend-release-swap.sh
```

- 현재 PR과 무관한 테스트도 생략하지 않는다.
- DB 잠금, PortOne 웹훅, S3 outbox, CSP 7일, 운영 롤백은 로컬 합격선이 아니라 배포 후 gate다.
- `dev → main`은 Squash and merge 후 `git merge -s ours origin/main ...`로 계보를 다시 잇는다.
- 운영 확인 전에는 릴리스 태그와 GitHub Release를 만들지 않는다.
