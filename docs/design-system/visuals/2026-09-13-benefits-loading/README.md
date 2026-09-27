# 소식·혜택 안내와 로딩 — 로컬 검증 기록

2026-09-13 최신 배치. 동결 디자인 시스템 ZIP과 별개인 **변경 후 시각/검사 기록**이다.
선택한 페이지 코드는 로컬 프리뷰이며 최신 dev 통합/운영 배포본이라고 표현하지 않는다.

## 예시와 실제 서버를 구분한다

- `/design-previews/benefits-and-loading.html`은 Vite 개발용 진입점이다. 실제 Benefits/BenefitDetail/DiscoveryNav/Bone/RouteSkeletonPreview를
  예시 데이터로 렌더한다. 생산 App에서 import하지 않으며 production HTML 진입점/라우트가 아니다.
  `25개 소식`과 두 소식은 **디자인 검증 fixture**다. 실제 소식 수나 운영 홍보 게시물로 표현하지 않는다.
  예시 헤더에는 검증 라벨을 두며 실제 로그인/프로필/메신저 동작을 대신하지 않는다.
- 실제 `localhost:8080/api/promotions/public?page=0&size=12`는 이번 점검에서 **HTTP 200 JSON**, `success=true`,
  `content=[]`, `page.totalElements=0`이었다. `localhost:5173/benefits` 브라우저도 실제 빈 소식 안내를 표시했다.
  소식을 새로 작성하거나 기존 내용을 운영 공개용으로 검수한 것은 아니다.
- 상세의 실제 공개 가능한 게시물이 없어 목록→상세→가게/목록 연결·본문 텍스트는 예시 및 mock/H2 테스트로 확인했다.
  사용자 인증을 주입하거나 요청을 브라우저에서 가로채지 않았다. 외부 사진을 복사하지 않았다.

## 실측과 캡처

| 대상 | 실제 치수/결과 | 캡처 |
|---|---|---|
| 예시 소식 PC | viewport 1440×900, 문서 scrollWidth 1425; 2열 행 각 556px, 썸네일 88×88·로드 성공 | [PC](benefits-pc.png) |
| 예시 소식 모바일 | viewport 390×844, 문서 scrollWidth 375; 1열 행 약 335.2px, 썸네일 72×72·로드 성공, 제목 20px | [모바일](benefits-mobile.png) |
| 예시 상세 모바일 | 390px, 문서 scrollWidth 375; 상단 탐색 탭 0개, 가게/소식 목록 링크 있음, 누락 사진 fallback 96×96 | [상세](benefit-detail-mobile.png) |
| 예시 골격 | 목록/청크 status에 aria-busy=true, 골격 안 interactive controls 0개 | [PC 전체 골격](benefits-loading-pc-full.png) |
| 실제 로컬 소식 PC | 1440×900, 문서 scrollWidth 1440, 실제 0건. 기존 다크 테마 유지 | [실제 PC](benefits-live-pc.png) |
| 실제 로컬 소식 모바일 | 390×844, 문서 scrollWidth 375, 실제 0건 | [실제 모바일](benefits-live-mobile.png) |

실제 공통 헤더는 64px, 탐색 탭 높이 44px/top 64px·blur(20px)다. 실제 다크 면은
rgba(22,24,28,.85), 예시 라이트 면은 rgba(255,255,255,.9)로 같은 header 배경 토큰을 따른다.
세로 스크롤바가 있는 문서의 client/scroll 폭과 viewport 폭이 15px 다른 것은 가로 넘침이 아니다.
배치 검사는 Codex 브라우저의 DOM/계산 스타일·화면 캡처다. 실제 iOS Safari·인증된 전 화면 매트릭스는 아니다.
임시 viewport/emulation 설정은 점검 후 해제한다.

## 실행 검사

여러 명시 실행의 **고유 frontend 117개 케이스**가 확인됐다. 117개 단일 통합 실행 또는 전체 suite 통과 주장이 아니다.

