# RESERVE 다음 대화 인수인계 — UI·메신저·모션

> 작성: 2026-09-16. 다음 대화가 이 긴 대화의 요구와 로컬 프리뷰 상태를 이어받기 위한 기록이다. **현재 코드로 확인한 구현**, **2026-09-15에 실행한 검사**, **대화에 붙여 넣은 이전 답변·제안**, **운영 미확인**을 구분한다. 이 문서는 새 커밋이나 배포 상태의 증거가 아니다.

## 2026-09-16 후속 체크포인트 — 아래의 기존 기록보다 우선

- 모바일 지역 시트가 위로 크게 튄 뒤 내려오던 원인은 진입 중 AntD 래퍼의 자동 스크롤(`scrollTop` 약 460→0)이었다. 모바일 래퍼를 `overflow: clip`으로 고정하고, 바깥 모달은 페이드만, 고정 높이 컨테이너만 아래에서 위로 움직이도록 바꿨다. PC 중앙 모달과 모션 감소 즉시 전환은 유지했다. [CSS](../../../../frontend/src/styles/global/region-sheet.css), [모션 e2e](../../../../frontend/e2e/region-sheet-motion.spec.js). Pixel 7 모의 Playwright의 모바일 진입·닫힘·PC·모션 감소 집중 5개 통과, 데스크톱 전용 검사 1개 skip. **실제 Safari/기기 검사는 아니다.**
- 가게 상세는 사진 위 둥근 하트를 제거하고 제목 옆 일반 하트로 옮겼다. 제목→별점→`카테고리 · 설명`→키워드→조금 큰 `가게에 문의하기` 버튼 순서이며 모바일 버튼은 내용 폭을 쓴다. 고객의 가게 채팅 목록/대화 사진은 서버가 현재 가게 대표 이미지를 내려줘 사용한다. 지원 R 로고와 사장님 받은 문의의 고객 아이콘은 그대로다. 사진 URL이 무효/실패하면 가게 아이콘으로 대체한다. 대표 사진 등록 UI에 카드·고객 채팅 사용처를 알렸다. [상세](../../../../frontend/src/pages/store/StoreDetail.jsx), [채팅 서버](../../../../backend/src/main/java/kr/it/reserve/chat/service/ChatService.java), [이미지 안내](../../../../frontend/src/components/store/StoreForm/StoreImages.jsx).
- `내 가게 관리`와 탐색 목록은 [공통 툴바](../../../../frontend/src/components/store/StoreListingToolbar.jsx)를 공유한다. 내 가게도 카드/목록형·내 가게 지역·분야·정렬을 제공하며 기존 수정/영업 종료 액션을 보존한다. 기본 최신 등록순·별점·리뷰·이름순을 제공하고, GPS가 부적합한 관리 화면의 거리순은 제외했다. 탐색의 지역·분야·정렬 hover 면은 하나의 `--c-gray-50`, 32px 표시 면/44px 클릭 영역으로 맞췄다. [관리](../../../../frontend/src/pages/store/MyStores.jsx), [CSS](../../../../frontend/src/styles/global/store-listing-toolbar.css).
- 회색 hover **정적 전수조사** 범위는 첫-party 전역 CSS 12개 전체와 제품 JS/JSX 232개다. PostCSS 기준 hover 규칙 103개, hover 배경 선언 49개. 기존 지역 `--c-hover-surface`(라이트 `#f2f4f6`)와 정렬 `--c-gray-50`(라이트 `#f9fafb`)의 색/모서리 차이가 툴바 불일치의 직접 원인이었다. 다른 역할의 선택/포커스/다크 AntD 생성 스타일은 일괄 치환하지 않았다. 이 수치는 **정적 범위**이고 전 화면 픽셀·AntD 런타임 전수 검증은 아니다.
- 이번 후속 수정의 집중 검사: 프론트 상세/채팅 78개, 최종 변경 반영 일부 45개와 대표 사진 통합 1개(서로 중복되어 합산하지 않음), 백엔드 `StoreChatServiceTest` 지정 통과, 관리 툴바 관련 15개 통과, 대상 ESLint/PostCSS 통과, 직접 `vite build` exit 0. 로컬 인앱 브라우저에서 390px 홈 지역 시트와 탐색 툴바를 열어봤다. **로컬 백엔드가 내려가 있어 데이터·로그인된 내 가게·실계정 채팅 E2E는 미검증**이다. 전체 suite, `npm run build`의 pre/post 단계, 운영 배포도 실행하지 않았다.
- 지역 실사진/지자체 CI는 **아직 연동하지 않았다**. TourAPI/공공누리 후보별 사진 권리·출처·가공 허용 여부와 시도/시군구 코드 매핑을 확인하고, 검수한 자산만 캐시/폴백과 함께 넣는 것이 다음 단계다. 지자체 CI는 공식 제휴 오인 및 별도 사용규칙 위험이 있어 도입 전에 기관별 허락을 확인한다.

