# RESERVE hover · 눌림 · 선택 상태 전수검색

2026-09-13 · local-preview-all-changes 로컬 프리뷰. 운영 배포 증거가 아니다.

**시점 기록:** 아래 전수검색·행 수·해시는 당시의 스냅샷이다. 같은 날짜의 후속 검색/탐색 디자인 작업에서 입력 기반 작은 필터를 `FilterMenu`로 교체하고 공통 탭·뒤로가기를 수정했으므로 최신 파일과 일치하지 않는다. 현재 정책은 [design-system.md](../../design-system.md), 검색·탭 분류는 [search-ui.md](../../search-ui.md)를 따른다. 아래 검증 결과를 후속 변경의 실행 증거로 재사용하지 않는다.

후속 디자인 실측은 [design-measurements-2026-09-13.md](design-measurements-2026-09-13.md)에 별도로 기록했다. 현재 분야·정렬은 PC·모바일 모두 오른쪽, 메뉴는 128px 최소 폭/모바일 40px·PC 36px 항목, 검색 pill은 44px다. PC 뒤로가기는 숨기며 워드마크는 원래 글꼴·22px·850 굵기로 복원했다. 홈 물체·추천 행·공개 탐색의 hoverable 카드에만 모션 감소를 존중하는 2px hover 상승이 있다. 아래의 옛 칩 규칙·48px 검색·치수·해시는 과거 시점 기록으로 보존한다.

## 결론

일반 탐색 링크·필터를 hover했다고 파란색으로 바꾸는 것은 기존 중립 UI와 맞지 않는다.
브랜드 버튼의 본래 색, 선택 상태의 primary-light 면, 오류·즐겨찾기 색, 키보드 포커스 링은 별개다.
새 홈의 파란 hover, 페이지별 헤더 덮어쓰기와 목록 카드 크롭을 수정했다.
공통 버튼의 인라인 opacity 충돌도 수정했다. 모든 운영 화면을 실제로 실행해 검증했다는 뜻은 아니다.

## 범위와 방법

- frontend/src의 프로덕션 CSS 7개와 JS/JSX/TS/TSX 193개, 총 200개 파일을 상태 규칙 대상으로 검색했다.
- 최종 파일 줄 수 합계 30,203줄. 줄 수는 CRLF/LF를 구분해 나눈 행 수이며 마지막 개행도 포함한다. 파일별 SHA-256과 경로는 부록 D에 있다.
- 수정 전 hover/active/focus CSS 규칙 129개, 수정 후 162개를 PostCSS로 추출했다. 선택자 묶음과 미디어쿼리별 규칙을 한 항목으로 센다. 항목 수는 버그 수가 아니다.
- 선택·열림·비활성 관련 추가 검색 후보 85개. hover와 겹치는 규칙, interactive라는 이름, 애니메이션 active 클래스도 포함하므로 모두 선택 상태라고 단정하지 않는다.
- JS 이벤트·pressed·aria-pressed 검색 결과 32개. 이벤트 함수 정의·사용처·주석과 접근성 속성이 섞여 있다. whileHover/whileTap 검색 결과는 0건이다.
- [design-system.md](../../design-system.md)는 작업 시작 시 598줄 전체를 읽었고, 토큰·App의 AntD 설정·관련 공통 컴포넌트·실제 계산된 스타일을 대조했다.
- node_modules 전체, public의 모든 과거 이미지/목업, 서버·운영 DB·AWS는 전수검색 범위가 아니다. AntD 런타임 스타일은 해당 화면의 필터·옵션 등 필요한 곳만 직접 확인했다.
- 로그인·사업자·관리자 화면을 전부 실행하거나 예약/즐겨찾기/결제를 실제 변경하지 않았다. 파일 검색은 모든 경로의 동작 증명이 아니다.

## 확인한 원인과 수정

| 항목 | 실제 원인 | 이번 수정 |
|---|---|---|
| 지역 링크가 파란 hover | 평상시 중립색만 선언하고 hover는 라이브러리 기본값에 맡김 | 중립 hover 명시, 투명도 피드백 |
| 새 홈 바로가기·전체 보기·추천 가게 이름 | feature-surfaces.css의 명시적 primary hover | 중립색 유지, 이미지/링크 투명도와 inward active |
| 검색 화면 | 분야·키워드·취소·전체 보기 hover를 primary로 묶음 | 역할에 맞는 중립색/회색 면, active 축소 |
| 공통 버튼 | Button.jsx의 평상시 인라인 opacity: 1이 CSS hover/active opacity보다 우선 | 정상 인라인 opacity 생략, disabled 값과 호출부 style 유지 |
| 가게 추가 카드 | 기존 CSS의 primary hover가 인라인 border/color와 충돌 | 중립 테두리·진한 글자를 공통 CSS에서 강제, active 추가 |
| 헤더 뒤틀림 | 홈만 56px/다른 배경/다른 간격; 다른 화면은 64px | 공통 헤더 64px, 동일 inner 폭·간격·여백·배경 |
| 전용 검색 헤더 | 입력 행이 모바일 72px, PC 96px | 입력 48px는 유지하고 전체 행을 64px로 통일 |
| 가게 목록 이미지 | 페이지 전용 height 190px/모바일 220px !important | 두 크롭 삭제; 원래 Card.Cover width 100%/height auto 복원 |
| 추천 목록 | 이름/소개/평점 순서는 이미 올바른 JSX였지만 이름 hover와 작은 글자 위계가 어긋남 | 작은 썸네일 행 유지, 이름 → 소개 → 평점·리뷰·분류/주소 위계 정리 |
| 선택된 페이지 번호 | selected scale(1.04) !important가 active scale(0.94)를 이김 | active 우선순위 보정, 모션 감소에서는 확대·전환 해제 |
| 시간 칩 | selected scale(1.04)만 있고 실제 누르는 상태의 축소 없음 | active 0.96 추가; 선택 후 표현과 pressed를 구분 |
| 상세 정보 링크 | RowValue가 JS 이벤트에서 중립 글자색을 primary로 바꿈 | 외부 지도 링크 동작 유지, 중립 CSS hover/active/focus로 이동 |

일반 StoreCard 컴포넌트와 Card.Cover 자체는 이번에 변경하지 않았다.
기존 각진 카드·4→3→2→1열 경계·카드 본문의 중립 그림자/사진 줌은 유지한다.
원본이 정사각형이면 이미지도 정사각형이다. 정사각형 이미지를 임의로 낮고 긴 사진으로 자르지 않는다.
홈 추천 행은 별도 패턴으로 모바일 64px/태블릿·PC 80px 썸네일, 반경 14px를 사용한다.
리뷰가 없는 실제 응답은 "아직 리뷰가 없어요"로 표시한다. 가짜 평점·주소·추천 순위는 만들지 않는다.

작은 목록 필터는 FilterSelect appearance="chip" 공통 관문으로 만든다.
높이 36px, 반경 pill 100px, 글자 14px/행 높이 20px, 내용에 맞는 폭이다.
기본 FilterSelect의 large와 회색 입력형 FormSelect는 유지한다.
기존 서비스 분야·정렬의 값/옵션/API/거리순 위치 권한 처리·로딩 핸들러는 바꾸지 않는다.

## Hover와 혼동하면 안 되는 상태

| 패턴 | 현재 의미 |
|---|---|
| primary/danger/색 지정 link 버튼 | 본래 브랜드/의미 색을 유지하고 hover에서는 주로 투명도 변화 |
| 선택된 Select 옵션·시간 옵션 | primary-light 선택 면; 일반 hover는 회색 |
| 선택된 Messenger/MailList 행 | 선택 상태의 primary-light 면; 아직 선택하지 않은 행의 hover와 다름 |
| pill tabs·SegmentedControl | 회색 선택 면 + 진한 글자 |
| 일반 AntD tabs | App 설정의 선택색은 accent; pill tabs CSS와는 다른 패턴 |
| 페이지네이션·시간 칩의 선택 후 1.04 | 기존 선택 강조. 누르는 동안에는 inward active가 우선하며 모션 감소에서는 확대를 끔 |
| 채팅 보내기 버튼 hover | 본래 primary 면의 dark 톤으로 변화하는 명시적 브랜드 액션 |
| 소셜 버튼 | 중립 원 + GitHub/Velog 공식 브랜드 마크 |
| 위험/휴지통·즐겨찾기 | 오류/위험색 또는 빨간 선택 하트. 탐색 hover 파란색과 무관 |
| focus-visible/focus-within | 키보드/입력 위치 표시. hover가 아니라 접근성 상태 |

## 남아 있는 정리 후보와 제한

이번에 요청한 홈·검색·목록·공통 헤더·관련 버튼을 수정했으며, 아래를 모든 화면에서 고쳤다고 주장하지 않는다.

- pill tabs는 실제 탭 본체의 별도 active 축소가 없고, 넘침 메뉴 버튼에는 0.94가 있다. 이 두 타깃의 pressed 정책은 추가 정리 후보다.
- 날짜 셀·달력 이동/트리거, 모달 닫기, 이미지 preview 도구, Messenger/MailList 행은 회색 면/포커스/선택 피드백을 사용하지만 전부 같은 축소 효과를 갖지는 않는다. 실제 타깃 크기·드래그/키보드 동작을 보고 정리해야 한다. 모달 전체나 선택 입력칸에 전역 scale을 걸지 않는다.
- Footer의 3종 링크/버튼은 중립색 onMouseEnter/onMouseLeave를 인라인으로 갖고 있다. 파란 hover 원인은 아니며, 추후 공통 CSS 상태로 옮길 후보다.
- Hero 버튼은 기존 파란 glow/그림자 예외다. 새 사진 중심 홈의 기본 탐색에 이 효과를 전파하지 않았다.
- 순수 AntD 컴포넌트와 호출부 인라인 style은 공통 컴포넌트와 우선순위가 다를 수 있다. 부록의 CSS 규칙이 모든 화면에서 항상 승리한다고 추정하지 않는다.
- 오래된 Home mockup의 pressed/hover 규칙은 검색 결과에 포함했다. 현재 홈에서 실제 노출된다는 뜻은 아니며 이번에 삭제하지 않았다.

## 실제 직접 확인

