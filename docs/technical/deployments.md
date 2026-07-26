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

`.github/workflows/CICD.yml` 은 `main` push 시 블루-그린으로 배포하지만 **GitHub Deployment 객체를 만들지 않는다**
(`permissions: contents: read` 뿐). 그래서 저장소 Environments 탭·커밋 화면에 "언제 무엇이 production 에 나갔는지" 기록이 없다.

### 2-1. 과거 백필 (한 번만)

지난 태그 전부에 Deployment(+success)를 소급 생성한다. **시각은 '지금'으로 찍힌다**(과거 배포 시각 아님, 일관성/기록용).

```bash
node scripts/backfill-deployments.mjs          # 미리보기
node scripts/backfill-deployments.mjs --apply  # 실제 생성
```

> 실행 전, 저장소 Settings → Environments 에서 `production` 환경을 먼저 만들어 두면 깔끔하다(없어도 API가 자동 생성).

### 2-2. 앞으로: CICD.yml 에 배포 기록 붙이기

`deploy-backend` 잡이 실제 production 배포다. 여기에 first-party `actions/github-script` 로
"배포 시작 → 성공/실패" 상태를 남긴다. 외부 액션 의존성 없이 동작한다.

**(a) 워크플로 상단 permissions 를 이렇게 확장:**

```yaml
permissions:
  contents: read
  deployments: write
```

**(b) `deploy-backend` 잡의 `steps:` 맨 앞에 배포 생성 스텝 추가:**

```yaml
      - name: Create GitHub deployment
        id: deployment
        uses: actions/github-script@v7
        with:
          script: |
            const dep = await github.rest.repos.createDeployment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              ref: context.sha,
              environment: 'production',
              required_contexts: [],
              auto_merge: false,
              production_environment: true,
              description: 'Blue/Green backend deploy',
            });
            core.setOutput('id', dep.data.id);
```

**(c) 잡의 맨 끝(현재 "Cleanup Docker resources" 뒤)에 성공/실패 상태 스텝 추가:**

```yaml
      - name: Mark deployment success
        if: success()
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.repos.createDeploymentStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              deployment_id: ${{ steps.deployment.outputs.id }},
              state: 'success',
              environment_url: 'https://reserve.it.kr',
              description: 'Deployed to production',
            });

      - name: Mark deployment failure
        if: failure() && steps.deployment.outputs.id
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.repos.createDeploymentStatus({
              owner: context.repo.owner,
              repo: context.repo.repo,
              deployment_id: ${{ steps.deployment.outputs.id }},
              state: 'failure',
              description: 'Deploy failed (health check/rollback)',
            });
```

> 적용은 프리뷰 브랜치(`local-preview-all-changes`)에서 먼저 검토 후 백포트. 원하면 이 블록을 CICD.yml 에 직접 넣어줄 수 있음.

---

## 3. 저장소 보호 & PR/브랜치 정리

### 3-1. 브랜치 보호 (main)

UI: Settings → Branches → Add rule. gh CLI (PowerShell here-string):

```powershell
@'
{
  "required_status_checks": { "strict": true, "contexts": ["build-backend", "build-frontend"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
'@ | gh api --method PUT repos/hanjeun/reserve/branches/main/protection --input -
```

> ✅ 적용됨(2026-07-26). 확인: `gh api repos/hanjeun/reserve/branches/main/protection --jq '.required_status_checks.contexts'`

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

### 3-3. Dependabot 메이저 무시 (#79, #76)

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

## 실행 순서 (권장)

1. `sync-release-notes.mjs --apply` — 릴리즈 설명 정리 (브랜치 보호와 무관, 지금 가능)
2. 3-1 브랜치 보호 → 3-2 자동 삭제 → 3-3 Dependabot 정리
3. `production` 환경 생성 → `backfill-deployments.mjs --apply` → 2-2 CICD.yml 블록 적용(프리뷰 브랜치)