## 먼저 읽을 요약

1. 사용자가 원하는 방향은 사진·3D 탐색의 개성을 유지하면서도 앱처럼 일관된 UX를 만드는 것이다. 헤더·탭은 고정하고 콘텐츠만 방향에 맞춰 움직인다. hover만으로 탐색 요소를 파랗게 만들거나 클릭에 파란 외곽선을 일괄 적용하지 않는다. 단, **키보드 포커스는 보이게** 하고 버튼의 눌림은 역할별로 구분한다.
2. 카드 밀도·가로 목록 보존, 비회원 로그인/시작하기 헤더, 검색·탐색 모션, 6초 전체 배너 자동 이동, 지역 시트, 메신저 목록/명칭은 **로컬 프리뷰 코드에 있다**. 지역 사진·지자체 로고·전면 3D 교체·모든 화면의 공유 View Transition은 아직 없다.
3. 가장 중요한 새 점검 후보는 **사업자 역할 강등 후 가게 대화 API 접근**이다. UI는 받은 문의를 BUSINESS/ADMIN에게만 보여주지만 서버는 로그인+가게 소유 관계를 확인한다. USER로 강등되고 소유 관계가 남는 상태의 열람·답장은 코드 경로상 가능해 보인다. 이는 **추론이며 실계정 E2E는 미실행**이다. 과거 열람과 새 답장의 정책을 먼저 정한 뒤 서버 단일 관문과 회귀 검사를 설계해야 한다.

## 현재 작업 경계

- 작업 위치: `C:\Users\USER\Projects\RESERVE`, 브랜치 `local-preview-all-changes`.
- 이 문서를 만들기 **전** 2026-09-16 읽기 전용 `git status` 기준, 로컬 캐시 `origin/dev`보다 1커밋 앞/25커밋 뒤, porcelain 변경 항목 335개(추적 파일 변경 160, untracked 항목 175), 스테이징 0개다. 이 새 문서를 만든 뒤에는 untracked 항목이 하나 늘어난다. **fetch하지 않았으므로 원격 최신 상태가 아니다.** UI뿐 아니라 백엔드·문서·스크립트와 사용자 소유 `Claude outputs/`가 섞여 있다.
- 이 대화에서 커밋·스테이징·PR·태그·배포·운영 설정 변경은 하지 않았다. 다음 대화에서도 **그 대화의 명시적 승인 전에는** `git add`, commit, PR, push, deploy, reset/clean/restore, 삭제를 하지 않는다. 기존 프리뷰와 스냅샷을 보존한다.
- 첨부 스크린샷과 붙여 넣은 과거 답변은 디자인 참고·이전 시점 기록이다. 현재 기능·권한·검증을 주장할 때는 실제 코드·실행 결과를 다시 확인한다. 최신 체크포인트는 [디자인 시스템](../../design-system.md), 과거 배치는 [안정화 기록](stabilization-progress-2026-09-14.md)과 [디자인 전환 계획](design-evolution-plan-2026-09-13.md)을 링크로 확인하되 숫자를 현재 검사로 합산하지 않는다.

## 로컬 프리뷰에서 확인한 구현

