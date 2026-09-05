# RESERVE Git 워크플로우

현재 `local-preview-all-changes`의 대규모 미커밋 변경을 기능별 PR로 옮기는 순서와 제목은
[`../technical/preview-release-plan.md`](../technical/preview-release-plan.md)를 따른다.

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

---

## feature → dev (daily 개발)

```bash
# 1. dev 브랜치로 이동
git checkout dev

# 2. 원격 dev 최신 코드 받아오기
git pull origin dev

# 3. feature 브랜치 생성
git checkout -b feature/기능명

# 4. 코드 작업

# 5. 변경 파일 스테이징
git add .

# 6. 커밋
git commit -m "feat: 기능 설명"

# 7. 원격에 push
git push origin feature/기능명
```

**GitHub PR:**
```
base: dev ← compare: feature/기능명
Title: feat: 기능 설명
Description:
- 변경 내용 1
- 변경 내용 2
→ Create pull request → Merge pull request → Confirm merge → Delete branch
```

```bash
# 8. 로컬 정리
git checkout dev
git pull origin dev
git branch -d feature/기능명
```

---

## dev → main (배포)

```bash
# 1. dev 최신화
git checkout dev
git pull origin dev
```

**GitHub PR:**
```
base: main ← compare: dev
Title: release: 배포 내용 요약
Description: 변경사항 목록
→ CI/CD 체크 완료 후 Merge pull request → Confirm merge
```

```bash
# 2. 로컬 동기화
git checkout dev
git pull origin dev
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
> 머지 직후 반드시 계보를 다시 이어줄 것 — 파일은 하나도 안 바뀐다:
>
> ```bash
> git checkout dev && git pull origin dev
> git merge -s ours origin/main -m "chore: record vX.Y.Z release squash into dev"
> git push origin dev
> ```
>
> 이걸 빼먹으면 다음 릴리즈 PR 에서 **이미 배포된 내용이 충돌로 되살아나고**,
> 충돌 해결을 한 번 잘못하면 배포된 수정이 되돌아간다. 실제로 `#120` 이후 이 상태로 방치돼
> hotfix 4개(`#121`~`#123`)가 dev 에 없는 기간이 있었다.

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

**해결 방법 1 (권장):** Secret 값 자체를 영문+숫자만으로 재설정
```
GitHub → Settings → Secrets and variables → Actions
→ 해당 Secret 삭제 후 New repository secret으로 재생성
값: 영문+숫자 32자 이상 (예: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6)
```

**해결 방법 2:** CICD.yml에서 따옴표로 감싸기
```yaml
export VAR="${{ secrets.VAR }}"
```

**코드 변경 없이 재실행:**
```
GitHub → Actions 탭 → 실패한 워크플로우 클릭
→ Re-run jobs → Re-run failed jobs
```
