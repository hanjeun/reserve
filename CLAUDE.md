# RESERVE

가게·스튜디오·클리닉 등 업종을 가리지 않는 **범용 예약 플랫폼**. 1인 풀스택 프로젝트.

- 프로덕션: https://reserve.it.kr
- GitHub: `hanjeun/reserve` (public)
- 스택: Spring Boot 3.5.6 / Java 21 / MySQL 8 백엔드 + React 19 / Vite 7 / Ant Design 6 프론트
- 인프라: AWS Lightsail + Docker Blue/Green, S3 + CloudFront, GitHub Actions

---

## 절대 규칙

> **커밋 / PR 생성·머지 / 태그 / 배포는 "현재 대화에서 명시적 승인"을 받기 전엔 하지 않는다.**

파일 수정 자체는 승인 없이 진행해도 되지만, **git에 흔적을 남기는 행위는 전부 승인 대상**이다.
"저번에 승인했잖아"는 승인이 아니다 — 매 대화마다 새로 받는다.

수정은 `local-preview-all-changes` 프리뷰 브랜치에서 먼저 하고, 확인 후 정식 `feature/*` 브랜치로 옮겨 `dev`에 PR한다.

**코드에 대한 주장은 추측하지 말고 반드시 실제 파일을 읽어서 확인한다.**
이 문서도, `docs/`도, 스킬도, 정적 분석 리포트도 낡거나 틀릴 수 있다. 충돌하면 **실제 코드가 정답**이다.

---

## 브랜치 · 커밋

```
main   ← 배포 (push 시 CI/CD 자동 실행). PR 필수, 선형 히스토리 강제
dev    ← 통합 (기본 브랜치, PR 받는 곳)
feature/*, hotfix/*
```

- 머지는 **merge commit** (squash 아님)
- 커밋/PR 제목: **영어**, `type: subject`, 소문자 시작, 마침표 없음, 현재형
  (`feat` `fix` `refactor` `docs` `chore` `style` `release`)
- **릴리스 노트와 사용자 대상 문구는 한국어** — 의도된 것이다. 커밋 규칙 대상 아님
- 서버 로그는 영어, 사용자 메시지는 한국어. **코드 주석을 영어로 강제하는 규칙은 없다**

---

## 함정 (실제로 겪은 것만)

### DB
`ddl-auto: update` (마이그레이션 툴 없음). 엔티티에 필드를 추가하면 재시작 시 컬럼이 자동 생성되지만
**컬럼 삭제·타입 변경·제약 변경은 자동 반영되지 않는다** — 수동 DDL이 필요하다.

### Spring Boot 3.5 Page JSON
`totalElements`가 루트가 아니라 `page` 안에 있다.
```js
const total = result?.page?.totalElements ?? result?.totalElements ?? 0;
```

### antd 6
- `destroyOnClose` → **`destroyOnHidden`** (deprecated)
- `<Modal key={open ? 'a' : 'b'}>` **금지** — 닫을 때 언마운트돼서 닫힘 애니메이션이 죽는다
- `<Spin>` 인디케이터는 CSS로 덮지 말고 `ConfigProvider spin={{ indicator }}`를 쓴다
- 모바일에서 탭 오버플로 `…`을 **일부러 렌더하지 않는다**(UA 감지).
  `frontend/patches/@rc-component+tabs+1.7.0.patch`(patch-package)로 강제 노출 중 —
  **antd/rc-tabs 버전이 올라가면 패치를 다시 만들어야 한다**
- 이 패치 때문에 CI의 `npm ci`에서 `--ignore-scripts`를 쓸 수 없다(postinstall 필요). 의도된 트레이드오프

### 줄바꿈(CRLF)
`.gitattributes`에 `*.java` 규칙이 없어서 java 52개가 "내용은 같은데 전부 변경됨"으로 뜬 적이 있다.
지금은 `*.java` `*.gradle` `*.svg` `.env.example`까지 `eol=lf`로 고정했다.
비슷한 증상이 보이면 먼저 진짜 변경인지 확인할 것 —
`git diff --numstat --ignore-cr-at-eol` (`--name-only`에는 이 옵션이 안 먹으니 `--numstat`을 쓴다).

### 홈 화면 뷰포트
홈 섹션은 `100svh` 기준이다. `dvh`는 모바일에서 주소창이 접힐 때 커져 여백이 벌어진다 — 쓰지 말 것.

### 그 외
- 인바운드 이메일(ImprovMX)은 **폐기**됐다. 무료 플랜이 웹훅을 조용히 버린다 → Inquiry 도메인(DB 저장)으로 대체. 다시 시도하지 말 것
- Dependabot의 `@dependabot merge` 커맨드는 이 레포에서 무반응이다. `gh pr merge <n> --squash --delete-branch`로 직접 머지

---

## 릴리스 운영

`docs/technical/deployments.md`가 런북이다.

```bash
node scripts/sync-release-notes.mjs [vX.Y.Z] --apply   # CHANGELOG → GitHub 릴리즈 설명
node scripts/backfill-deployments.mjs --reset --apply  # 태그별 Deployment 재생성
```

`docs/CHANGELOG.md`는 **사용자 눈높이 한국어**로, *브랜드 한 줄 → 변경 내용 → 마무리 한 줄* 형식을 지킨다.
릴리즈가 없는 버전은 스크립트가 건너뛰므로 `gh release create`를 먼저 해야 한다.

---

## 문서

| 문서 | 내용 |
|---|---|
| `docs/technical/architecture.md` | 인프라·배포·S3 경로 |
| `docs/technical/structure.md` | 폴더 구조·라우트·환경변수 |
| `docs/technical/design-system.md` | 디자인 토큰·공통 컴포넌트 |
| `docs/technical/deployments.md` | 릴리즈·배포 기록 런북 |
| `docs/rules/code-conventions.md` | 네이밍·로그·주석 |
| `docs/rules/git-workflow.md` | 브랜치·커밋·PR |

더 깊은 맥락(도메인별 아키텍처, 전체 API 목록, 인증, DB 스키마)은 `reserve` 스킬의 `references/`에 있다.