| 영역 | 현재 구현 | 보존 계약·남은 경계 |
|---|---|---|
| 헤더와 로그인 시작 | 비회원 헤더에 검색 아이콘, `로그인`·`시작하기`가 있고 PC·모바일 반응형 규칙을 공유한다. [Header](../../../../frontend/src/components/layout/Header.jsx) | 로그인 경로·약관·뒤로가기 의미를 바꾸지 않는다. PC/모바일 전체 조합을 이번 문서화 턴에 새로 실행하지 않았다. |
| 가게 카드/목록 | 세로형은 사진 원본 비율, 제목 옆 하트, 종류·광고·우리동네 일반 텍스트 → 실제 별점. 정보 영역은 12px 패딩/요소 사이 2px으로 압축했다. 가로로 긴 목록형은 별도 행·하트·이미지 80px(모바일)/96px(PC)를 유지한다. [StoreCard](../../../../frontend/src/components/store/StoreCard.jsx), [StoreListRow](../../../../frontend/src/components/store/StoreListRow.jsx), [스타일](../../../../frontend/src/styles/global/feature-surfaces.css) | 2026-09-15 실측에서 첫 카드 정보 높이 약 110→94px, 사진 높이 불변. 세로 비율의 R 사진 때문에 둘째 카드 전체 높이는 여전히 길다. 동일 높이 강제는 원본 사진 자르기와 충돌한다. |
| 보기 모드/상세 | `/stores`는 카드형 `?view=cards`와 가로 행 `?view=list`를 모두 명시한다. 보기 전환은 같은 조회 데이터를 재사용하고, 데이터 스켈레톤 중에는 아이콘을 잠근다. 상세는 카드와 같은 이름·종류·평점·소개 위계 및 문의 액션을 PC·모바일에서 공유한다. [StoreList](../../../../frontend/src/pages/store/StoreList.jsx), [StoreDetail](../../../../frontend/src/pages/store/StoreDetail.jsx) | 가로 행의 배치·원본 이미지 비율·예약/문의 동작을 임의로 재설계하지 않는다. |
| 검색/탐색 이동 | `/search`는 입력·헤더를 고정하고 내용만 PC 8px/모바일 24px 진입, 취소/Escape 역방향 닫기, 모션 감소 즉시 전환. 최상위 발견 탭은 헤더·탭 아래 **도착 콘텐츠만** 좌·우 16px/260ms로 이동하고 브라우저 뒤로가기는 역방향이다. 로딩 스켈레톤은 움직이지 않는다. [Search](../../../../frontend/src/pages/Search/index.jsx), [App](../../../../frontend/src/App.jsx), [탭 모션](../../../../frontend/src/styles/global/discovery-motion.css) | 두 페이지가 동시에 밀리는 완전한 View Transition은 아니다. 검색어/분야가 있는 `/stores` 결과는 하위 결과 화면으로 취급해 최상위 탭 모션 대신 국소 진입·페이지네이션 모션을 쓴다. |
| 홈 배너/추천 | 사진과 문구를 따로 재등장시키지 않고 **슬라이드 전체**가 scroll-snap으로 이동한다. 6초 자동 전환은 화면 밖·비활성 탭·hover/focus·모션 감소에서 멈춘다. 추천 섹션의 구분선은 현재 CSS 변수 기준 1px이다. [Home](../../../../frontend/src/pages/Home/index.jsx), [스타일](../../../../frontend/src/styles/global/feature-surfaces.css) | 배너 안의 요소별 reveal을 되살리지 않는다. 실제 자동재생 시간과 포커스 동작은 관련 e2e에서만 검증됐다. 과거 문서의 더 두꺼운 구분선 수치는 현재 코드보다 오래됐다. |
| 지역 선택 | 홈/목록 공통 [RegionSheet](../../../../frontend/src/components/discovery/RegionSheet.jsx). PC는 짧은 중앙 모달, 모바일은 아래에서 열리고 아래로 닫히는 시트다. 기본 AntD 확대 모션을 교체했고, 시트 z-index 1100으로 R 런처(1001)보다 위에 놓였다. `전체 지역` 회색 hover 면은 실제 44px 동작 영역보다 작고 마우스에만 적용된다. 핀은 outline 형태로 통일했다. [지역 스타일](../../../../frontend/src/styles/global/region-sheet.css) | 지역 수/인기 지역은 공개 ACTIVE 가게 주소 기반이고, 실제 지역 사진·지자체 CI는 없다. `현재 위치`는 별도 명시적 클릭에서 브라우저 위치 권한을 요청한다. |
| 메신저 화면/명칭 | 로그인 전용 R 런처, PC 패널·모바일 `/messages`. 대화·설정 제목은 동일한 72px 위치, 목록의 흰 8px 틈 제거, 빈 지원 대화 안내. 지원 상대는 `RESERVE 고객지원`, 가게 대화에서 고객에게는 가게명, 사장님 받은 문의에는 고객명. 목록은 제목·최근 본문 미리보기·시간·안읽음 위주다. [MessengerShell](../../../../frontend/src/components/chat/MessengerShell.jsx), [목록 행](../../../../frontend/src/components/chat/MessengerConversationRow.jsx), [명칭](../../../../frontend/src/components/chat/messengerIdentity.js) | 톡 홈의 사진 커버는 대화/설정의 72px 목록 헤더와 역할이 다른 별도 화면. owner 대화 헤더의 작은 `가게·받은 문의` 표기는 남아 있다. 실제 두 계정·실기기·운영 알림 흐름은 미검증. |
| 사장님 문의 | 고객 STORE 방, 사장님 받은 문의 목록·열람·답장, 방별 최근 미리보기·읽음·안읽음은 코드에 있다. [ChatApiController](../../../../backend/src/main/java/kr/it/reserve/chat/controller/ChatApiController.java), [ChatService](../../../../backend/src/main/java/kr/it/reserve/chat/service/ChatService.java), [MessengerContent](../../../../frontend/src/components/chat/MessengerContent.jsx) | 별도 사업자 패널 진입점과 OS push/서비스워커 알림은 없다. PC opt-in 알림과 폴링은 실제 사장님 신규 문의 알림 계약을 대체하지 않는다. 아래 권한 경계가 선행이다. |
| 중립 상호작용 | 검색·지역·메신저 입력·모달 X는 hover/마우스 클릭과 키보드 `:focus-visible`을 구분한다. 모달 X 포커스 링은 지역 예외가 아닌 공통 중립색 2px 관문으로 수정됐다. [상호작용 CSS](../../../../frontend/src/styles/global/interactions.css), [디자인 계약](../../design-system.md) | 공통 `.reserve-btn`, R 런처, 헤더 계정 등의 파란 **키보드** 링은 남아 있다. 접근성 표시를 없애는 일괄 치환이 아니라 동작별 실측 후 결정해야 한다. |

