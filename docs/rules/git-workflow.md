# RESERVE Git 워크플로우

브랜치·커밋·PR·머지 규칙과 자주 쓰는 절차를 모았어요.

## 승인 원칙

- 파일 수정과 Git·운영 변경 승인은 별개예요. 커밋·브랜치 생성·push·PR·머지·태그·배포·원격 설정 변경은 현재 대화에서 명시적으로 승인받은 뒤에만 해요.
- 이 문서의 명령은 절차일 뿐 실행 승인이 아니에요. 작업은 `git status --short --branch`로 시작해요.
- 수정은 `local-preview-all-changes`에서 먼저 확인해요. 사용자나 다른 도구의 미커밋 변경은 보존하고, 기능별 파일/hunk 분리는 따로 검토해요.

## 프리뷰 작업트리 옮기기

별도 승인을 받은 뒤 최신 `origin/dev`에서 깨끗한 통합 작업공간을 만들고, 원본 경로·상태·SHA-256·기능 묶음을 외부 manifest로 고정한 다음 검토한 경로만 기능 순서대로 옮겨요.

- 원본 작업트리는 rebase/reset/clean/stash하지 않아요.
- `git add -A`, `git add -u`, 대형 snapshot commit, preview commit 통째 cherry-pick은 쓰지 않아요.
- 신규 untracked 클래스가 기존 tracked 코드의 필수 의존성인지 묶음별로 검사해요.
- 묶음별 표적 검사와 전체 검사를 구분해 기록해요.
- 브랜치 생성, stage, commit, push, PR, merge는 각각 명시적 승인 뒤에만 실행해요.

## 브랜치 구조

```
main          ← 배포 브랜치 (CI/CD 트리거, reserve.it.kr 자동 반영)
  ↑
dev           ← 개발 통합 브랜치 (기본 브랜치, PR 받는 곳)
  ↑
feature/기능명  ← 기능별 작업 브랜치
```

| 브랜치 | 역할 | 삭제 |
|---|---|---|
| `main` | 운영 배포. push 시 CI/CD 자동 실행 | 안 함 |
| `dev` | 개발 통합. 배포 준비가 끝나면 `main`으로 PR | 안 함 |
| `feature/*` | 기능별 작업. 끝나면 `dev`로 PR | 머지 후 삭제 |
| `hotfix/*` | 긴급 수정. `main`에 직접 PR | 머지 후 삭제 |

## 커밋 메시지

```
<type>: <subject>
```

| type | 설명 | 예시 |
|---|---|---|
| `feat` | 새로운 기능 | `feat: add category badge to store detail header` |
| `fix` | 버그 수정 | `fix: resolve circular reference in S3 config` |
| `refactor` | 리팩토링 | `refactor: unify home mobile layout` |
| `docs` | 문서 수정 | `docs: add branch strategy to README` |
| `chore` | 빌드, 설정, 패키지 | `chore: update gitignore` |
| `style` | 코드 스타일 | `style: fix indentation in StoreCard` |
| `release` | 배포 | `release: home page mobile/PC layout improvements` |

- 커밋·PR 제목은 영어 `type: subject` 형식이에요. 소문자로 시작하고, 마침표는 붙이지 않아요.
- 현재형 동사를 써요. (`add`, `fix`, `remove` 등)
- 50자 이내를 권장해요.
- Dependabot의 `chore(deps): ...` / `chore(deps-dev): ...` 형식은 그대로 둬요.
- 본문은 문제·변경·검증·위험을 분명히 쓰고, 한국어도 괜찮아요. 사용자 문구와 릴리스 노트는 한국어예요.
- PR은 `.github/PULL_REQUEST_TEMPLATE.md`로 실제 실행 결과와 미검증 범위를 기록해요.

### 라벨

- 일반 PR에는 저장소에 있는 `bug`, `enhancement`, `documentation` 등 의미에 맞는 라벨을 달아요.
- Dependabot 설정의 `chore`, `dependencies` 라벨이 저장소에 없으면 별도 승인 후 만들어요.
- 새 분류 체계는 합의 없이 만들지 않아요.

## feature → dev

분리가 끝난 깨끗한 작업 트리에서 써요. 전체 `git add .`나 자동 stash/reset은 쓰지 않아요.

```bash
# 1. dev 브랜치로 이동
git checkout dev

# 2. 원격 dev 최신 코드 받아오기
git pull --ff-only origin dev

# 3. feature 브랜치 생성
git checkout -b feature/reservation-pagination

# 4. 코드 작업

# 5. 변경 파일 스테이징
git add <reviewed-file>
git diff --staged

# 6. 커밋
git commit -m "fix: paginate business reservations on the server"

# 7. 원격에 push
git push -u origin feature/reservation-pagination
```

**GitHub PR**
```
base: dev ← compare: feature/reservation-pagination
Title: fix: paginate business reservations on the server
Description:
- 변경 내용 1
- 변경 내용 2
→ Create pull request → Merge pull request → Confirm merge → Delete branch
```

