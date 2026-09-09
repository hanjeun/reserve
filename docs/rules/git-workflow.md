# RESERVE Git 워크플로우

파일 수정과 Git·운영 변경 승인은 별개다. 커밋·브랜치 생성·push·PR·머지·태그·배포·원격 설정 변경에는 현재 대화의 명시적 승인이 필요하다.
아래는 런북이며 실행 승인이 아니다. 작업 시작은 `git status --short --branch`다.

수정은 `local-preview-all-changes`에서 먼저 확인한다. 사용자·다른 도구의 미커밋 변경을 보존하고 snapshot과 기능별 파일/hunk 분리를 별도로 검토한다.
[프리뷰 릴리스 계획](../technical/preview-release-plan.md)의 7개 PR은 v2.5.0 당시 기록이며 새 릴리스의 미완료 작업으로 재사용하지 않는다.

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
| `main` | 운영 배포. push 시 CI/CD 자동 실행 | ❌ 절대 X |
| `dev` | 개발 통합. 배포 준비 완료 후 `main`으로 PR | ❌ 절대 X |
| `feature/*` | 기능별 작업. 완료 후 `dev`로 PR | ✅ 머지 후 삭제 |
| `hotfix/*` | 긴급 수정. `main`에 직접 PR | ✅ 머지 후 삭제 |

---

## 커밋 메시지 규칙

### 형식

```
<type>: <subject>
```

### type 종류

| type | 설명 | 예시 |
|---|---|---|
| `feat` | 새로운 기능 | `feat: add category badge to store detail header` |
| `fix` | 버그 수정 | `fix: resolve circular reference in S3 config` |
| `refactor` | 리팩토링 | `refactor: unify home mobile layout` |
| `docs` | 문서 수정 | `docs: add branch strategy to README` |
| `chore` | 빌드, 설정, 패키지 | `chore: update gitignore` |
| `style` | 코드 스타일 | `style: fix indentation in StoreCard` |
| `release` | 배포 | `release: home page mobile/PC layout improvements` |

### 규칙

- 영어로 작성
- 소문자로 시작
- 마침표 없음
- 현재형 동사 사용 (`add`, `fix`, `remove` 등)
- 50자 이내 권장
- Dependabot의 기존 `chore(deps): ...` / `chore(deps-dev): ...` 형식은 유지
- 본문은 문제·변경·검증·위험을 명확히 쓰며 한국어 허용. 사용자 문구·릴리스 노트는 한국어
- PR은 `.github/PULL_REQUEST_TEMPLATE.md`로 실제 실행 결과와 미검증 범위를 기록

### 라벨

일반 PR은 실제 존재하는 `bug`, `enhancement`, `documentation` 등 의미에 맞는 라벨을 사용한다.
Dependabot 설정의 `chore`, `dependencies`가 저장소에 없다면 별도 승인 후 생성·적용한다. 설정 파일에 적혀 있다고 라벨링이 완료된 것은 아니다.
새 분류 체계는 합의 없이 만들지 않는다.

---

## feature → dev (daily 개발)

다음은 분리가 끝난 깨끗한 작업 트리용이다. 미커밋 프리뷰에서 그대로 실행하지 않는다.
전체 `git add .`, 자동 stash/reset으로 다른 작업을 섞거나 치우지 않는다.

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

**GitHub PR:**
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

---

## dev → main (배포)

```bash
# 1. dev 최신화
git checkout dev
git pull --ff-only origin dev
```

**GitHub PR:**
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

> ⚠️ dev, main 브랜치는 절대 삭제하지 않는다

---

## PR Title / Description 형식

### Title 예시

```
feat: add category badge, rating to store detail header
fix: equalize FAQ card heights in PC grid layout
docs: add code conventions and git workflow rules
release: home page mobile/PC layout improvements
```

### Description 예시

```
- Add category badge matching StoreCard style (radius.sm, no border)
- Show rating and review count always (0.0 when no reviews)
- Remove price range from header
```

---

## 머지 옵션