### 새로 확인한 채팅 권한 경계 — 결론 아님

- [ChatApiController](../../../../backend/src/main/java/kr/it/reserve/chat/controller/ChatApiController.java)의 `/store-inbox/**`는 `isAuthenticated()`이고, [ChatService](../../../../backend/src/main/java/kr/it/reserve/chat/service/ChatService.java)의 소유자 관문은 현재 가게 owner ID를 검사한다. 현재 역할 `BUSINESS/ADMIN` 확인은 이 경로에 없다.
- [BusinessVerificationService](../../../../backend/src/main/java/kr/it/reserve/business/service/BusinessVerificationService.java)는 자격 취소·포기 시 역할을 USER로 낮추지만 해당 메서드에서 가게 owner 관계를 떼지 않는다. 소유 관계가 남는다면 UI가 숨기는 받은 문의를 직접 API로 열람·답장할 가능성이 있다. 실제 DB 상태·세션·통합 테스트로 재현하지 않았으므로 **확정 취약점으로 단정하지 않는다**.
- 결정이 필요하다: 역할 강등 후 **과거 대화 열람**, **새 답장**, **안읽음 합산**, **가게 폐업 후 기록 접근**의 정책을 각각 정한다. 이후 서버의 단일 역할+소유권 관문과 역할 전환 회귀를 만든다. 단순히 UI만 숨기거나 과거 원장을 무조건 삭제하지 않는다.