```bash
# 8. 로컬 정리
git checkout dev
git pull --ff-only origin dev
git branch -d feature/reservation-pagination
```

## dev → main (배포)

```bash
# 1. dev 최신화
git checkout dev
git pull --ff-only origin dev
```

**GitHub PR**
```
base: main ← compare: dev
Title: release: deploy v2.5.1
Description: 변경사항 목록
→ 현재 head CI·검토 완료 후 Squash and merge → Confirm squash and merge
```

```bash
# 2. 로컬 동기화
git checkout dev
git pull --ff-only origin dev
# reserve.it.kr 접속해서 배포 확인
```

## PR 제목·본문

### 제목 예시

```
feat: add category badge, rating to store detail header
fix: equalize FAQ card heights in PC grid layout
docs: add code conventions and git workflow rules
release: home page mobile/PC layout improvements
```

### 본문 예시 (한국어 고정 형식)

```
## 요약
가게 상세 헤더에 카테고리 배지와 평점·리뷰 수를 보여 줘요.

## 변경 사항
- 가게 카드와 같은 모양(radius.sm, 테두리 없음)의 카테고리 배지를 추가했어요.
- 평점과 리뷰 수를 항상 보여 줘요(리뷰가 없으면 0.0).
- 헤더에서 가격대를 뺐어요.

## 검증
- 프론트 lint·빌드를 통과했어요.

## 배포
- 다음 릴리즈에 포함될 예정이에요.
```

배포 PR(`release: deploy vX.Y.Z`)은 `요약 → 주요 변경 → 포함된 PR → 배포 전 검증 → 배포 절차와 배포 후 확인 → 배포` 순서로 써요.

## 머지 옵션

| 대상 | 옵션 | 설명 |
|---|---|---|
| `feature/*`·`fix/*`·`chore/*` → `dev` | **Create a merge commit** | 브랜치 커밋 그대로 + 머지 커밋 추가 |
| `dev` → `main` (release) | **Squash and merge** | main은 `Require linear history`라 이 옵션만 써요 |

### 릴리즈 후 dev에 계보 잇기

`dev` → `main`을 Squash한 뒤에는 배포 코드가 같은지 확인하고 dev에 계보를 이어요. dev도 보호돼 있으니 별도 PR로 반영해요.

```bash
git fetch origin
git diff --exit-code origin/main origin/dev
# 차이가 있으면 중단. main의 미반영 hotfix 등을 실제로 먼저 병합한다.
git checkout -b chore/record-vX.Y.Z-release origin/dev
git merge -s ours origin/main -m "chore: record vX.Y.Z release squash into dev"
git diff --exit-code origin/dev HEAD
git push -u origin chore/record-vX.Y.Z-release
# base=dev PR → CI → Create a merge commit
```

main과 dev의 코드 차이를 설명할 수 없으면 `-s ours`를 쓰지 않아요.

## GitHub Actions 시크릿

- 시크릿 값은 셸 코드 문자열에 넣지 않고 Actions `env:`로 넘겨요.
- 시크릿을 로그·스크린샷·명령 인자·임시 파일에 넣지 않아요.

```yaml
- name: Check required secret presence
  env:
    EXAMPLE_SECRET: ${{ secrets.EXAMPLE_SECRET }}
  run: node -e 'if (!process.env.EXAMPLE_SECRET) process.exit(1)'
```

실패한 워크플로우 재실행은 운영 배포를 다시 수행할 수 있어서 별도 승인 후 해요.

```
GitHub → Actions 탭 → 실패한 워크플로우 클릭
→ Re-run jobs → Re-run failed jobs
```

## 자주 쓰는 명령어

```bash
git branch                    # 브랜치 목록
git branch -a                 # 원격 포함 전체
git status                    # 변경 상태
git log --oneline -10         # 커밋 로그
git stash                     # 변경사항 임시 저장
git stash pop                 # 꺼내기
git diff --staged             # 스테이징 내용 확인
git push origin --delete feature/기능명  # 원격 브랜치 삭제
```

## PR·CI 점검

```bash
node scripts/pr-review-audit.mjs
node scripts/pr-review-audit.mjs --json
gh pr view <number> -R hanjeun/reserve
gh pr checks <number> -R hanjeun/reserve
gh run view <run-id> --log-failed -R hanjeun/reserve
```

- 점검 스크립트는 읽기 전용이에요. 필수 `build-backend`/`build-frontend`가 없거나 skipped/neutral이면 준비 완료로 보지 않아요.
- 체크 성공은 머지 승인이 아니에요. 의존성 PR은 최신 base에서 다시 검증해요.
- 의존성 업데이트 때 확인할 것: AntD/rc-tabs는 patch-package와 모바일 탭, ESLint는 core·설정·플러그인 peer 호환성, 모션 메이저는 일반 모션.
- `--force`, `--legacy-peer-deps`, `--ignore-scripts`로 실패를 숨기지 않아요.