| 명시 파일/묶음 | 확인 |
|---|---|
| RouteLoadingSkeleton.test.jsx | 26개: 현재 25 URL + Suspense 준비 후 골격 제거. 최신 경량 분리 후 재실행 |
| Benefits.test.jsx | 11개: 목록/상세/페이지/오류·0건/텍스트 XSS·소유 이미지. 최종 코드 재실행 |
| Bone.test.jsx | 2개: 기존 named export 동일성·기본 스타일·호출부 override 우선순위 |
| MessengerContent.test.jsx | 12개: 기존 상태/읽음/초안/진입 회귀. 최초 목록 준비 후 클릭을 기다리도록 테스트 보정 |
| BookingCalendar.test.jsx | 1개: 실제 조회 대기 시 날짜 Bone·선택 불가, 기존 월 이동은 남음 |
| api/sessionScope.test.js | 5개: 공개 읽기 401은 auth refresh/로그아웃 흐름으로 변경하지 않음 + 기존 세션 경계 |
| Header.test.jsx | 4개: 공통 워드마크·검색·깊이/PC 뒤로가기 계약 |
| ReviewList.test.jsx | 2개: 초기 골격, 실패를 0건과 분리·재시도 |
| PersonalLoadingStates.test.jsx | 11개: 내 예약/가게/찜/결제 결과의 표시 전용 mock 상태 |
| admin LoadingStates + ChatReportsPanel | 35개 실행 통과 + 새 cached-refetch 8개 별도 통과 = 고유 43개. 43개 통합 실행 주장은 아님 |

백엔드 최종 `PublicPromotionRepositoryTest` 2 + `PublicPromotionServiceTest` 4 + `PublicPromotionSecurityTest` 2 = **8개**, 실패/오류 0.
root에서 Java 21/캐시 Gradle로 세 파일을 `--offline --no-daemon test --tests …` 실행해 BUILD SUCCESSFUL을 확인했다.
H2 content/count/detail 상태 조건·경계 정렬·실제 service read 후 조회수 불변, Mockito DTO 제외/Unicode 요약,
실제 SecurityConfig MockMvc의 공개 GET만 허용·기존 GET/CUD 보호 검증이다. 운영 MySQL/실제 계정 행위가 아니다.

- 최신 변경 대상 ESLint: exit 0.
- index.css/feature-surfaces.css PostCSS 파싱 및 한글 선택자 사고 guard: 통과.
- 저장소 `git diff --check`: exit 0. 기존 일부 파일의 CRLF→LF 안내만 있었으며 새 Git 쓰기는 하지 않았다.
- Vite production build: exit 0. sitemap 생성 prebuild는 실행하지 않았다(SEO/사이트맵 변경 범위 없음).
- 최초 build 후 budget 실패: index 671.3 KiB, initial JS 355.4 KiB gzip.
  정적 route 골격이 관리자 Pagination 코드를 가져오는 경로를 확인해 Bone을 경량 분리하고 route-only 골격으로 차단했다.
  재빌드/기존 budget script 통과: **initial 320.9 KiB gzip / largest 563.4 KiB**, 기준 350/600 KiB를 올리지 않았다.
- 스냅샷 `-Stage Verify`: 소스 108개·ZIP 117항목의 byte/hash 일치, SHA-256
  `02d5809dabf319ed1778140210e4303862b5f5a37b0b5ef6dd5d880514af536e` 그대로.
  현재 소스 6개가 동결본과 달랐으며 예상된 진화이지 보관본 변조가 아니다. ZIP/기존 manifest를 덮어쓰지 않았다.

인증·계정 변경·예약/환불/결제·가게 폐업·제재·실제 대화·OS 알림·카메라·운영 인프라/DB는 실행하지 않았다.
커밋/PR/머지/태그/push/배포는 하지 않았다.

## 읽기 근거와 후속

- [현재 24 페이지 파일/25 URL 인벤토리](page-source-inventory.json): 5,731줄, 각 SHA-256.
- [관리자/사업자 23파일 인벤토리](internal-source-inventory.json): 5,690줄, 페이지 2파일 중복 포함.
- [페이지별 판정·보완·남은 경계](../../../technical/history/2026-09-preview/skeleton-audit-2026-09-13.md).
- [기능/디자인 전환 계획](../../../technical/history/2026-09-preview/design-evolution-plan-2026-09-13.md).

주소 검색/시간 슬롯 조회 실패·사업자 수정 프리필 실패·기존 홍보 수정/삭제의 현재 소유권 관문은 다음 데이터 안전 배치다.
실제 쿠폰·인기 검색어·웨이팅·피드는 선행 모델/권한/보존 정책과 함께 별도 계획으로 남긴다.