## 실행한 검사와 실행하지 않은 검사

| 시점 | 확인된 실행 | 의미와 제한 |
|---|---|---|
| 2026-09-15 직전 구현 턴 | 카드 집중 Vitest 33개; 탐색/Home 집중 35개; 지역 Home/StoreList 집중 30개; Playwright PC·모바일 탐색 6 + 배너 2 + 지역 4개; 대상 ESLint·PostCSS CSS 파싱·지정 `git diff --check`; **직접 Vite build exit 0** | 반복·겹치는 검사 수를 총합으로 더하지 않는다. 직접 `vite build`는 `npm run build`의 sitemap prebuild와 bundle-budget postbuild를 실행하지 않았다. 로컬 Chromium/인앱 브라우저 관찰이지 실제 iPhone Safari·운영 증거가 아니다. |
| 2026-09-16 이 문서 작성 턴 | 현재 파일·Git·기존 문서 읽기 전용 대조. 새 코드 테스트, 실제 계정 대화, live 원격/운영 조회 **미실행** | 과거 체크포인트의 55개/158개 등 숫자를 이번 변경의 통과로 재사용하지 않는다. 새 문서의 링크·형식만 검사한다. |

전체 백엔드/프론트 스위트, 전 URL·320/390/태블릿/PC·다크/고대비 화면 매트릭스, 실제 Safari, 위치 권한 거부/승인, 두 계정과 역할 강등을 포함한 채팅 E2E, 실제 PortOne/DB/AWS, 운영 배포는 이번 UI 턴의 검증 범위 밖이다. 관련 소규모 브라우저 하네스는 [e2e 폴더](../../../../frontend/e2e)의 `interaction-patterns`, `search-motion`, `discovery-tab-motion`, `home-banner-autoplay`, `region-sheet-motion`, `messenger-identity` 등에 있다. **제품 전체 hover·모션을 자동 보증하는 하네스가 완성됐다는 뜻은 아니다.**

## 장단점과 보류한 선택