- 참고 [캐치테이블 공개 목록](https://app.catchtable.co.kr/ct/exhibition/200622_price_level_5to10?isUseExhibitionFilter=1&metaContractedType=0&currentExhibitionKey=200622_price_level_5to10&serviceType=DINING&sortMethod=review_count&isInitialDate=0&uniqueListId=1789273458332): 내 주변/지역/음식 종류/가격/테이블 타입은 실제 36px 높이, 14px 글꼴, 약 40px 반경과 내용 기반 폭이었다. 타사 로고·사진·CSS 파일은 복사하지 않고 기존 RESERVE pill 토큰으로 재구현했다.
- localhost 홈/가게 목록: 390px 레이아웃에서 공통 헤더 모두 64px, 가로 문서 overflow 없음.
- 390px 필터의 실제 border box 36px, radius 100px, 흰 면과 중립색 확인. 강제 hover+active 계산 결과 border rgb(181,184,189), text rgb(26,31,39), scale 0.97. CSS :active 상태를 확인한 것이며 실제 예약이나 데이터 액션을 실행한 것이 아니다.
- 실제 드롭다운을 열어 선택 항목이 primary-light rgb(232,243,255)이고 칩은 중립색인 것을 확인했다. 분야/거리순 값을 바꿔 위치 권한을 요청하지 않았다.
- 홈 지역 hover는 중립 글자색/opacity 0.75, 바로가기는 중립 글자색/active scale 0.97·opacity 0.88. 이름·소개·meta DOM 순서를 확인했다. 두 실제 가게에 리뷰가 없어 별점을 꾸미지 않았다.
- 1440px 홈: header inner 1248px, 바로가기 10열, 추천 2열, 썸네일 80px, 가로 문서 overflow 없음.
- 1440px 목록: 원래 4열, 헤더 64px, 가로 문서 overflow 없음. 실제 이미지 1200×630은 약 268×141, 512×512는 약 268×268로 원본 비율이었다.
- 전용 검색: 입력 자동 포커스와 취소 복귀 확인. 기본 브라우저 크기/1440px에서 입력 헤더 64px, PC 분야 6열, 가로 문서 overflow 없음.
- 상세 화면: 공통 헤더 64px, 공통 버튼 정상 inline opacity가 비어 있는 것을 확인했다. 실제 뒤로가기 ghost 버튼의 강제 hover+active는 opacity 0.5/scale 0.94였다. 모션 감소에서는 scale이 없고 transition 0s이며 상태 투명도는 유지됐다. 예약·문의·즐겨찾기 버튼은 클릭하지 않았다.
- 임시 viewport·미디어 에뮬레이션·CSS pseudo 상태를 모두 해제하고 기본 브라우저 크기/시스템 테마로 복원했다. 최종 홈의 실제 다크 화면도 직접 확인했고 참고용 임시 탭은 닫았다.
- 변경 JSX 5개 대상 ESLint 통과, CSS 7개 PostCSS 파싱 및 산문 선택자 사고 검사 통과, git diff --check 통과(기존 다른 파일의 CRLF 경고만 있음).
- Backend/Vitest/Playwright suite/전체 lint/production build/성능·번들·배포 검증은 실행하지 않았다. 파일·브라우저 디자인 확인을 운영 검증으로 확대하지 않는다.
- 커밋·스테이징·push·PR·배포·서버·AWS·DB 변경 없음. 기존 미커밋 작업은 보존한다.

## 부록 A — 현재 CSS hover/active/focus 규칙 162개

수정 후 전체 검색 결과다. 각 주석에 실제 파일/시작 행과 상위 조건을 보존했다.
미디어쿼리/다크 조건이 다르면 같은 선택자도 별도 규칙이다. 이 코드 블록은 조사 기록이지 새로 로드할 스타일시트가 아니다.

```css
/* 1. src/styles/global/components-and-forms.css:28 | 기본 */
.reserve-card-link:hover {
    color: inherit;
}

/* 2. src/styles/global/components-and-forms.css:29 | 기본 */
.reserve-card-link:active {
    transform: scale(0.98);
    opacity: 0.88;
}

/* 3. src/styles/global/components-and-forms.css:30 | 기본 */
.reserve-card-link:focus {
    outline: none;
}

/* 4. src/styles/global/components-and-forms.css:31 | 기본 */
.reserve-card-link:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: -3px;
}

/* 5. src/styles/global/components-and-forms.css:35 | 기본 */
.reserve-card--interactive:focus {
    outline: none;
}

/* 6. src/styles/global/components-and-forms.css:36 | 기본 */
.reserve-card--interactive:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 7. src/styles/global/components-and-forms.css:40 | 기본 */
.reserve-card.ant-card-hoverable:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

/* 8. src/styles/global/components-and-forms.css:43 | 기본 */
.reserve-card.ant-card-hoverable:hover .reserve-card-image {
    transform: scale(1.05);
}

/* 9. src/styles/global/components-and-forms.css:53 | @media (prefers-reduced-motion: reduce) */
.reserve-card-link:active {
    transform: none;
}

/* 10. src/styles/global/components-and-forms.css:54 | @media (prefers-reduced-motion: reduce) */
.reserve-card.ant-card-hoverable:hover .reserve-card-image {
    transform: none;
}

/* 11. src/styles/global/components-and-forms.css:74 | 기본 */
.reserve-card-add:hover {
    border-color: var(--c-border-default, #e5e8eb) !important;
    color: var(--c-text-primary, #1a1f27) !important;
}

/* 12. src/styles/global/components-and-forms.css:78 | 기본 */
.reserve-card-add:active {
    transform: scale(0.97);
}

/* 13. src/styles/global/components-and-forms.css:85 | 기본 */
.reserve-card-add:focus,
.reserve-card-action:focus {
    outline: none;
}

/* 14. src/styles/global/components-and-forms.css:87 | 기본 */
.reserve-card-add:focus-visible,
.reserve-card-action:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 15. src/styles/global/components-and-forms.css:105 | 기본 */
.reserve-btn:focus {
    outline: none;
}

/* 16. src/styles/global/components-and-forms.css:106 | 기본 */
.reserve-btn:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 17. src/styles/global/components-and-forms.css:110 | 기본 */
.reserve-btn--primary:active:not(:disabled),
.reserve-btn--secondary:active:not(:disabled),
.reserve-btn--danger:active:not(:disabled),
.reserve-btn--hero:active:not(:disabled) {
    transform: scale(0.96);
    opacity: 0.88;
}

/* 18. src/styles/global/components-and-forms.css:117 | 기본 */
.reserve-btn--primary:hover:not(:disabled) {
    opacity: 0.9;
}

/* 19. src/styles/global/components-and-forms.css:118 | 기본 */
.reserve-btn--secondary:hover:not(:disabled) {
    opacity: 0.85;
}

/* 20. src/styles/global/components-and-forms.css:119 | 기본 */
.reserve-btn--hero:hover:not(:disabled) {
    opacity: 0.92;
    box-shadow: 0 12px 24px rgba(49, 130, 246, 0.28);
}

/* 21. src/styles/global/components-and-forms.css:121 | 기본 */
.reserve-btn--ghost-sm:hover:not(:disabled) {
    opacity: 0.7;
}

/* 22. src/styles/global/components-and-forms.css:122 | 기본 */
.reserve-btn--ghost-sm:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.95);
}

/* 23. src/styles/global/components-and-forms.css:123 | 기본 */
.reserve-btn--ghost-sm-primary:hover:not(:disabled) {
    opacity: 0.7;
}

/* 24. src/styles/global/components-and-forms.css:124 | 기본 */
.reserve-btn--ghost-sm-primary:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.95);
}

/* 25. src/styles/global/components-and-forms.css:125 | 기본 */
.reserve-btn--ghost-sm-success:hover:not(:disabled) {
    opacity: 0.7;
}

/* 26. src/styles/global/components-and-forms.css:126 | 기본 */
.reserve-btn--ghost-sm-success:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.95);
}

/* 27. src/styles/global/components-and-forms.css:127 | 기본 */
.reserve-btn--ghost-sm-danger:hover:not(:disabled) {
    opacity: 0.7;
}

/* 28. src/styles/global/components-and-forms.css:128 | 기본 */
.reserve-btn--ghost-sm-danger:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.95);
}

/* 29. src/styles/global/components-and-forms.css:132 | 기본 */
.reserve-btn--outline:hover:not(:disabled) {
    border-color: #adb5bd;
    background: rgba(0, 0, 0, 0.02);
}

/* 30. src/styles/global/components-and-forms.css:133 | 기본 */
.reserve-btn--outline:active:not(:disabled) {
    transform: scale(0.96);
    opacity: 0.88;
}

/* 31. src/styles/global/components-and-forms.css:134 | 기본 */
.reserve-btn--ghost:hover:not(:disabled) {
    opacity: 0.7;
}

/* 32. src/styles/global/components-and-forms.css:135 | 기본 */
.reserve-btn--ghost:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.94);
}

/* 33. src/styles/global/components-and-forms.css:136 | 기본 */
.reserve-btn--link:hover:not(:disabled) {
    opacity: 0.75;
}

/* 34. src/styles/global/components-and-forms.css:137 | 기본 */
.reserve-btn--link:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.96);
}

/* 35. src/styles/global/components-and-forms.css:150 | 기본 */
.reserve-favorite-button:hover:not(:disabled) {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16) !important;
}

/* 36. src/styles/global/components-and-forms.css:151 | 기본 */
.reserve-favorite-button:active:not(:disabled) {
    transform: scale(0.94);
}

/* 37. src/styles/global/components-and-forms.css:152 | 기본 */
.reserve-favorite-button:focus {
    outline: none;
}

/* 38. src/styles/global/components-and-forms.css:153 | 기본 */
.reserve-favorite-button:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 39. src/styles/global/components-and-forms.css:165 | 기본 */
.reserve-form-field-button:hover:not(:disabled) {
    opacity: 0.9;
}

/* 40. src/styles/global/components-and-forms.css:166 | 기본 */
.reserve-form-field-button:active:not(:disabled) {
    transform: scale(0.96);
    opacity: 0.88;
}

/* 41. src/styles/global/components-and-forms.css:168 | 기본 */
.reserve-form-field-button:focus {
    outline: none;
}

/* 42. src/styles/global/components-and-forms.css:169 | 기본 */
.reserve-form-field-button:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
    position: relative;
    z-index: 1;
}

/* 43. src/styles/global/feature-surfaces.css:60 | 기본 */
.reserve-maillist-item:not(.is-selected):hover {
    background: var(--c-bg-subtle, rgba(0, 0, 0, 0.03));
}

/* 44. src/styles/global/feature-surfaces.css:61 | 기본 */
.reserve-maillist-item:not(.is-selected):active {
    background: rgba(0, 0, 0, 0.06);
}

/* 45. src/styles/global/feature-surfaces.css:63 | 기본 */
.reserve-maillist-item:not(.is-selected):focus-within {
    background: var(--c-bg-subtle, rgba(0, 0, 0, 0.03));
}

/* 46. src/styles/global/feature-surfaces.css:71 | 기본 */
.reserve-maillist-item.is-selected:hover {
    background: color-mix(in srgb, var(--c-primary, #3182f6) 14%, var(--c-bg-paper, #fff));
}

/* 47. src/styles/global/feature-surfaces.css:88 | 기본 */
.reserve-maillist-item:hover .reserve-maillist-trash {
    opacity: 1;
}

/* 48. src/styles/global/feature-surfaces.css:89 | 기본 */
.reserve-maillist-trash:hover {
    color: var(--c-error, #f04452);
    background: var(--c-error-light, #fff0f1);
}

/* 49. src/styles/global/feature-surfaces.css:93 | 기본 */
.reserve-maillist-trash:active {
    transform: scale(0.9);
}

/* 50. src/styles/global/feature-surfaces.css:94 | 기본 */
.reserve-maillist-trash:focus-visible {
    opacity: 1;
}

/* 51. src/styles/global/feature-surfaces.css:119 | 기본 */
.reserve-cal-cell:hover:not(:disabled) {
    background-color: var(--c-gray-100, #f2f4f6);
}

/* 52. src/styles/global/feature-surfaces.css:139 | 기본 */
.reserve-cal-trigger:hover {
    background-color: var(--c-gray-100, #f2f4f6);
}

/* 53. src/styles/global/feature-surfaces.css:155 | 기본 */
.reserve-form-cal-part:hover {
    background: var(--c-gray-100, #f2f4f6);
}

/* 54. src/styles/global/feature-surfaces.css:162 | 기본 */
.reserve-form-cal-part:focus {
    outline: none;
}

/* 55. src/styles/global/feature-surfaces.css:163 | 기본 */
.reserve-form-cal-part:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 56. src/styles/global/feature-surfaces.css:182 | 기본 */
.reserve-cal-nav:hover:not(:disabled) {
    background-color: var(--c-gray-100, #f2f4f6);
    color: var(--c-text-primary, #1a1f27);
}

/* 57. src/styles/global/feature-surfaces.css:214 | 기본 */
.reserve-chat-launcher:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.16);
}

/* 58. src/styles/global/feature-surfaces.css:218 | 기본 */
.reserve-chat-launcher:active {
    transform: scale(0.93);
}

/* 59. src/styles/global/feature-surfaces.css:219 | 기본 */
.reserve-chat-launcher:focus-visible {
    outline: 2px solid var(--c-primary, #3182f6);
    outline-offset: 3px;
}

/* 60. src/styles/global/feature-surfaces.css:264 | 기본 */
.reserve-chat-composer:focus-within {
    border-color: var(--c-primary, #3182f6);
    box-shadow: 0 0 0 3px rgba(49, 130, 246, 0.14);
}

/* 61. src/styles/global/feature-surfaces.css:281 | 기본 */
.reserve-chat-close:hover {
    background: var(--c-gray-100, #f2f4f6);
    color: var(--c-text-secondary, #4e5968);
}

/* 62. src/styles/global/feature-surfaces.css:285 | 기본 */
.reserve-chat-close:focus {
    outline: none;
    box-shadow: none;
}

/* 63. src/styles/global/feature-surfaces.css:286 | 기본 */
.reserve-chat-close:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
    box-shadow: none;
}

/* 64. src/styles/global/feature-surfaces.css:293 | 기본 */
.reserve-header-avatar-trigger:focus {
    outline: none;
}

/* 65. src/styles/global/feature-surfaces.css:294 | 기본 */
.reserve-header-avatar-trigger:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 66. src/styles/global/feature-surfaces.css:307 | 기본 */
.reserve-profile-image-button:focus {
    outline: none;
}

/* 67. src/styles/global/feature-surfaces.css:308 | 기본 */
.reserve-profile-image-button:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 3px;
}

/* 68. src/styles/global/feature-surfaces.css:317 | 기본 */
.reserve-chat-send:hover:not(:disabled) {
    background: var(--c-primary-dark, #2272eb);
}

/* 69. src/styles/global/feature-surfaces.css:318 | 기본 */
.reserve-chat-send:active:not(:disabled) {
    transform: scale(0.9);
}

/* 70. src/styles/global/feature-surfaces.css:464 | 기본 */
.reserve-messenger-row:hover {
    background: var(--c-gray-50, #f9fafb);
}

/* 71. src/styles/global/feature-surfaces.css:466 | 기본 */
.reserve-messenger-row:focus {
    outline: none;
}

/* 72. src/styles/global/feature-surfaces.css:467 | 기본 */
.reserve-messenger-row:focus-visible {
    z-index: 1;
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: -3px;
}

/* 73. src/styles/global/feature-surfaces.css:704 | @media (max-width: 767px) */
.reserve-messenger-mobile-back:focus {
    outline: none;
}

/* 74. src/styles/global/feature-surfaces.css:705 | @media (max-width: 767px) */
.reserve-messenger-mobile-back:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 75. src/styles/global/feature-surfaces.css:728 | @media (prefers-reduced-motion: reduce) */
.reserve-btn:active:not(:disabled),
    .reserve-card-add:active,
    .reserve-card-action:active,
    .reserve-favorite-button:active,
    .reserve-form-field-button:active:not(:disabled),
    .ad-banner-close-btn:active {
    transform: none !important;
}

/* 76. src/styles/global/feature-surfaces.css:749 | @media (prefers-reduced-motion: reduce) */
.reserve-chat-launcher:hover,
    .reserve-chat-launcher:active,
    .reserve-chat-send:active,
    .reserve-maillist-trash:active {
    transform: none;
}

/* 77. src/styles/global/feature-surfaces.css:797 | 기본 */
.ant-btn:not(.reserve-btn):active:not(:disabled):not(.ant-btn-loading) {
    transform: scale(0.96);
    opacity: 0.88;
}

/* 78. src/styles/global/feature-surfaces.css:806 | 기본 */
.ant-modal-footer .ant-btn-default:not(.reserve-btn):hover,
.ant-modal-confirm-btns .ant-btn-default:not(.reserve-btn):hover {
    border-color: #adb5bd;
    color: var(--c-text-primary, #1a1f27);
    background: rgba(0, 0, 0, 0.02);
}

/* 79. src/styles/global/feature-surfaces.css:812 | 기본 */
.ant-pagination-item:active,
.ant-pagination-prev:active,
.ant-pagination-next:active {
    transform: scale(0.94) !important;
}

/* 80. src/styles/global/feature-surfaces.css:927 | 기본 */
.reserve-header-search:hover {
    color: var(--c-text-tertiary, #8b95a1);
    background: var(--c-gray-100, #f2f4f6);
}

/* 81. src/styles/global/feature-surfaces.css:930 | 기본 */
.reserve-header-logo:hover,
.reserve-header-avatar-trigger:hover {
    opacity: 0.8;
}

/* 82. src/styles/global/feature-surfaces.css:932 | 기본 */
.reserve-header-search:active {
    transform: scale(0.98);
    opacity: 0.88;
}

/* 83. src/styles/global/feature-surfaces.css:933 | 기본 */
.reserve-header-logo:active,
.reserve-header-avatar-trigger:active {
    transform: scale(0.94);
}

/* 84. src/styles/global/feature-surfaces.css:943 | 기본 */
.reserve-header-search:focus {
    outline: none;
}

/* 85. src/styles/global/feature-surfaces.css:944 | 기본 */
.reserve-header-search:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: -2px;
}

/* 86. src/styles/global/feature-surfaces.css:948 | 기본 */
.reserve-header-logo:focus {
    outline: none;
}

/* 87. src/styles/global/feature-surfaces.css:949 | 기본 */
.reserve-header-logo:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: -2px;
}

/* 88. src/styles/global/feature-surfaces.css:1156 | 기본 */
.reserve-discovery-shortcut:hover {
    color: var(--c-text-primary, #191f28);
}

/* 89. src/styles/global/feature-surfaces.css:1157 | 기본 */
.reserve-discovery-more:hover {
    color: var(--c-text-secondary, #4e5968);
    opacity: 0.75;
}

/* 90. src/styles/global/feature-surfaces.css:1158 | 기본 */
.reserve-discovery-shortcut:hover img {
    opacity: 0.88;
}

/* 91. src/styles/global/feature-surfaces.css:1160 | 기본 */
.reserve-discovery-top-nav a:hover {
    color: var(--c-text-primary, #191f28);
}

/* 92. src/styles/global/feature-surfaces.css:1161 | 기본 */
.reserve-discovery-location-link:hover {
    color: var(--c-text-primary, #191f28);
    opacity: 0.75;
}

/* 93. src/styles/global/feature-surfaces.css:1162 | 기본 */
.reserve-discovery-location > a:last-child:hover {
    color: var(--c-text-secondary, #4e5968);
    opacity: 0.75;
}

/* 94. src/styles/global/feature-surfaces.css:1173 | 기본 */
.reserve-discovery-top-nav a:active,
.reserve-discovery-location a:active,
.reserve-discovery-banner:active,
.reserve-discovery-banner-next:active,
.reserve-discovery-shortcut:active,
.reserve-discovery-more:active,
.reserve-discovery-store:not(.reserve-discovery-store-skeleton):active {
    transform: scale(0.97);
    opacity: 0.88;
}

/* 95. src/styles/global/feature-surfaces.css:1280 | 기본 */
.reserve-discovery-store:hover {
    color: var(--c-text-primary, #191f28);
}

/* 96. src/styles/global/feature-surfaces.css:1281 | 기본 */
.reserve-discovery-store:hover .reserve-discovery-store-media {
    opacity: 0.88;
}

/* 97. src/styles/global/feature-surfaces.css:1405 | 기본 */
.reserve-discovery-home a:focus,
.reserve-discovery-home button:focus {
    outline: none;
}

/* 98. src/styles/global/feature-surfaces.css:1407 | 기본 */
.reserve-discovery-home a:focus-visible,
.reserve-discovery-home button:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: -3px;
}

/* 99. src/styles/global/feature-surfaces.css:1425 | @media (prefers-reduced-motion: reduce) */
.reserve-discovery-top-nav a:active,
    .reserve-discovery-location a:active,
    .reserve-discovery-banner:active,
    .reserve-discovery-banner-next:active,
    .reserve-discovery-shortcut:active,
    .reserve-discovery-more:active,
    .reserve-discovery-store:active,
    .reserve-header-search:active,
    .reserve-header-logo:active,
    .reserve-header-avatar-trigger:active {
    transform: none;
}

/* 100. src/styles/global/feature-surfaces.css:1473 | 기본 */
.reserve-search-field:focus-within {
    border-color: var(--c-primary, #3182f6);
}

/* 101. src/styles/global/feature-surfaces.css:1570 | 기본 */
.reserve-search-domain:hover,
.reserve-search-submit:not(:disabled):hover,
.reserve-search-clear:hover {
    color: var(--c-text-primary, #191f28);
}

/* 102. src/styles/global/feature-surfaces.css:1573 | 기본 */
.reserve-search-keywords button:hover,
.reserve-search-cancel:hover,
.reserve-search-browse-all:hover {
    color: var(--c-text-secondary, #4e5968);
    opacity: 0.75;
}

/* 103. src/styles/global/feature-surfaces.css:1576 | 기본 */
.reserve-search-keywords button:hover {
    background: var(--c-gray-100, #f2f4f6);
    opacity: 1;
}

/* 104. src/styles/global/feature-surfaces.css:1577 | 기본 */
.reserve-search-domain:hover img {
    opacity: 0.88;
}

/* 105. src/styles/global/feature-surfaces.css:1583 | 기본 */
.reserve-search-page a:active,
.reserve-search-page button:active:not(:disabled) {
    transform: scale(0.96);
    opacity: 0.88;
}

/* 106. src/styles/global/feature-surfaces.css:1585 | 기본 */
.reserve-search-page a:focus,
.reserve-search-page button:focus {
    outline: none;
}

/* 107. src/styles/global/feature-surfaces.css:1587 | 기본 */
.reserve-search-page a:focus-visible,
.reserve-search-page button:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: -2px;
}

/* 108. src/styles/global/feature-surfaces.css:1600 | @media (prefers-reduced-motion: reduce) */
.reserve-search-page a:active,
    .reserve-search-page button:active {
    transform: none;
}

/* 109. src/styles/global/feature-surfaces.css:1613 | 기본 */
.reserve-store-detail .reserve-store-info-link:hover {
    opacity: 0.75;
}

/* 110. src/styles/global/feature-surfaces.css:1614 | 기본 */
.reserve-store-detail .reserve-store-info-link:active {
    transform: scale(0.97);
}

/* 111. src/styles/global/feature-surfaces.css:1615 | 기본 */
.reserve-store-detail .reserve-store-info-link:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 112. src/styles/global/feature-surfaces.css:1621 | @media (prefers-reduced-motion: reduce) */
.reserve-store-detail .reserve-store-info-link:active {
    transform: none;
}

/* 113. src/styles/global/feature-surfaces.css:1643 | 기본 */
.rsv-tap-btn:focus {
    outline: none;
}

/* 114. src/styles/global/feature-surfaces.css:1644 | 기본 */
.rsv-tap-btn:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 115. src/styles/global/feature-surfaces.css:1653 | 기본 */
.rsv-time-pill:hover:not(:disabled) {
    background-color: var(--c-gray-100, #f2f4f6);
    color: var(--c-text-primary, #1a1f27);
}

/* 116. src/styles/global/feature-surfaces.css:1657 | 기본 */
.rsv-time-pill:active:not(:disabled) {
    transform: scale(0.96);
}

/* 117. src/styles/global/feature-surfaces.css:1722 | 기본 */
.mock-card:hover .mock-card-image,
.mock-card-m:hover .mock-card-image {
    transform: scale(1.05);
}

/* 118. src/styles/global/feature-surfaces.css:1724 | 기본 */
.reserve-home-mock-favorite:focus {
    outline: none;
}

/* 119. src/styles/global/feature-surfaces.css:1725 | 기본 */
.reserve-home-mock-favorite:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 120. src/styles/global/feature-surfaces.css:1749 | @media (prefers-reduced-motion: reduce) */
.ant-btn:not(.reserve-btn):active:not(:disabled):not(.ant-btn-loading),
    .ant-pagination-item:active,
    .ant-pagination-prev:active,
    .ant-pagination-next:active,
    .ant-pagination .ant-pagination-item-active,
    .rsv-time-pill:active,
    .rsv-time-pill.rsv-selected,
    .mock-card:hover .mock-card-image,
    .mock-card-m:hover .mock-card-image {
    transform: none !important;
}

/* 121. src/styles/global/foundation.css:126 | 기본 */
.ant-pagination .ant-pagination-item:hover {
    background-color: var(--c-gray-100, #f2f4f6) !important;
}

/* 122. src/styles/global/foundation.css:129 | 기본 */
.ant-pagination .ant-pagination-item:hover a {
    color: var(--c-text-primary, #1a1f27) !important;
}

/* 123. src/styles/global/foundation.css:145 | 기본 */
.ant-pagination .ant-pagination-item-active:hover {
    background-color: var(--c-gray-200, #e5e8eb) !important;
    opacity: 0.95 !important;
}

/* 124. src/styles/global/foundation.css:175 | 기본 */
.ant-pagination .ant-pagination-prev:hover .ant-pagination-item-link,
.ant-pagination .ant-pagination-next:hover .ant-pagination-item-link {
    background-color: var(--c-gray-100, #f2f4f6) !important;
    color: var(--c-text-primary, #1a1f27) !important;
}

/* 125. src/styles/global/interactions.css:34 | 기본 */
.bounce-arrow:focus {
    outline: none;
}

/* 126. src/styles/global/interactions.css:35 | 기본 */
.bounce-arrow:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: -3px;
}

/* 127. src/styles/global/interactions.css:160 | 기본 */
.reserve-card .ant-card-actions > li:hover,
.reserve-card-add:hover {
    background-color: #f2f4f6 !important;
}

/* 128. src/styles/global/interactions.css:166 | 기본 */
[data-theme='dark'] .reserve-card .ant-card-actions > li:hover,
[data-theme='dark'] .reserve-card-add:hover {
    background-color: #333840 !important;
}

/* 129. src/styles/global/interactions.css:246 | 기본 */
.ant-input-clear-icon:hover,
.ant-select-clear:hover {
    background: var(--c-gray-100, rgba(0, 0, 0, 0.06)) !important;
}

/* 130. src/styles/global/interactions.css:321 | 기본 */
.ant-select.reserve-filter-select--chip:not(.ant-select-disabled):hover,
.ant-select.reserve-filter-select--chip.ant-select-open {
    border-color: var(--c-gray-400, #b5b8bd) !important;
}

/* 131. src/styles/global/interactions.css:325 | 기본 */
.ant-select.reserve-filter-select--chip:not(.ant-select-disabled):active {
    transform: scale(0.97);
}

/* 132. src/styles/global/interactions.css:326 | 기본 */
.ant-select.reserve-filter-select--chip:has(input:focus-visible) {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 133. src/styles/global/interactions.css:336 | @media (prefers-reduced-motion: reduce) */
.ant-select.reserve-filter-select--chip:active {
    transform: none;
}

/* 134. src/styles/global/interactions.css:358 | 기본 */
.reserve-social:hover {
    background-color: #f2f4f6 !important;
    border-color: #f2f4f6 !important;
    color: #181717 !important;
}

/* 135. src/styles/global/interactions.css:363 | 기본 */
[data-theme='dark'] .reserve-social:hover {
    background-color: #ffffff !important;
    border-color: #ffffff !important;
    color: #181717 !important;
}

/* 136. src/styles/global/interactions.css:368 | 기본 */
.reserve-social--velog:hover,
[data-theme='dark'] .reserve-social--velog:hover {
    color: #20C997 !important;
}

/* 137. src/styles/global/interactions.css:383 | 기본 */
.reserve-card-action:active {
    transform: scale(0.94);
}

/* 138. src/styles/global/interactions.css:445 | 기본 */
.reserve-segmented-btn:hover:not(:disabled):not(.reserve-segmented-btn--active) {
    background-color: var(--c-gray-100, #f2f4f6);
    color: var(--c-text-primary, #1a1f27);
}

/* 139. src/styles/global/interactions.css:449 | 기본 */
.reserve-segmented-btn:active:not(:disabled) {
    transform: scale(0.97);
}

/* 140. src/styles/global/interactions.css:489 | 기본 */
.ant-modal-root .ant-modal-close,
.ant-modal-root .ant-modal-close:focus,
.ant-modal-root .ant-modal-close:active {
    outline: none !important;
    box-shadow: none !important;
    background-color: transparent !important;
}

/* 141. src/styles/global/interactions.css:496 | 기본 */
.ant-modal-root .ant-modal-close:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6) !important;
    outline-offset: 2px;
    box-shadow: none !important;
    background-color: transparent !important;
}

/* 142. src/styles/global/interactions.css:502 | 기본 */
.ant-modal-root .ant-modal-close:hover {
    background-color: var(--c-gray-100, #f2f4f6) !important;
}

/* 143. src/styles/global/interactions.css:513 | 기본 */
.ant-modal-root .ant-modal,
.ant-modal-root .ant-modal:focus,
.ant-modal-root .ant-modal:focus-visible,
.ant-modal-root .ant-modal-container:focus,
.ant-modal-root .ant-modal-container:focus-visible {
    outline: none !important;
}

/* 144. src/styles/global/interactions.css:530 | 기본 */
.ant-tabs-tabpane:focus,
.recharts-wrapper:focus,
.recharts-surface:focus,
.recharts-layer:focus {
    outline: none;
}

/* 145. src/styles/global/interactions.css:536 | 기본 */
.ant-tabs-tabpane:focus-visible,
.recharts-wrapper:focus-visible,
.recharts-surface:focus-visible,
.recharts-layer:focus-visible {
    outline: 2px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
    border-radius: 8px;
}

/* 146. src/styles/global/interactions.css:574 | 기본 */
.ant-picker-time-panel-cell .ant-picker-time-panel-cell-inner:hover {
    background: var(--c-gray-100, #f2f4f6) !important;
}

/* 147. src/styles/global/interactions.css:577 | 기본 */
.ant-picker-time-panel-cell-selected .ant-picker-time-panel-cell-inner:hover {
    background: var(--c-primary-light, #e8f3ff) !important;
}

/* 148. src/styles/global/interactions.css:668 | 기본 */
.reserve-image-preview .ant-image-preview-actions-action:hover,
.reserve-image-preview .ant-image-preview-operations-operation:hover {
    background-color: var(--preview-btn-hover) !important;
}

/* 149. src/styles/global/interactions.css:676 | 기본 */
.reserve-image-preview .ant-image-preview-actions-action-disabled:hover,
.reserve-image-preview .ant-image-preview-operations-operation-disabled:hover {
    background-color: transparent !important;
}

/* 150. src/styles/global/interactions.css:694 | 기본 */
.reserve-image-preview .ant-image-preview-switch-prev:hover,
.reserve-image-preview .ant-image-preview-switch-next:hover,
.reserve-image-preview .ant-image-preview-switch-left:hover,
.reserve-image-preview .ant-image-preview-switch-right:hover {
    background-color: var(--preview-btn-hover) !important;
}

/* 151. src/styles/global/interactions.css:721 | 기본 */
.reserve-image-preview .ant-image-preview-close:hover {
    background-color: var(--preview-btn-hover) !important;
}

/* 152. src/styles/global/navigation-and-media.css:21 | 기본 */
.reserve-pill-tabs .ant-tabs-tab:hover:not(.ant-tabs-tab-active) {
    background-color: var(--c-gray-100, #f2f4f6) !important;
}

/* 153. src/styles/global/navigation-and-media.css:29 | 기본 */
.reserve-pill-tabs .ant-tabs-tab:hover .ant-tabs-tab-btn {
    color: var(--c-text-primary, #1a1f27) !important;
}

/* 154. src/styles/global/navigation-and-media.css:35 | 기본 */
.reserve-pill-tabs .ant-tabs-tab-active:hover {
    background-color: var(--c-gray-200, #e5e8eb) !important;
}

/* 155. src/styles/global/navigation-and-media.css:85 | 기본 */
.reserve-pill-tabs .ant-tabs-nav-more:hover {
    background-color: var(--c-gray-100, #f2f4f6) !important;
    color: var(--c-text-primary, #1a1f27) !important;
}

/* 156. src/styles/global/navigation-and-media.css:89 | 기본 */
.reserve-pill-tabs .ant-tabs-nav-more:active {
    transform: scale(0.94) !important;
    background-color: var(--c-gray-100, #f2f4f6) !important;
}

/* 157. src/styles/global/navigation-and-media.css:103 | 기본 */
.ant-tabs-dropdown-menu-item:hover,
.ant-tabs-dropdown-menu-item-active {
    background-color: var(--c-gray-100, #f2f4f6) !important;
}

/* 158. src/styles/global/navigation-and-media.css:291 | 기본 */
.reserve-carousel .slick-prev:hover,
.reserve-carousel .slick-next:hover {
    background: rgba(229, 232, 235, 0.28) !important;
}

/* 159. src/styles/global/navigation-and-media.css:319 | 기본 */
.ad-banner-close-btn:hover {
    background: #fff !important;
}

/* 160. src/styles/global/navigation-and-media.css:320 | 기본 */
.ad-banner-close-btn:active {
    transform: scale(0.88);
}

/* 161. src/styles/global/navigation-and-media.css:321 | 기본 */
.ad-banner-close-btn:focus,
.ad-banner-click-area:focus {
    outline: none;
}

/* 162. src/styles/global/navigation-and-media.css:323 | 기본 */
.ad-banner-close-btn:focus-visible,
.ad-banner-click-area:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: -3px;
}
```

## 부록 B — 선택·열림·비활성 추가 후보 85개

중복·애니메이션 active·이름의 interactive까지 포함한 원시 검색 후보다. 후보 수를 버그 수나 별도 상태 수로 해석하지 않는다.

```css
/* 1. src/styles/global/components-and-forms.css:20 | 기본 */
.reserve-card--interactive {
    cursor: pointer;
}

/* 2. src/styles/global/components-and-forms.css:35 | 기본 */
.reserve-card--interactive:focus {
    outline: none;
}

/* 3. src/styles/global/components-and-forms.css:36 | 기본 */
.reserve-card--interactive:focus-visible {
    outline: 3px solid var(--c-primary, #3182f6);
    outline-offset: 2px;
}

/* 4. src/styles/global/components-and-forms.css:110 | 기본 */
.reserve-btn--primary:active:not(:disabled),
.reserve-btn--secondary:active:not(:disabled),
.reserve-btn--danger:active:not(:disabled),
.reserve-btn--hero:active:not(:disabled) {
    transform: scale(0.96);
    opacity: 0.88;
}

/* 5. src/styles/global/components-and-forms.css:117 | 기본 */
.reserve-btn--primary:hover:not(:disabled) {
    opacity: 0.9;
}

/* 6. src/styles/global/components-and-forms.css:118 | 기본 */
.reserve-btn--secondary:hover:not(:disabled) {
    opacity: 0.85;
}

/* 7. src/styles/global/components-and-forms.css:119 | 기본 */
.reserve-btn--hero:hover:not(:disabled) {
    opacity: 0.92;
    box-shadow: 0 12px 24px rgba(49, 130, 246, 0.28);
}

/* 8. src/styles/global/components-and-forms.css:121 | 기본 */
.reserve-btn--ghost-sm:hover:not(:disabled) {
    opacity: 0.7;
}

/* 9. src/styles/global/components-and-forms.css:122 | 기본 */
.reserve-btn--ghost-sm:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.95);
}

/* 10. src/styles/global/components-and-forms.css:123 | 기본 */
.reserve-btn--ghost-sm-primary:hover:not(:disabled) {
    opacity: 0.7;
}

/* 11. src/styles/global/components-and-forms.css:124 | 기본 */
.reserve-btn--ghost-sm-primary:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.95);
}

/* 12. src/styles/global/components-and-forms.css:125 | 기본 */
.reserve-btn--ghost-sm-success:hover:not(:disabled) {
    opacity: 0.7;
}

/* 13. src/styles/global/components-and-forms.css:126 | 기본 */
.reserve-btn--ghost-sm-success:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.95);
}

/* 14. src/styles/global/components-and-forms.css:127 | 기본 */
.reserve-btn--ghost-sm-danger:hover:not(:disabled) {
    opacity: 0.7;
}

/* 15. src/styles/global/components-and-forms.css:128 | 기본 */
.reserve-btn--ghost-sm-danger:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.95);
}

/* 16. src/styles/global/components-and-forms.css:132 | 기본 */
.reserve-btn--outline:hover:not(:disabled) {
    border-color: #adb5bd;
    background: rgba(0, 0, 0, 0.02);
}

/* 17. src/styles/global/components-and-forms.css:133 | 기본 */
.reserve-btn--outline:active:not(:disabled) {
    transform: scale(0.96);
    opacity: 0.88;
}

/* 18. src/styles/global/components-and-forms.css:134 | 기본 */
.reserve-btn--ghost:hover:not(:disabled) {
    opacity: 0.7;
}

/* 19. src/styles/global/components-and-forms.css:135 | 기본 */
.reserve-btn--ghost:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.94);
}

/* 20. src/styles/global/components-and-forms.css:136 | 기본 */
.reserve-btn--link:hover:not(:disabled) {
    opacity: 0.75;
}

/* 21. src/styles/global/components-and-forms.css:137 | 기본 */
.reserve-btn--link:active:not(:disabled) {
    opacity: 0.5;
    transform: scale(0.96);
}

/* 22. src/styles/global/components-and-forms.css:150 | 기본 */
.reserve-favorite-button:hover:not(:disabled) {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16) !important;
}

/* 23. src/styles/global/components-and-forms.css:151 | 기본 */
.reserve-favorite-button:active:not(:disabled) {
    transform: scale(0.94);
}

/* 24. src/styles/global/components-and-forms.css:165 | 기본 */
.reserve-form-field-button:hover:not(:disabled) {
    opacity: 0.9;
}

/* 25. src/styles/global/components-and-forms.css:166 | 기본 */
.reserve-form-field-button:active:not(:disabled) {
    transform: scale(0.96);
    opacity: 0.88;
}

/* 26. src/styles/global/components-and-forms.css:167 | 기본 */
.reserve-form-field-button:disabled {
    cursor: not-allowed;
}

/* 27. src/styles/global/components-and-forms.css:387 | 기본 */
.ant-picker-disabled input::placeholder,
.ant-picker-disabled input,
.ant-input-disabled::placeholder,
.ant-input-disabled,
.ant-select-disabled .ant-select-placeholder,
.ant-select-disabled .ant-select-content,
input:disabled::placeholder,
input:disabled {
    -webkit-text-fill-color: rgba(0, 0, 0, 0.25) !important;
    color: rgba(0, 0, 0, 0.25) !important;
    opacity: 1 !important;
}

/* 28. src/styles/global/components-and-forms.css:399 | 기본 */
[data-theme='dark'] .ant-picker-disabled input::placeholder,
[data-theme='dark'] .ant-picker-disabled input,
[data-theme='dark'] .ant-input-disabled::placeholder,
[data-theme='dark'] .ant-input-disabled,
[data-theme='dark'] .ant-select-disabled .ant-select-placeholder,
[data-theme='dark'] .ant-select-disabled .ant-select-content,
[data-theme='dark'] input:disabled::placeholder,
[data-theme='dark'] input:disabled {
    -webkit-text-fill-color: rgba(255, 255, 255, 0.42) !important;
    color: rgba(255, 255, 255, 0.42) !important;
}

/* 29. src/styles/global/feature-surfaces.css:60 | 기본 */
.reserve-maillist-item:not(.is-selected):hover {
    background: var(--c-bg-subtle, rgba(0, 0, 0, 0.03));
}

/* 30. src/styles/global/feature-surfaces.css:61 | 기본 */
.reserve-maillist-item:not(.is-selected):active {
    background: rgba(0, 0, 0, 0.06);
}

/* 31. src/styles/global/feature-surfaces.css:63 | 기본 */
.reserve-maillist-item:not(.is-selected):focus-within {
    background: var(--c-bg-subtle, rgba(0, 0, 0, 0.03));
}

/* 32. src/styles/global/feature-surfaces.css:68 | 기본 */
.reserve-maillist-item.is-selected {
    background: var(--c-primary-light, #e8f3ff);
}

/* 33. src/styles/global/feature-surfaces.css:71 | 기본 */
.reserve-maillist-item.is-selected:hover {
    background: color-mix(in srgb, var(--c-primary, #3182f6) 14%, var(--c-bg-paper, #fff));
}

/* 34. src/styles/global/feature-surfaces.css:95 | 기본 */
.reserve-maillist-trash:disabled {
    cursor: not-allowed;
    opacity: 0.25;
}

/* 35. src/styles/global/feature-surfaces.css:119 | 기본 */
.reserve-cal-cell:hover:not(:disabled) {
    background-color: var(--c-gray-100, #f2f4f6);
}

/* 36. src/styles/global/feature-surfaces.css:122 | 기본 */
.reserve-cal-cell.is-selected {
    background-color: var(--c-gray-200, #e5e8eb);
    font-weight: 600;
}

/* 37. src/styles/global/feature-surfaces.css:126 | 기본 */
.reserve-form-cal-cell.is-range:not(.is-selected) {
    background-color: var(--c-gray-50, #f9fafb);
}

/* 38. src/styles/global/feature-surfaces.css:134 | 기본 */
.reserve-cal-cell:disabled {
    color: var(--c-text-disabled, #b5b8bd);
    cursor: not-allowed;
}

/* 39. src/styles/global/feature-surfaces.css:140 | 기본 */
.reserve-form-date-trigger:disabled {
    cursor: not-allowed;
}

/* 40. src/styles/global/feature-surfaces.css:158 | 기본 */
.reserve-form-cal-part.is-active {
    border-color: var(--c-primary, #3182f6);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--c-primary, #3182f6) 12%, transparent);
}

/* 41. src/styles/global/feature-surfaces.css:182 | 기본 */
.reserve-cal-nav:hover:not(:disabled) {
    background-color: var(--c-gray-100, #f2f4f6);
    color: var(--c-text-primary, #1a1f27);
}

/* 42. src/styles/global/feature-surfaces.css:186 | 기본 */
.reserve-cal-nav:disabled {
    color: var(--c-text-disabled, #b5b8bd);
    cursor: not-allowed;
}

/* 43. src/styles/global/feature-surfaces.css:222 | 기본 */
.reserve-chat-launcher.is-open .anticon {
    transform: rotate(90deg);
}

/* 44. src/styles/global/feature-surfaces.css:317 | 기본 */
.reserve-chat-send:hover:not(:disabled) {
    background: var(--c-primary-dark, #2272eb);
}

/* 45. src/styles/global/feature-surfaces.css:318 | 기본 */
.reserve-chat-send:active:not(:disabled) {
    transform: scale(0.9);
}

/* 46. src/styles/global/feature-surfaces.css:319 | 기본 */
.reserve-chat-send:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

/* 47. src/styles/global/feature-surfaces.css:465 | 기본 */
.reserve-messenger-row.is-selected {
    background: var(--c-primary-light, #edf6ff);
}

/* 48. src/styles/global/feature-surfaces.css:728 | @media (prefers-reduced-motion: reduce) */
.reserve-btn:active:not(:disabled),
    .reserve-card-add:active,
    .reserve-card-action:active,
    .reserve-favorite-button:active,
    .reserve-form-field-button:active:not(:disabled),
    .ad-banner-close-btn:active {
    transform: none !important;
}

/* 49. src/styles/global/feature-surfaces.css:797 | 기본 */
.ant-btn:not(.reserve-btn):active:not(:disabled):not(.ant-btn-loading) {
    transform: scale(0.96);
    opacity: 0.88;
}

/* 50. src/styles/global/feature-surfaces.css:994 | 기본 */
.reserve-discovery-top-nav a[aria-current="page"] {
    color: var(--c-text-primary, #191f28);
    font-weight: 700;
}

/* 51. src/styles/global/feature-surfaces.css:998 | 기본 */
.reserve-discovery-top-nav a[aria-current="page"]::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 24%;
    right: 24%;
    height: 2px;
    background: currentColor;
}

/* 52. src/styles/global/feature-surfaces.css:1379 | @media (min-width: 768px) */
.reserve-discovery-top-nav a[aria-current="page"]::after {
    left: 0;
    right: 0;
}

/* 53. src/styles/global/feature-surfaces.css:1506 | 기본 */
.reserve-search-submit:disabled {
    color: var(--c-text-tertiary, #8b95a1);
    cursor: default;
}

/* 54. src/styles/global/feature-surfaces.css:1570 | 기본 */
.reserve-search-domain:hover,
.reserve-search-submit:not(:disabled):hover,
.reserve-search-clear:hover {
    color: var(--c-text-primary, #191f28);
}

/* 55. src/styles/global/feature-surfaces.css:1583 | 기본 */
.reserve-search-page a:active,
.reserve-search-page button:active:not(:disabled) {
    transform: scale(0.96);
    opacity: 0.88;
}

/* 56. src/styles/global/feature-surfaces.css:1653 | 기본 */
.rsv-time-pill:hover:not(:disabled) {
    background-color: var(--c-gray-100, #f2f4f6);
    color: var(--c-text-primary, #1a1f27);
}

/* 57. src/styles/global/feature-surfaces.css:1657 | 기본 */
.rsv-time-pill:active:not(:disabled) {
    transform: scale(0.96);
}

/* 58. src/styles/global/feature-surfaces.css:1658 | 기본 */
.rsv-time-pill.rsv-selected {
    background-color: var(--c-gray-200, #e5e8eb);
    color: var(--c-text-primary, #1a1f27);
    font-weight: 600;
    transform: scale(1.04);
}

/* 59. src/styles/global/feature-surfaces.css:1664 | 기본 */
.rsv-time-pill:disabled {
    color: var(--c-text-disabled, #b5b8bd);
    cursor: not-allowed;
    text-decoration: line-through;
}

/* 60. src/styles/global/feature-surfaces.css:1701 | 기본 */
.faq-collapse .ant-collapse-item-active .ant-collapse-arrow {
    transform: rotate(180deg);
}

/* 61. src/styles/global/feature-surfaces.css:1749 | @media (prefers-reduced-motion: reduce) */
.ant-btn:not(.reserve-btn):active:not(:disabled):not(.ant-btn-loading),
    .ant-pagination-item:active,
    .ant-pagination-prev:active,
    .ant-pagination-next:active,
    .ant-pagination .ant-pagination-item-active,
    .rsv-time-pill:active,
    .rsv-time-pill.rsv-selected,
    .mock-card:hover .mock-card-image,
    .mock-card-m:hover .mock-card-image {
    transform: none !important;
}

/* 62. src/styles/global/feature-surfaces.css:1758 | @media (prefers-reduced-motion: reduce) */
.ant-pagination .ant-pagination-item-active {
    transition: none !important;
}

/* 63. src/styles/global/foundation.css:78 | 기본 */
.ant-select-open .ant-select-suffix {
    transform: rotate(180deg);
}

/* 64. src/styles/global/foundation.css:134 | 기본 */
.ant-pagination .ant-pagination-item-active {
    background-color: var(--c-gray-200, #e5e8eb) !important;
    border: none !important;
    transform: scale(1.04) !important;
    transition: background-color 0.2s ease,
                transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
}

/* 65. src/styles/global/foundation.css:141 | 기본 */
.ant-pagination .ant-pagination-item-active a {
    color: var(--c-text-primary, #1a1f27) !important;
    font-weight: 600 !important;
}

/* 66. src/styles/global/foundation.css:145 | 기본 */
.ant-pagination .ant-pagination-item-active:hover {
    background-color: var(--c-gray-200, #e5e8eb) !important;
    opacity: 0.95 !important;
}

/* 67. src/styles/global/interactions.css:321 | 기본 */
.ant-select.reserve-filter-select--chip:not(.ant-select-disabled):hover,
.ant-select.reserve-filter-select--chip.ant-select-open {
    border-color: var(--c-gray-400, #b5b8bd) !important;
}

/* 68. src/styles/global/interactions.css:445 | 기본 */
.reserve-segmented-btn:hover:not(:disabled):not(.reserve-segmented-btn--active) {
    background-color: var(--c-gray-100, #f2f4f6);
    color: var(--c-text-primary, #1a1f27);
}

/* 69. src/styles/global/interactions.css:449 | 기본 */
.reserve-segmented-btn:active:not(:disabled) {
    transform: scale(0.97);
}

/* 70. src/styles/global/interactions.css:452 | 기본 */
.reserve-segmented-btn--active {
    background-color: var(--c-gray-200, #e5e8eb);
    color: var(--c-text-primary, #1a1f27) !important;
    font-weight: 600;
}

/* 71. src/styles/global/interactions.css:457 | 기본 */
.reserve-segmented-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* 72. src/styles/global/interactions.css:569 | 기본 */
.ant-picker-time-panel-cell-selected .ant-picker-time-panel-cell-inner {
    background: var(--c-primary-light, #e8f3ff) !important;
    color: var(--c-text-primary, #1a1f27) !important;
    font-weight: 600;
}

/* 73. src/styles/global/interactions.css:577 | 기본 */
.ant-picker-time-panel-cell-selected .ant-picker-time-panel-cell-inner:hover {
    background: var(--c-primary-light, #e8f3ff) !important;
}

/* 74. src/styles/global/interactions.css:593 | 기본 */
.ant-select-dropdown .ant-select-item-option-active:not(.ant-select-item-option-disabled) {
    background: var(--c-gray-100, #f2f4f6);
}

/* 75. src/styles/global/interactions.css:600 | 기본 */
.ant-select-dropdown .ant-select-item-option-selected:not(.ant-select-item-option-disabled) {
    background: var(--c-primary-light, #e8f3ff);
    color: var(--c-text-primary, #1a1f27);
    font-weight: 600;
}

/* 76. src/styles/global/interactions.css:653 | 기본 */
.ant-image-preview-fade-appear-active,
.ant-image-preview-fade-enter-active {
    opacity: 1;
}

/* 77. src/styles/global/interactions.css:655 | 기본 */
.ant-image-preview-fade-appear-active .ant-image-preview-body,
.ant-image-preview-fade-enter-active  .ant-image-preview-body {
    transform: scale(1);
    transition: transform 0.3s;
}

/* 78. src/styles/global/navigation-and-media.css:21 | 기본 */
.reserve-pill-tabs .ant-tabs-tab:hover:not(.ant-tabs-tab-active) {
    background-color: var(--c-gray-100, #f2f4f6) !important;
}

/* 79. src/styles/global/navigation-and-media.css:32 | 기본 */
.reserve-pill-tabs .ant-tabs-tab-active {
    background-color: var(--c-gray-200, #e5e8eb) !important;
}

/* 80. src/styles/global/navigation-and-media.css:35 | 기본 */
.reserve-pill-tabs .ant-tabs-tab-active:hover {
    background-color: var(--c-gray-200, #e5e8eb) !important;
}

/* 81. src/styles/global/navigation-and-media.css:38 | 기본 */
.reserve-pill-tabs .ant-tabs-tab-active .ant-tabs-tab-btn {
    color: var(--c-text-primary, #1a1f27) !important;
    font-weight: 600 !important;
}

/* 82. src/styles/global/navigation-and-media.css:103 | 기본 */
.ant-tabs-dropdown-menu-item:hover,
.ant-tabs-dropdown-menu-item-active {
    background-color: var(--c-gray-100, #f2f4f6) !important;
}

/* 83. src/styles/global/navigation-and-media.css:107 | 기본 */
.ant-tabs-dropdown-menu-item-selected {
    background-color: var(--c-gray-200, #e5e8eb) !important;
    color: var(--c-text-primary, #1a1f27) !important;
    font-weight: 600 !important;
}

/* 84. src/styles/global/navigation-and-media.css:159 | 기본 */
.ad-banner-carousel .slick-dots li.slick-active button {
    opacity: 1 !important;
    width: 12px !important;
    border-radius: 6px !important;
}

/* 85. src/styles/global/navigation-and-media.css:208 | 기본 */
.reserve-carousel .slick-dots li.slick-active button {
    width: 20px !important;
    border-radius: 999px !important;
    background: #fff !important;
}
```

## 부록 C — JS 상태/이벤트/접근성 검색 32개

이벤트 함수 정의와 사용처, 주석, aria-pressed가 섞여 있다. 모두 hover 버그라는 뜻은 아니다.

```text
src/components/common/FavoriteButton.jsx:73 | aria-pressed={isFavorite}
src/components/common/FormDatePicker.jsx:176 | const onTouchStart = event => {
src/components/common/FormDatePicker.jsx:180 | const onTouchEnd = event => {
src/components/common/FormDatePicker.jsx:218 | aria-pressed={isSelected}
src/components/common/FormDatePicker.jsx:306 | aria-pressed={rangePart === part}
src/components/common/FormDatePicker.jsx:346 | <div style={styles.grid} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
src/components/layout/Footer.jsx:71 | onMouseEnter={e => { e.currentTarget.style.color = colors.text.primary; }}
src/components/layout/Footer.jsx:72 | onMouseLeave={e => { e.currentTarget.style.color = colors.text.tertiary; }}>
src/components/layout/Footer.jsx:88 | onMouseEnter={e => e.currentTarget.style.color = colors.text.primary}
src/components/layout/Footer.jsx:89 | onMouseLeave={e => e.currentTarget.style.color = colors.text.tertiary}>
src/components/layout/Footer.jsx:170 | onMouseEnter={e => e.currentTarget.style.color = colors.text.primary}
src/components/layout/Footer.jsx:171 | onMouseLeave={e => e.currentTarget.style.color = colors.text.tertiary}>
src/components/store/BookingCalendar.jsx:138 | const onTouchStart = (e) => {
src/components/store/BookingCalendar.jsx:142 | const onTouchEnd = (e) => {
src/components/store/BookingCalendar.jsx:184 | aria-pressed={isSelected}
src/components/store/BookingCalendar.jsx:278 | <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
src/components/store/StoreForm/AddressSearch.jsx:289 | onMouseDown={() => { skipBlurRef.current = true; }}
src/components/store/StoreForm/AddressSearch.jsx:311 | onMouseDown={() => handleSelect(doc)}
src/components/store/StoreForm/AddressSearch.jsx:313 | onMouseEnter={() => dispatch({ type: 'SET_ACTIVE_IDX', idx: i })}
src/components/store/StoreForm/AddressSearch.jsx:314 | onMouseLeave={() => dispatch({ type: 'SET_ACTIVE_IDX', idx: -1 })}
src/components/store/StoreForm/AddressSearch.jsx:371 | {/* 상세주소: 터치 드래그로 스크롤 — onTouchStart/Move로 scrollLeft 조작 */}
src/components/store/StoreForm/AddressSearch.jsx:374 | onTouchStart={(e) => {
src/pages/Home/sections/mockups/MockBookingForm.jsx:12 | const [pressed, setPressed] = useState(false);
src/pages/Home/sections/mockups/MockBookingForm.jsx:69 | onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = colors.gray[200]; }}
src/pages/Home/sections/mockups/MockBookingForm.jsx:70 | onMouseLeave={e => { e.currentTarget.style.background = colors.gray[100]; }}
src/pages/Home/sections/mockups/MockBookingForm.jsx:126 | onMouseDown={() => setPressed(true)}
src/pages/Home/sections/mockups/MockBookingForm.jsx:127 | onMouseUp={() => setPressed(false)}
src/pages/Home/sections/mockups/MockBookingForm.jsx:128 | onMouseLeave={() => setPressed(false)}
src/pages/Home/sections/mockups/MockBookingForm.jsx:129 | onTouchStart={() => setPressed(true)}
src/pages/Home/sections/mockups/MockBookingForm.jsx:130 | onTouchEnd={() => setPressed(false)}
src/pages/Home/sections/mockups/MockBookingForm.jsx:133 | transform: pressed ? 'scale(0.97)' : 'scale(1)',
src/pages/Home/sections/mockups/MockStoreList.jsx:48 | aria-pressed={Boolean(liked[i])}
```

## 부록 D — 최종 소스 검색 매니페스트 200개

문서 생성 직전 소스 파일의 경로·행 수·SHA-256이다. 테스트 파일과 __tests__는 제외했다.
해시가 달라지면 이 기록을 최신 코드의 증거로 사용하지 않는다.

| 파일 | 행 수 | SHA-256 |
|---|---:|---|
| src/App.jsx | 287 | be1beb2b7fe51e5be9d2489bd927e93465f51f656c80effe78942c0c86745313 |
| src/api/axios.js | 159 | 233ac99ca17cabd002023cd1ccd13621f13dc6df7014d4daab001656ce5567a5 |
| src/api/sessionScope.js | 23 | 0a5f4712c7bf56eab4fe3920b7edf47284f000dedb6a41d1484035a6dfec547f |
| src/components/PrivateRoute.jsx | 55 | 46642222209b93a3bc671e6654e4846e0c13b294aa7bd8af9dfaa7e3c622ba61 |
| src/components/ScrollToTop.jsx | 18 | bbfd4a91782282842fb7c9a1298692fd959ce9d0b333a6b4e10287ddbbb1be19 |
| src/components/admin/AdPaymentOperations.jsx | 78 | 6991ac26af4f66f6451e1af486cbaca9e964b673de549bb830d1c85f71074c64 |
| src/components/admin/AdminAdsTab.jsx | 189 | 9f478403f3a77c1634ae4561a441664c61e286b71e13ac0f59ea28f97b0e8680 |
| src/components/admin/AuditLogTab.jsx | 225 | c1254a6ce0df617c8525e2f809245b1d33b41956b7e279330b7056e1258a887f |
| src/components/admin/BusinessVerificationTab.jsx | 447 | 776c94c12b681eddf9777d225921c18b7f22b39cc4adc82a4f04e8f0075b081f |
| src/components/admin/ChatReportsPanel.jsx | 218 | 175a0ff05c341a8457914ed5d3daa78fc3725b8ae6baa6b32bfcc35eeaa647db |
| src/components/admin/ChatTab.jsx | 320 | f6a8e0cf52da136e2970c09b72c06a097171381673c413d4d012dda7c9a8ab72 |
| src/components/admin/DashboardTab.jsx | 235 | ae2ac5471453340d3747390bcbc9f4204b4da1648e02b668d8285a3180f69c34 |
| src/components/admin/MailboxTab.jsx | 484 | 3dcc27cc28e8ad88ea64c5396a7832ffdc4e3e9a6b15c25e285def23217332e1 |
| src/components/admin/MembersTab.jsx | 266 | 5104594948a3e39693dfb714ded10ba30c5f41eb1efa0db9bffc56d0e6e6f744 |
| src/components/admin/PaymentOperationsTab.jsx | 237 | 4253eb7d40706609ea28ee99762292f9f8a36286621af5966c907fa8216fc8eb |
| src/components/admin/ReservationsAllTab.jsx | 148 | 0d7b86b0695284a863b332e6f8fc6793b4e1a4fa38d505852bd5c320c4a67d08 |
| src/components/admin/SanctionModal.jsx | 190 | 97419acc1d4bbe45d2ec3789a872070a7aa09c034c7825b80b233356509bc399 |
| src/components/admin/StoresAdminTab.jsx | 222 | 93547641e105ece04b26cc329d9140efd1a40c39c227bdf783434e8f91388b99 |
| src/components/admin/TrashTab.jsx | 193 | 92376a64273f912a14c3416388b47048d97381ae56ac6a6f3e3a8501b16761ff |
| src/components/admin/adminConstants.js | 36 | 3e93f88a2aa214f45391bd369dcb1ef60669a2ef6ba916b718b686ff9abdcf96 |
| src/components/admin/dashboardStats.js | 82 | 6869bbbdc61ef6b79ab0fd4b41f0d9c46a445c1eecea8f17e8e57e51e9096e22 |
| src/components/advertisement/AdBanner.jsx | 210 | ab1264b398b0886ec0bbc7fcb5a1a26e9e8b2a10b07fc6cd569e83e4e32ee438 |
| src/components/advertisement/AdManageTab.jsx | 491 | 5dd1f179ad173d88b3ba3a942e19389b4d1363190cda7176ab5fbefaf783d7ca |
| src/components/business/StatisticsTab.jsx | 413 | 2b208487f936c18d9cf68e07a4b1b75b2ed53d9fb8534b2f38421e13b50773bb |
| src/components/chat/ChatBubbleList.jsx | 115 | 24779143080f409679b566d566500d5e9843e9ff3f350219ce3740d2089b89d0 |
| src/components/chat/ChatModerationMenu.jsx | 149 | af9e91ec1cdf093d378a2a7bd05a071ecf426292a46054da7f2abe51fd86a09a |
| src/components/chat/MessengerContent.jsx | 536 | dddc5f913c8830209db2b757fd198e7d2f6b7d9bc6b594d2d25aa8c0e812147a |
| src/components/chat/MessengerShell.jsx | 151 | c5eadb2334053d923cc5e53cc145858b9d2e79b072342aada836788e03ae2c6a |
| src/components/common/Avatar.jsx | 67 | 4f512efc956f27c018b7dd00d658501e312f17d7b816ad7f4fcdf146913ca6d5 |
| src/components/common/Badge.jsx | 95 | c649ea1b96961d938521b999580a92b168d4c2383dcb04b2907ae2b58d930320 |
| src/components/common/Button.jsx | 224 | d93889b1a5c9f9f4dfdeff5d165396cb8413c59e37ec9d7f65019cc68c8ad6e2 |
| src/components/common/Card.jsx | 189 | 8941d77ad0ccabf28644a6b01dc98fff2368627564c2b98736131df385bce557 |
| src/components/common/ChartCard.jsx | 152 | 52bc17106684714d89c07cb53c904378542c0928917aa24e589340d281db8b42 |
| src/components/common/DataTable.jsx | 106 | 55fcc96174ee58e8c57e991ffa39deb6a8b7125298405c71cace7f8f851b48ea |
| src/components/common/FavoriteButton.jsx | 113 | 6813e719dd383208947784a0108d95c0b8076f8336e75bbff4f3393e91064eeb |
| src/components/common/FilterSelect.jsx | 60 | 0ca897cfda0b45b77fc28af4a63ce56916abe22700ccbdf831344d53808902c6 |
| src/components/common/FilterToolbar.jsx | 157 | 8e7bb6d2b466a5d772bcb802d2634378cfc1aa4ffd33b435c1bbe85b19d6b143 |
| src/components/common/FormDatePicker.jsx | 435 | 539e16c840010e830fb315491d76fe68a0d1a5328096ebd25ee25ea23c5fc175 |
| src/components/common/FormInput.jsx | 204 | 5dadd2058e2964d145944ce0757036eeb5f27a108cd3c8af96c903744ecc21d6 |
| src/components/common/FormModal.jsx | 130 | 74c501c91c5169c1fff7d5c3f5f7bb1241c65746aeb6df9c7e4a59513f50e3e9 |
| src/components/common/FormSelect.jsx | 55 | 9a1d2faa2ffb57f1ed6ad0c1d739e4033182040f7d865cb45aa1e550990b8d4e |
| src/components/common/FormTextArea.jsx | 65 | 65c550350480916ab108af65814348e24f7b0e8178f2a88e764e02c9645b0ddc |
| src/components/common/FormTimePicker.jsx | 73 | bd1faba652aafe26813627a592fbc17658ab58b24a8b8a2d98a5f07209226b4a |
| src/components/common/ImagePreviewPortal.jsx | 61 | d443cf5917507049c9ae451c6ece522ddc083bee96524494c52826c2109d3e01 |
| src/components/common/InquiryModal.jsx | 154 | 9c1f200dc304ff951bc2f8b7f6f892bcb6446394b7ce6010769af445d915d49a |
| src/components/common/KakaoMap.jsx | 165 | 0b40b92ab9a791d58729dad43d8d9db9ea9cf866854317423ed3283c272ef5c7 |
| src/components/common/Loading.jsx | 144 | fec50834a267b3c17ae3936bf824c457b9822cb964ebc8c2c5052d58ffd18680 |
| src/components/common/ModalLoading.jsx | 55 | 509992c3bbd92f3a2237618568951d7d088ae535b2a5bba1fe046af8fc9894af |
| src/components/common/PageContainer.jsx | 74 | 0da2f107bc6b55984d1c299854df2329bb43a4833466bcc653a8e089af120830 |
| src/components/common/PieLegend.jsx | 70 | 498633d165844ba280a918c607841341d3f2f691420c8849b0e77f66e3a8bcc3 |
| src/components/common/RefreshButton.jsx | 53 | 40b279d0ad13fb02387846808f71525d474e0181c5e9418b99f11ff786e600f4 |
| src/components/common/SegmentedControl.jsx | 72 | b703d6456177e10af3b07ba608c0766bb550ee232c6622bcaf3b6949db6dd796 |
| src/components/common/SegmentedGrid.jsx | 71 | 0fe07a77c96b4f58c24ded3d015aaf3dd6b4b843c4f9857859cdd96d2b318794 |
| src/components/common/SessionQueryProvider.jsx | 16 | 93381a7783103294a3b0c148b4269505ed7b2a9b1a88f14f1e583b9ee384d43a |
| src/components/common/Skeletons.jsx | 663 | 5b23ca42512f964706bef6a141d1e0ffb52491f8122eeeb7fa3fb0ed6294d0a0 |
| src/components/common/StatCard.jsx | 122 | f736f387a6542b449b92baee7318e5f08f25b49913fbad51dd037a846477a923 |
| src/components/common/UnreadPill.jsx | 57 | 66708d76c7ae62f129644e140aa4fad1d81d0322cce296545a1af0d9a46540b7 |
| src/components/common/index.js | 40 | bd633499f5224ce507f0c08383dc5b79afe236f739045a8106096c1abead8dd2 |
| src/components/common/kakaoMapOverlay.js | 47 | 4b7bf8900e6be1d5d74ef332bcf6b291f0dd9214c115c9a9ae1aa9a1268ee649 |
| src/components/common/pickerSuffix.jsx | 47 | 2a619c850ed66299b062dcca8ecf04157dbfccd514abb010bc32b5e8a53e7bd1 |
| src/components/layout/Footer.jsx | 184 | 771d36bba154b0319309b2d28b7bfb9e1648f58427a30e7204a2b7d61ddfb225 |
| src/components/layout/Header.jsx | 87 | bf59d7be5daf0eaeb36dd237c3475ed6813c27211ee0656c890857ca8aab69ff |
| src/components/layout/HeaderAccountMenu.jsx | 147 | 1a774f845ffa929a0ef39c5e5b30a3f4038d89879d7d5f7a1cd8210e2dd80669 |
| src/components/layout/OfflineBanner.jsx | 76 | fd1c6f7002337c7c0b50a56933df0829fa73a37383253cb1cd5198552c3c4baf |
| src/components/reservation/QrCodeModal.jsx | 98 | 32bb3544a6c3c0d074124366070f475a2a3adb56992fa67ba06c6994a5fa8c8c |
| src/components/reservation/QrScannerTab.jsx | 663 | e0ca7a0b0417c3e0344ea7a10f9521b63ebd133e22d66abf34fb9dd137ab379a |
| src/components/reservation/ReservationCard.jsx | 182 | 5f5b281a7d4f13287da292f5e3da0ed3d301294f327eddc6277dba7bbd9f51ed |
| src/components/reservation/ReservationDetailModal.jsx | 130 | 37dac5a37dec4d2696cd110e275691b3f60b0e1d42debde55883ad6756f6f853 |
| src/components/reservation/ReservationRow.jsx | 238 | 349d4749fa9ef5b983e29dbfb2cb178907e6c284ba1c82dad3ef9e9984278f7d |
| src/components/reservation/ReservationStatusBadge.jsx | 47 | 555bbd8c5b50e83ac32248864709a207dd847a3d9135eeccbec8d034d9dfec06 |
| src/components/reservation/index.js | 10 | bacf378dda34020ec97bc7e3dfa8e8d9cbb087f29f0f6d08471590f6df81cf04 |
| src/components/review/ReviewList.jsx | 424 | 75a3da7ff241780d420895a9791fd76c50995d575d158c2cc21b834038bf45a5 |
| src/components/review/index.js | 2 | 2e2e1d9a6422a83936bd31c060d2cda4d467cd7b521228c79a85a49e9fc02025 |
| src/components/store/BookingCalendar.jsx | 380 | 12919aca36e383820bc4e1ca5bc9b180a9758986989827a8d572c522c433ed95 |
| src/components/store/StoreCard.jsx | 113 | 83017635c9eb00b764157abaa3dd39a665250fb44c7921621fcd81c9c1ec685a |
| src/components/store/StoreForm/AddressSearch.jsx | 419 | c0e4c7b36394513f88d2b36077603efeb4b5d0bb6108e51e77f5bbcd6173071e |
| src/components/store/StoreForm/StoreBasicInfo.jsx | 365 | 61e81bdc63a4518fe7b319e6d36b97ff1b94b8ff2cb0161c1d2cb5b08b197968 |
| src/components/store/StoreForm/StoreFormActions.jsx | 82 | 669e67394d592c8937a41d6917f2eb15bdf6d46ec3419166c1261d14a71288e5 |
| src/components/store/StoreForm/StoreImages.jsx | 121 | 0f480947b083f19152b352ba8e418c70fde7e3ec5501617d306d909008835628 |
| src/components/store/StoreForm/index.jsx | 98 | c6d5bd0b6cb3834d8101a8ab8bd8a42cadefc0635669bdae0948b100ba0d4526 |
| src/components/store/index.js | 4 | 5dbc9afd703694df71c32dd49d359962c62dd7d1104ebcc6a6656ba98b74a7c2 |
| src/constants/api.js | 211 | 47db360fd858488fab5be22bf36fe13c464318ad16334c5abff92027f07a3e95 |
| src/constants/categories.js | 142 | e709795f10d3a17408b1ed5382088018fdf4d0cd97bc130081297623ebe46daf |
| src/constants/discovery.js | 12 | 19517574a25baaf6eac4ad645990b15a8f2ba03fef088fece5e615b0b2e2bdb4 |
| src/constants/index.js | 9 | d20bbcc89fdb89fd7633f0d425d1dd7041af93858c80f681dc6ca44973fe472b |
| src/constants/pagination.js | 3 | 6b05ddfffa0260279aa3a395619aa73f505f80bfdc3e1036c3c675830048f845 |
| src/constants/roles.js | 28 | f6f38ef7ebff88e7ab38b8bbc8bf60e08617266e0af307d4bb16b255d91233d0 |
| src/constants/status.js | 74 | 3b9d7b361b40f6d12fa9dcb8fc47cbf3c9ea4f5fd508db235e1363a15eba73d7 |
| src/hooks/index.js | 33 | f3ac7a598acc3f6e2f73948596ea65ef760caed5b4394da687886b81a79c5321 |
| src/hooks/queryKeys.js | 77 | 2d1745a8928b660f28342d1ef17c386b9049b99664294f3e416e5d8129a75572 |
| src/hooks/useAdPayment.js | 135 | 2bbf454552df7c0540a1572d0f9c1cde0b1e65142a9cc872a3125f1a0239e53b |
| src/hooks/useBookingCalendar.js | 49 | 66de2c5e36daeb4075b5ffdbebdcdf273fd7176cc2d7c8a9a8a9669d09707d18 |
| src/hooks/useChatThread.js | 228 | c1e9c0efda337939b43ba96e0b0672785d4945e6a0e4a2e66245e995fb2179de |
| src/hooks/useDebounce.js | 33 | ed4e22c6a649150b14e35eb918b6ab7938750a781a9712ff00648080c9289485 |
| src/hooks/useDocumentTitle.js | 49 | d0d549dbebd6cbc22b75098235a7edac90b569af20c95c8fa8ca7407b0fdec11 |
| src/hooks/useEmailVerification.js | 182 | aaca465104559edc1e5d802b78284d2f178a0163abe93f44d63f579a5643fa0d |
| src/hooks/useExitAnimation.js | 61 | fe4736f65550fc6f963c3f2adcd959eb2c9870b5844f73197b5cce75070c3461 |
| src/hooks/useFormErrors.js | 41 | 768cb2696bac2eb80bc3cd9de55a091fffa26fd30bf83a1996a107610cdf39e4 |
| src/hooks/useFormReady.js | 24 | 6ca133977987fe9eaa063caa6ddf2421df943a326382f90ceb4f6d8b61ef9800 |
| src/hooks/useGeolocation.js | 58 | 1b52adfd43e04923b2ec9d760bf71c59b7e963abc47bff83f5ca8e794d20bdba |
| src/hooks/useGoBack.js | 48 | b8ba022cc03875f7f18ebea2be2505fbd4972ae82281d966b3659f1ec258da18 |
| src/hooks/useImagePreview.jsx | 195 | e983bcb67102c6824255634ccdd743ec7c4cd77aa32c22e4df1b9956f6f9ec3b |
| src/hooks/useImagePreviewSwipe.js | 107 | 42ef0b0252bffcc63233194b124239b2c2645f2e7119d3b89716122b7232af12 |
| src/hooks/useManageReservations.js | 137 | a97ae47d50799ddb8e81d7254efe5d267b0105df7b3ca5a54c3d72e518b42c00 |
| src/hooks/useMessage.js | 77 | cd0ef30c96ec1e7deff6667614765a31eedca9f8d82d94448fb9ec7dd4ff4b7f |
| src/hooks/useMyStores.js | 45 | 99fbc4e512f9b106ac1079cd9f215b54837f6aefacc20b4c9c7b5ba606602eb1 |
| src/hooks/useOnlineStatus.js | 31 | e6a944c15ab3a5d968a04f98b6add088dd925cf35d691cf943052e7aef0f01c9 |
| src/hooks/usePayment.js | 132 | 2d85d2ec5607566447dab6e543c06537ab6f3d7a71b17530efad6eb094fd9ae9 |
| src/hooks/useQueryParamState.js | 63 | b55da48c4a82e6951b504a04172f31cb63db1e51d969aec693671503ce849419 |
| src/hooks/useReducedMotion.js | 26 | d6b3adf786f328cacf1fecafa623d2e63ec365f0b13ff1086c88a130d252e4e2 |
| src/hooks/useReservations.js | 59 | 82f28dbec62dd5d0e1404013666166fd76459b731a154cbf49c9722b64064f9b |
| src/hooks/useRouteSeo.js | 113 | 28442507f796e7df24a769ebd10d756913f7888cefdea01e983896f87fb73ec4 |
| src/hooks/useStoreData.js | 26 | a6d03dcf6616283fbc06176ad6dec994f4469643b42938182e8234c752a27d77 |
| src/hooks/useStoreDetailActions.js | 243 | a1e596e7208ee8b518128729d4b61921c5f05fe0d5d2e48659f17359820bb176 |
| src/hooks/useStoreForm.js | 443 | 8b6b6707ea1138354a57148396cd853e71511e0358ac894b713385cfffb64a88 |
| src/hooks/useStoreImageHint.js | 53 | 81519c06f8dab2e897c5ee08286312ee96501f682071bde8f4ae878db0967978 |
| src/hooks/useStoreList.js | 107 | b2546ac4770b01acece372d56a3d3c03aec5164c3685de2bc565a1be49e7c2ea |
| src/hooks/useTheme.js | 242 | 2e9e3a0ca4453b0fee972a4c4ced6e658f3695ef459f3264b423d92499fdb749 |
| src/hooks/useWindowWidth.js | 29 | 58936b14adc876380fa7bf84bc4d67f90319a3426a919b6da831843db79e0ecf |
| src/index.css | 9 | 00e45ca6c5e94f840a6ee054f658fcd35f8c65788bd5045734856c047f1f162a |
| src/main.jsx | 36 | e3b4b77f0e0e19ebc198f4b8d98435a813cce5e5415750152d796b5bbabfa043 |
| src/pages/Home/Home.constants.js | 33 | 2d9179c26b96ab7f05185beb313f3bcef8616e24b1735a0bd4ad9aac367a31db |
| src/pages/Home/Home.data.js | 45 | b37426b17bfd7400b6a156eb8a480bb92177e4129f4f1101ac089e5045355ff5 |
| src/pages/Home/Home.styles.js | 237 | 951aebc0ba1b40e3b8c19fbe582a9b91c95969f6ead372a8642cfdf1846293e9 |
| src/pages/Home/hooks/useLineLoop.js | 68 | dd58eae49ab5ca86582a1e947c31f38a9cd2dc21623b300cf1609ae3a072ae6e |
| src/pages/Home/hooks/useScrollReveal.js | 39 | 17504543eb0f12ca7aa57ff6cdae90f6e12a45b5e062ed7de0f3c012398972a9 |
| src/pages/Home/index.jsx | 391 | 0ba52d94e342ed43377defb6f19da04f3192bb59f4cddd183d03754ddd7fe478 |
| src/pages/Home/sections/BounceArrow.jsx | 31 | 9331e334429f9bbbb453079b9d1472dddd2ac05240746b33f8ef7c7d1c229922 |
| src/pages/Home/sections/FaqSection.jsx | 70 | a81b682afcb9005fb41a4efe77b0f074474b772886908f0bbb1729e760c5246c |
| src/pages/Home/sections/FeatureSection.jsx | 113 | 10dbf5997bea62d63a8e134f2c0c8b6e32777ce18478fff0b694821154875e4a |
| src/pages/Home/sections/HeroSection.jsx | 109 | baec9bfe84f35b707dace6c5d6535bab2d703b439268213a7dc0b93641a05374 |
| src/pages/Home/sections/mockups/MockBookingForm.jsx | 142 | 0357588f10897b58c220aa953521143924a344b804f5ad29fec20b2255268312 |
| src/pages/Home/sections/mockups/MockMyReservations.jsx | 46 | 836cfb934fb4a88cf31c6b8af2a92b125ddb59f3b7ff22e282863134c9890c62 |
| src/pages/Home/sections/mockups/MockStoreList.jsx | 108 | 967a247b3243f42b19fecb90400a84c4a34e0b7ac895e472784382804d66c849 |
| src/pages/Search/index.jsx | 115 | cd033e5bf29a058cc01ef2491aa7920b959f09d8861536fcec8ef5a824a8386a |
| src/pages/admin/AdminPanel.jsx | 143 | 156fbfae1583f94d65598a2b796776539d66e439a9d6fb7c7144c87a04df89ce |
| src/pages/auth/ForgotPassword.jsx | 302 | 0eba7af21c173d08f622fa6de5f7c71f4f3be3dec9a7d1530035e87158867c67 |
| src/pages/auth/Login.jsx | 281 | 41a8ffc78418875396347b0c950b80a040ac2f60a52db4cc41ab518c3705021f |
| src/pages/auth/OAuthCallback.jsx | 70 | 1c735857bb86590f84b6ae980d4864dd7c5d77d1def095803cb89307168b5967 |
| src/pages/auth/Signup.jsx | 239 | c876d469499afe01642d51abb5bf4029dc6c9ad1940112ae0ba37f1bd9066253 |
| src/pages/auth/SocialAgreement.jsx | 130 | 41ed7f453830c6b296c63e452120fb00c748cecffdd2f495b0353c0c258652c8 |
| src/pages/business/BusinessPanel.jsx | 238 | 9dd03901c98c23e541cec63301741e85f38faa63c6e406f788bcd2d091d998ed |
| src/pages/favorite/MyFavorites.jsx | 87 | f74e46d54ca457b57713bde1233f3c8d5865033b021c312e2f8b5307c08750cc |
| src/pages/legal/Privacy.jsx | 147 | d96529e61238cabbba52876f1d51b89854e535d4a7909cfefb6c1ca528ccdd4a |
| src/pages/legal/Terms.jsx | 92 | ff91111a2cda0c184956dd0158541d2de9de45c3ce841b470e64d525618854e2 |
| src/pages/member/MessagesPage.jsx | 17 | ecfc759e63c233a0ddacf6d146a7ff2076318bc262080215724e380da5ebc421 |
| src/pages/member/MyPage.jsx | 1209 | baa0ca0e93bd1d46e17277af2c08e48ed81590d42e98f7422e258e754279f837 |
| src/pages/payment/PaymentResult.jsx | 278 | 7e958c330e0eb980c33515d37940bc967516939d7d1c10aaf9d061f6f6e6c211 |
| src/pages/reservation/MyReservations.jsx | 328 | 64a3501ac974f4a33c820b86b5c61ffe930fd1bcb7ce6740d6fa7b2e940b3b28 |
| src/pages/store/MyStores.jsx | 294 | c60338f40c69100bbc225fa8a04131c89dd6722750e070c42ec974c082aaaf7d |
| src/pages/store/StoreDetail.jsx | 763 | 3f327898eba3df149bb2e76101c1c60a2d6efb5a255e04964c1ce54e6670b896 |
| src/pages/store/StoreEdit.jsx | 112 | 33eded15b9cd013665e240844ccda9de90497bb08e85ed25c5b7a5cd99fe806c |
| src/pages/store/StoreList.jsx | 311 | e5e285c9a29da1906637fad55aedd42b0a4f907f97cf72be7e02b7dc7598c845 |
| src/pages/store/StoreRegister.jsx | 62 | 4161edc8a5fd57c348c8926f978defc4ad9af69b30c25666d5d4fcdce2dc2f57 |
| src/services/adService.js | 40 | 7814a83c747bae41935d01675d24cd1ef5d2096e26a3ec72500fc6313e8016bd |
| src/services/businessService.js | 36 | f5c5d25bf64b07d8e6fe7fba38b4457a9b57922162778bbbc1b1d81a0e51e6c6 |
| src/services/chatService.js | 39 | 56e913e36f4115eefeb42d152266b141f84168bc63df8d3516d62d617b341272 |
| src/services/favoriteService.js | 24 | b9faeb1345dc9b49d48f6cdc08d05ba8e46ab02348664423adc76809d4706e08 |
| src/services/index.js | 11 | ffd887132e3b0a5c9bc9ff41d6b50615a9f2acceb486c07426f91420550edf35 |
| src/services/memberService.js | 54 | 2679ad9453815a571b9644bb3554807e8ef9ba984aedc33252ab01d1e82fc30d |
| src/services/noticeService.js | 8 | d4a468d4eb603e19664b803e769a1a3e386b5e6a9a7683fac04e64be3956f17b |
| src/services/paymentService.js | 39 | d36dff07c85163aba8c3f9b6a671fefa63ae198aec637de7027b9edfeb250a1d |
| src/services/reservationService.js | 26 | 5ff60554704204c72a863aa9c994abe1a0af64e5301a7996f501470ff27d34a2 |
| src/services/reviewService.js | 14 | 849656a445d5483c60bbb8ac06f17fc8e71f09f9765726d9b04950ac84600ea7 |
| src/services/storeService.js | 19 | 13e1f1ad19cbdf1ba5476c12b3bd821270cf19f0cd5b0f43bb992cdf29a960b4 |
| src/store/useAuthStore.js | 112 | 6e96aa723f23844112788485deb7491f570361e6fd80ec4901cbc7471bda1225 |
| src/store/useLocationStore.js | 22 | 853962670b59b90c965986421cfc381e8ec5f680b9789c66b4229088dbc7a0f7 |
| src/store/useMessengerStore.js | 34 | 13e0c371481d23e9187282d6ba78c91b95e58ad9cb2f69deeef4e56a7fa9ddc4 |
| src/styles/global/components-and-forms.css | 410 | 81caaa2ddf1296def898f157a0c51fd6fd63738ab8539d31e46c12072233a16a |
| src/styles/global/feature-surfaces.css | 1761 | 96f3ab4a9ae623979ec60e570d539e5f013de389be4a888e5fea8589eeab8d99 |
| src/styles/global/foundation.css | 256 | b56dc431f054dae0336ca0bd544188b3f67116c26fd3fc89a59ab1d00ff4ea6c |
| src/styles/global/interactions.css | 724 | 1bf58b85e0657785c1b2d8967d05aaf7136cb5c20d4cc559df1c26c9c1273454 |
| src/styles/global/navigation-and-media.css | 383 | 70b4b5936cae09509c9a567a747ff3820d85d03437c2751562fe0c295e6eaccf |
| src/styles/theme.css | 162 | 2d93868b591b7ef1c0d014e9e05a320cc15518a490cc0d474fd20ceb4309648b |
| src/styles/tokens/agreement.js | 25 | 2f0eb0c796644ee3cbab71c0c826a61dc111c497ef1820c638bf8f3d71c47eba |
| src/styles/tokens/animations.js | 18 | 9317698f982c200ddffc7a6290a7fe6c2bdc225c5677a8dce48a8c2d7299dad7 |
| src/styles/tokens/breakpoints.js | 38 | 2e12e48632d0334ef990a45579b7d0d6b89e92947d9d57a5db6cbf544103aeea |
| src/styles/tokens/chart.js | 74 | 9585a62f2b6ca6700581b5873201afa5b2a3bdf3fbfe641614894ff030af8294 |
| src/styles/tokens/colors.js | 122 | c2f104cba17dff47c03903f1f1419223430cda9ee7f198f70abb8d639b6c856d |
| src/styles/tokens/field.js | 57 | 9f6e67abe101fd432f52c4d8152c9e7674558bc19e6b6e4c1b76d13ef1d4e6a1 |
| src/styles/tokens/index.js | 13 | 11939ac96dfbe86ca03fd99c1a0eeae520b6cb10d0aec7054eddcea5439b4ef5 |
| src/styles/tokens/spacing.js | 72 | c10f901d3479f8701197b601e60200ed8336d2cf334a3e6c5670d68118f37b12 |
| src/styles/tokens/typography.js | 36 | bcc8005d0cc67ba5f156c351062d4ea4f53fd29940f3f7dd0d275e741522b061 |
| src/test/setup.js | 32 | a862bdfadb1aed5e9db33f809260205f073be307ec778b6eb3525bae33025fad |
| src/utils/a11y.js | 20 | 0222cd5c53d12c2be77b5e9cc9ae893c537d269e1e8522e1d359c71bf7fa2da6 |
| src/utils/adAttribution.js | 61 | 02a5cbdef4d81ff309093f85b02e11bc1f7c7d08f4ec4d6dbd5bb58eb099687d |
| src/utils/common.js | 12 | 100a9b33d4a47a55b85774fe6a510a26d5edadb31b36f4defc346543c165803c |
| src/utils/date.js | 79 | 2173cd7b97af432c73c2184905681dc6804413f916c70a9f29978a4154cf39f9 |
| src/utils/distance.js | 33 | dc1035c05f0865228aeb3943096b0ebc80ed2eb4be5e73da1e07d6762725180b |
| src/utils/errorHandler.js | 28 | f06fb26ac94bacc81bc2b1429ca5f1dde8cc395a580598d0ad2718e03d16c2f0 |
| src/utils/form.js | 132 | 8d210807a3602cd8ed76c439b6444c11462596f647e6c9bb31aad8409ecee4c1 |
| src/utils/image.js | 35 | d04ae3bcf7927ef26dfbc2bd1fe443e2ca805eefe43ad09b7f9e1d4324b24c84 |
| src/utils/imageHintCache.js | 105 | a15b4cbfeaf560ee5e098242f8b461c04424490ea403b4b83ea8335d9187836c |
| src/utils/imageUploadPolicy.js | 29 | 1efe59391ab5b7396f1d0485245a1e35989a19f6da9aba3f5e9149bac00673d6 |
| src/utils/index.js | 12 | 06949b9d57575444abf0ce37d77c2e25f56189166bc7e9def3449206b807c158 |
| src/utils/lifecycleReadiness.js | 4 | 9f366ac79153e6ef8fb26224e170c2a3e7f579975838b39d8fb667a16f36af4b |
| src/utils/redirect.js | 73 | 6aecb17e987fb348b142d205d9c303ff9b1bdaa7657e23e4ed40b3288bf7b59a |
| src/utils/skeletonDelay.js | 26 | 6daff611644100b94a13ee36634daca6e93bc1b410115a010f2c3493d3943c85 |
| src/utils/storeDraftStorage.js | 250 | 489f050fc9917682a8c13e78d4a39849fb544a3a97396c08ba484bbfabdfa0df |
| src/utils/validation.js | 240 | 1346d742dd1f6efcd9a38e12d4e538ed75d2fb399f4149a3119ddb0e1a178ced |
