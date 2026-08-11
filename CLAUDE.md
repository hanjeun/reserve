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

## 설계 원칙 — 규칙은 주석이 아니라 코드에 둔다

이 프로젝트에서 반복된 회귀는 **전부** "주석에는 규칙이 있는데 강제 장치가 없는" 케이스였다.
필터 Select 색, 카드 hover 그림자, 확인 모달 줄바꿈 — 셋 다 주석에 "이렇게 해야 한다"만 있었고
새로 추가하는 사람이 매번 놓쳤다.

1. **정책은 관문 하나에서 강제한다.** 호출부 N곳을 고치는 대신 반드시 지나가는 지점에서 처리한다.
   `useMessage.confirm`(줄바꿈), `FormSelect`/`FilterSelect`(색·높이)가 그 형태다.
   className을 외워서 붙이게 만들면 반드시 샌다.
2. **전역 CSS는 `index.css`에.** 컴포넌트 파일 안 `<style>` 태그에 전역 규칙을 넣으면
   **그 컴포넌트를 안 쓰는 화면에는 규칙이 존재하지 않는다.** 이 함정에 두 번 빠졌다.
   컴포넌트에는 그 인스턴스에만 적용되는 인라인 `style`만 둔다.
3. **prop 분기가 3개를 넘으면 형제 컴포넌트로 갈라낸다.** 중첩을 깊게 하는 것보다 형제를 늘리는 게
   읽기 쉽다. (`SegmentedControl`의 `wrap`/`block`/`columns`가 그 경계에 있다 — 다음 후보)
4. **재사용은 두 번째 사용처가 생길 때 뺀다.** "혹시 재사용할까 봐" 미리 빼면 순수 손해고,
   두 번째가 미묘하게 다르면 복붙이 정답일 수도 있다.

세부는 `docs/technical/design-system.md`.

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

### 아이콘 회전 — 닫힘 상태를 `transform: none`으로 두면 방향이 뒤집힌다
`none` ↔ `rotate(180deg)` 전환은 각도가 아니라 **행렬 보간**이고, 정확히 180°는 방향이
결정되지 않는 퇴화 케이스라 엔진이 임의로 고른다("펼칠 때 반시계로 도는" 원인).
닫힘 상태에도 `rotate(0deg)`를 명시할 것. 회전 규칙과 되돌리기 절차는
`docs/technical/design-system.md`의 "꺾쇠·화살표 회전 규칙"에 있다.

### CSS 주석 — 종료 기호를 문자로 적으면 다음 규칙이 통째로 사라진다
주석 안에 주석 종료 기호를 그대로 적으면 거기서 주석이 끝난다. 뒤따르는 산문을 CSS 파서가
**선택자로 해석**하고, 에러 복구를 위해 **다음 중괄호 블록까지 삼켜서 버린다.**
`index.css`의 필터 Select 규칙이 이렇게 죽어 있었고("다크는 되는데 라이트만 회색") 두 세션을 날렸다.
JSX template literal 안 주석에 백틱을 못 쓰는 것과 같은 종류의 함정이다(그 백틱으로 앱을 못 뜨게 만든 전례도 있다).
```bash
node -e "const p=require('postcss');const r=p.parse(require('fs').readFileSync('src/index.css','utf8'));
r.walkRules(x=>{if(/[가-힣]/.test(x.selector))console.log('★ 파싱사고:',x.selector.slice(0,50))})"
```

### antd 6 — 클래스명이 바뀌었다
`.ant-select-selector`는 **antd 5 이름이고 6에는 그 요소가 없다**(자식은 `-content` `-placeholder`
`-input` `-prefix` `-suffix` `-selection-item`). 옛 이름은 조용히 무시된다 — `FormSelect`의 높이 CSS가
이래서 통째로 죽어 있었다. 배경·높이·모서리는 루트 `.ant-select`가 갖고, 값은 **CSS 커스텀 프로퍼티**
(`--ant-select-height` 등)로 흐른다. `padding-block`이 그 변수로 계산되므로 **`height`만 강제하면
글자가 위로 쏠린다** — 변수를 덮어야 한다. 클래스 목록은 `node_modules/@rc-component/select`에서 확인.

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
node scripts/backfill-deployments.mjs --apply          # 태그별 Deployment (빠진 것만 생성)
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
| `docs/technical/backup.md` | MySQL 백업·복원 런북 (스크립트는 `scripts/*-mysql.sh`) |
| `docs/technical/manual-ddl.md` | `ddl-auto`가 못 만드는 DDL(FULLTEXT·컬럼 삭제·타입 변경) 런북 + 적용 이력 |
| `docs/rules/code-conventions.md` | 네이밍·로그·주석 |
| `docs/rules/git-workflow.md` | 브랜치·커밋·PR |

더 깊은 맥락(도메인별 아키텍처, 전체 API 목록, 인증, DB 스키마)은 `reserve` 스킬의 `references/`에 있다.