| 선택 | 장점 | 비용·주의 | 현재 판단 |
|---|---|---|---|
| 원본 사진 비율 + 정보 간격만 압축 | 사진을 훼손하지 않고 카드 텍스트 밀도를 개선한다. 가로 행 배치도 보존한다. | 세로 R 사진은 긴 카드로 남고 카드 높이가 서로 다르다. | 현재 구현 유지. 동일 높이가 꼭 필요하면 별도 크롭 정책 승인을 받는다. |
| 도착 콘텐츠의 짧은 CSS 탭 모션 | 현 `BrowserRouter`에서 헤더·탭·스켈레톤을 안정적으로 고정하고 모션 감소를 쉽게 제공한다. | 두 화면이 이어져 함께 움직이는 네이티브 앱 수준의 공유 전환은 아니다. | 현재 구현 유지, 더 큰 View Transition은 한 경로로 별도 실험한다. |
| 공통 RegionSheet: 모바일 하단/PC 중앙 | 같은 지역 값·적용 계약을 재사용하면서 기기별 자연스러운 진입을 제공한다. | 모바일 86svh 안의 목록·키보드·런처 층위와 PC 닫힘/재오픈을 지속 검증해야 한다. | 유지. 지역별 사진은 별도 자산 작업이다. |
| 역할별 눌림·중립 hover/포커스 | 탐색·CTA·토글의 의미를 구분하고 클릭의 파란 halo를 줄인다. | 공통 버튼/AntD 런타임/키보드 포커스가 서로 달라 일괄 CSS 치환은 회귀 위험이다. | 공통 관문+국소 브라우저 검증. 키보드 포커스 자체는 제거하지 않는다. |
| R 이미지 런처 / 벡터 교체 | 현재 브랜드 자산 재사용으로 빠르고 일관적이다. | `R_logo.png`는 512×512지만 버튼에서 `object-fit: cover`, 여백 없이 100% 채워 답답해 보인다. 흐릿함의 정확한 원인은 시각/렌더링 계측 전엔 불명이다. | 이미지 자체를 이번에 수정하지 않았다. 패딩/벡터 시안 2–3개를 실제 DPR·다크/라이트에서 비교한다. |
| 탐색 3D 이미지 / 기능 선형 아이콘 | 홈 바로가기의 기존 WebP와 어울리는 개성을 키울 수 있다. | 새 이미지 제작·파일 무게·라벨 접근성·화면별 일관성 관리가 필요하다. 검색·뒤로가기·X까지 3D로 바꾸면 기능 식별이 흐려진다. | 홈 목적지 2–3개 시안만 비교; 기능 아이콘은 선형 유지. |
| 지역 실사진 / 지자체 로고 | 사진은 지역 탐색의 분위기를 준다. | 사진은 지역 대표성·출처·라이선스·대체 이미지·로딩을 관리해야 한다. 지자체 CI는 민간 서비스가 공식 관계인 듯 보일 수 있다. | [TourAPI](https://www.data.go.kr/data/15101578/openapi.do)의 사진을 후보로 **자산별 조건을 확인해 선정**한다. [공공누리 FAQ](https://www.kogl.or.kr/info/faqList.do?dataGroup=1&mstIdx=KOGL_019)에 따라 지자체 CI는 기관별 허락/사용 규칙 확인 전 도입하지 않는다. 현재 outline 핀을 fallback으로 유지한다. |
| 명시적 `?view=cards` / `?view=list` | URL 명시형은 공유·새로고침·뒤로가기 설명이 쉽다. | 기존 값 없음·잘못된 값은 `replace`로 각 화면의 기본 보기 주소로 교정한다. | **2026-09-17 결정·반영.** 가게 탐색·내 가게는 cards, 내 예약은 list가 기본이며 모두 값을 URL에 쓴다. 메신저 내부 view는 현재 Zustand 메모리 상태이며 URL `?view=`가 아니다. |
| Aside 개발 브라우저 / 기존 Chrome DevTools·Playwright | Aside는 브라우저 안의 에이전트 작업 실험에 유용할 수 있다. [공식 소개](https://aside.com/) | Aside를 쓰면 React의 내부 가상 DOM까지 자동 노출된다는 근거는 확인되지 않았다. 로그인 세션·파일/웹 컨텍스트 접근 범위와 외부 모델 전송 조건을 점검해야 한다. [Aside 개인정보 정책](https://aside.com/policy/privacy). [Chrome DevTools for agents](https://developer.chrome.com/docs/devtools/agents/get-started)는 라이브 DOM/성능 진단 도구지만 인증 세션을 연결하면 에이전트가 그 세션으로 행동할 수 있다. | 설치·연결 **미실행**. 우선 분리된 로컬 테스트 세션에서 현재 Playwright/컴퓨터 UI 계측을 기준선으로 두고 Aside와 Chrome DevTools MCP를 별도 비교한다. 운영·결제·개인 계정은 연결하지 않는다. |

**하네스**는 디자인 규칙을 문장에만 남기지 않고 반복 검사로 묶는 장치다. 예: 토큰/금지 CSS 정적 검사 → 컴포넌트 상태 단위 검사 → PC·터치·키보드·모션 감소 Playwright 검사 → 시각 회귀 검토. 반복할수록 회귀를 빨리 잡지만 선택자·스크린샷의 거짓 양성, CI 시간, 변경 후 기준선 관리 비용이 든다. 현재 `test:policy`와 e2e 일부가 출발점이며 전 제품의 hover/눌림/포커스를 다 막는다고 표현하지 않는다. [오래된 UI 결정 문서](../../ui-decisions.md)의 “공통 새로고침 화살표가 회전한다”는 설명은 현재 [RefreshButton](../../../../frontend/src/components/common/RefreshButton.jsx)의 로딩 링 교체와 어긋난다. 메신저 [목록 새로고침](../../../../frontend/src/components/chat/MessengerListHeading.jsx)은 화살표 자체를 회전시켜 표현 통일이 남아 있다. 메신저 새로고침과 X의 동작 영역은 모두 44×44px이고 아이콘 글꼴도 18px이므로, X가 더 작게 보이는 현상은 실제 픽셀 박스보다 아이콘 형태의 광학적 차이부터 확인한다.

## 다음 대화의 권장 순서

1. **P0 — 코드·Git 상태 재확인.** `AGENTS.md`, 이 문서, [디자인 시스템](../../design-system.md), `git status --short --branch`를 읽는다. dirty 프리뷰의 기존 변경을 전부 사용자 소유로 두고, `origin/dev`/PR/운영 최신 상태가 필요한 주장에는 별도 읽기 전용 조회를 한다. 스냅샷과 기존 `Claude outputs/`를 보존한다.
2. **P0 — 채팅 역할 정책/보안 재현.** 역할 강등 후 소유 가게 관계가 남는 사례의 목록·과거 열람·답장·안읽음을 서버 테스트와 두 계정 로컬 E2E로 구분한다. 과거 기록 접근/새 전송 정책을 사용자와 정하고 **서버 한 관문**에 역할+소유권을 둔다. 사장님 패널/알림 디자인은 이 경계 이후다.
3. **P1 — 화면·모션 실측.** 비회원/일반 회원/사업자, 320·390·768·태블릿·PC, 라이트·다크·모션 감소에서 헤더/검색/탭/배너/카드 보기/지역 시트/메신저를 국소 테스트한다. 실제 iPhone Safari·권한 거부/승인·키보드·safe-area는 Chromium 모의 결과와 분리한다. 배너 **전체** 이동, 헤더·탭 고정, 시트 닫힘 역방향을 확인한다.
4. **P1 — 상호작용 관문과 하네스.** 공통 RefreshButton과 메신저 새로고침의 로딩 표기를 통일할지 정한다. 공통 버튼/헤더 계정/R 런처의 파란 키보드 링은 hover/마우스 클릭과 분리해 점검하고 필요한 관문만 중립화한다. 정책 검사와 hover·pressed·focus·reduced-motion e2e를 소규모로 확장하고 문서의 오래된 설명을 바로잡는다.
5. **P2 — 사장님 UX와 시각 자산.** 받은 문의 진입점·실제 신규 문의 알림/읽음 계약, R 런처 시안, 3D 목적지 아이콘, 지역 사진·출처/권한, 기본 `?view=` URL 정책을 각각 작은 결정으로 분리한다. 실제 데이터 없는 예약 가능·인기·리뷰·지역 대표 사진을 꾸며 넣지 않는다.
6. **P3 — 릴리스/운영은 별도 승인 게이트.** 프리뷰를 기능별로 분리하기 전 최신 `dev`와 충돌·검사·[과거 분리 계획](preview-release-plan-2026-09-03.md)을 다시 검토한다. [배포](../../deployments.md)·[결제](../../payments.md)·[백업](../../backup.md) 문서가 기록한 TEST 웹훅/동시 환불, 백업 복원 훈련, 신뢰 가능한 CSP 7일 관측, 롤백 훈련의 실제 최신 운영 증거를 별도 수집한다. 로컬 UI 빌드 성공을 운영 준비 완료로 취급하지 않는다.

## 다음 대화에 붙일 시작 요청

> `C:\Users\USER\Projects\RESERVE\docs\technical\session-handoff-2026-09-16.md`를 읽고 현재 코드·Git 상태와 차이가 있는지 먼저 확인해줘. 기존 dirty 프리뷰와 `Claude outputs/`는 보존하고, 이 대화에서 별도 승인 없이 stage/commit/PR/배포하지 마. 우선 사업자 역할 강등 후 가게 채팅 열람·답장 경계를 재현하고 정책 선택지를 설명해줘. 그 다음 UI/모션 남은 항목을 검증 범위와 함께 순서대로 진행하자.