| 대상 | 옵션 | 설명 |
|---|---|---|
| `feature/*`·`fix/*`·`chore/*` → `dev` | **Create a merge commit** | 브랜치 커밋 그대로 + 머지 커밋 추가 |
| `dev` → `main` (release) | **Squash and merge** | main 은 `Require linear history` 라 merge commit 을 못 받는다. 이 옵션만 가능 |

> ★ `dev` → `main` 을 Squash 하면 **dev 가 main 의 조상이 아니게 된다.**
> 배포 코드가 동일한지 검증한 뒤 계보를 이어준다. dev도 보호되므로 별도 PR로 반영한다:
>
> ```bash
> git fetch origin
> git diff --exit-code origin/main origin/dev
> # 차이가 있으면 중단. main의 미반영 hotfix 등을 실제로 먼저 병합한다.
> git checkout -b chore/record-vX.Y.Z-release origin/dev
> git merge -s ours origin/main -m "chore: record vX.Y.Z release squash into dev"
> git diff --exit-code origin/dev HEAD
> git push -u origin chore/record-vX.Y.Z-release
> # base=dev PR → CI → Create a merge commit
> ```
>
> 이걸 빼먹으면 다음 릴리즈 PR 에서 **이미 배포된 내용이 충돌로 되살아나고**,
> 충돌 해결을 한 번 잘못하면 배포된 수정이 되돌아간다. 실제로 `#120` 이후 이 상태로 방치돼
> hotfix 4개(`#121`~`#123`)가 dev 에 없는 기간이 있었다.

`-s ours`는 상대 브랜치의 파일 변경을 가져오지 않는다. main과 dev의 코드 차이를 설명할 수 없으면 사용하지 않는다.

---

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

---

## 트러블슈팅

### GitHub Actions — bash 특수문자 오류

**증상:**
```
bash: -c: line N: syntax error near unexpected token `X'
Process exited with status 2
```

**원인:** GitHub Secrets 값에 `()`, `!`, `$` 등 특수문자가 포함된 경우
`export VAR=${{ secrets.VAR }}` 형식에서 bash 파싱 오류 발생

**해결:** 값을 셸 코드 문자열에 삽입하지 않고 Actions `env:`로 전달한다.
큰따옴표를 추가하는 것만으로 안전해지지 않으며, 비밀번호를 영숫자로 바꾸는 것도 해결책이 아니다.
아래는 값 노출 없이 존재 여부만 검사하는 예시다. 실제 도구에는 stdin 등 적절한 비노출 경로로 전달한다.
```yaml
- name: Check required secret presence
  env:
    EXAMPLE_SECRET: ${{ secrets.EXAMPLE_SECRET }}
  run: node -e 'if (!process.env.EXAMPLE_SECRET) process.exit(1)'
```

시크릿을 로그·스크린샷·명령 인자·임시 파일에 넣지 않는다. GitHub Secret은 저장 후 원문을 다시 읽는 API가 없으므로 정확한 출처에서 안전하게 다시 설정해야 한다.

**코드 변경 없이 재실행:**

대상 잡이 운영 배포를 재수행할 수 있다. 원인·현재 운영 상태·대상 잡을 확인하고 별도 승인 후 실행한다.
```
GitHub → Actions 탭 → 실패한 워크플로우 클릭
→ Re-run jobs → Re-run failed jobs
```

## PR·CI 읽기 전용 점검

```bash
node scripts/pr-review-audit.mjs
node scripts/pr-review-audit.mjs --json
gh pr view <number> -R hanjeun/reserve
gh pr checks <number> -R hanjeun/reserve
gh run view <run-id> --log-failed -R hanjeun/reserve
```

점검 스크립트는 읽기 전용이다. 필수 `build-backend`/`build-frontend`가 없거나 skipped/neutral이면 준비 완료로 표시하지 않는다. 체크 성공은 머지 승인이 아니다.
오래된 성공 결과는 현재 dev와 결합한 결과가 아닐 수 있다. 의존성 PR은 최신 base 재검증이 필요하다.
AntD/rc-tabs는 patch-package와 모바일 탭, ESLint는 core·설정·플러그인 peer 호환성, 모션 메이저는 일반 모션을 확인한다.
`--force`, `--legacy-peer-deps`, `--ignore-scripts`로 실패를 숨기지 않는다.
