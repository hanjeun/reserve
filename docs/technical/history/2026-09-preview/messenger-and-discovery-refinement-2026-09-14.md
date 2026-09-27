# 톡·홈 추천·혜택 — 작은 사진 패턴 후속

> 혜택 메뉴3개와 설정 사진의 최신 후속은 [가로 혜택 배너·내 프로필 사진](benefit-banners-and-account-avatar-2026-09-14.md)이다. 아래 검사 수와 당시 레이아웃은 이력이며 현재 증거로 재사용하지 않는다. 홈 추천/톡 커버·관리자 사진의 구현은 보존했다.

> 2026-09-14 `local-preview-all-changes` 로컬 변경 기록. 사용자 제공 ChannelTalk/KREAM/캐치테이블 화면을 참고했다.
> 이번에 외부 사이트 DOM/CSS를 다시 조사했다고 주장하지 않는다. 기존 Core·동결 ZIP·무관한 작업은 보존한다.

## 구현

- 톡 홈은 **RESERVE 사진 커버 → 관리자 안내 카드와 문의 CTA 하나 → 고정 footer**다.
  최근 대화·중복 소개·분류/받은 문의의 빈 섹션을 홈에서 제거하고 실제 목록은 대화 탭에 모았다.
  메뉴 hover는 투명 배경·파란 아이콘만 사용한다. 선택·키보드 포커스·읽지 않은 배지는 유지한다.
- 내부 사진 커버는 새 기능이다. 기존 런처 사진 prop과 별개이며 `/og-image.png`를 기본으로 쓴다.
  `MessengerShell`/`MessengerContent`의 `coverImageSrc`로 교체 가능하지만 관리자 설정·업로드 UI는 아직 없다.
- 실제 지원 방의 마지막 ADMIN 답변자를 현재 ADMIN/미탈퇴/미제재 조건으로 다시 검사한다.
  목록/헤더에는 `counterpartName`·`counterpartProfileImage`, 지원 메시지에는 `senderName`·`senderProfileImage`를 추가했다.
  실제 발신자만 배치 조회하고 관리자 디렉터리·새 회원 ID·이메일을 노출하지 않는다. 기존 방 제목·권한·읽음은 유지한다.
  첫 문의/미답변/활성 관리자가 없는 경우 브랜드 사진으로 표시한다. 홈 사진을 위해 방을 생성하거나 읽지 않는다.
  지원 방이 아직 로드한 목록 페이지에 없으면 홈은 브랜드 fallback이다. 임의 관리자 선정을 하지 않는다.
- 사진은 표시 URL 관문에서 위험 프로토콜·URL 자격증명을 거부한다. HTTPS 외부 프로필과 같은 origin/API의
  개발 HTTP 사진은 허용한다. 프로필 실패는 브랜드 이미지→아이콘, 커버 실패는 제목/중립 배경을 유지한다.
  새 src는 다시 시도하고 헤더의 최신 null 사진은 오래된 목록 사진보다 우선한다. 사진 소유권을 증명하는 관문은 아니다.
- 홈 추천은 사진 위·이름/실제 리뷰/한 줄 소개/분류·주소 아래의 카드다. 3:2 면에 contain으로 원본을 보존한다.
  모바일 2열·576px부터 3열·900px부터 4열이다. 기존 4건 GET·상세 진입·0건/실패/재시도와 같은 치수 스켈레톤을 유지한다.
- 혜택의 큰 세로 블루 배너를 제거하고 작은 탐색 콘텐츠 3개로 바꿨다. 소식과 함께 보는 일반 가게도
  모바일 2열·900px부터 3열이다. 일반 StoreCard의 원본 사진 비율은 유지하며 서로 다른 사진의 높이를 억지로 맞추지 않는다.
  소식 사진 없는 placeholder는 확대하지 않고 실제 사진 hover는 유지한다. 소식/일반 가게 URL·12건 페이지 번호·조회 상태는 보존한다.
  실제 쿠폰·조건별 혜택·기간/할인·임의 인기/혜택 가게 수는 구현하거나 꾸미지 않았다.

## 숨김 브라우저 실측

Chrome 창·나무위키 탭·사용자 창 배치는 조작하지 않았다. 숨김 in-app browser에만 임시 viewport를 적용했다.
가로 스크롤바가 없는지 `documentElement.scrollWidth == clientWidth`, 카드/툴바의 자체 overflow도 함께 검사했다.
데스크톱 스크롤바가 있는 공개 화면은 clientWidth가 설정 폭보다 약15px 작다. 픽셀은 CSS 측정값이며 캡처 배율을 측정치로 쓰지 않는다.

| 설정 폭 | 실제 홈 추천 열 | 소식/함께 보는 가게 열 | 혜택 탐색 카드 높이 | 톡 검증 모드 |
|---:|---:|---:|---:|---|
| 320 | 2 | 2 | 108px | 모바일 |
| 390 | 2 | 2 | 108px | 모바일 |
| 768 | 3 | 2 | 100px | PC 420×620px 패널 |
| 960 | 4 | 3 | 100px | PC 420×620px 패널 |

- 실제 `/`의 2개 가게와 `/benefits`의 새 콘텐츠·정상0개 소식·2개 일반 가게를 비로그인 상태에서 확인했다.
  이전 체크포인트의 공개 API HTTP404는 역사적 기록이다. **이번 읽기 요청은 HTTP200**이며 원인/재시작 주체를 추정하지 않는다.
  이번 에이전트는 백엔드/Vite를 재시작하지 않았다.
- 여러 소식·페이지·실패/로딩/0건은 [혜택 DEV 예시](../../../../frontend/design-previews/benefits-and-loading.jsx) 및 지정 회귀다.
  실제 소식이 없는 상태에서 예시를 실제 혜택으로 채워 넣지 않았다.
- [톡 DEV 예시](../../../../frontend/design-previews/messenger-home.jsx)는 실제 Home/Footer/Settings/Row/Bubble 컴포넌트를 사용한다.
  관리자 이름·로컬 로고 사진·여러 대화는 명시적인 synthetic 데이터다. 모바일 프레임 헤더60px는 제품64px와 구분한다.
  커버200px·문의 카드 약177px·footer 약64px, PC 패널420×620px를 확인했다. 입력 중 footer0개, 목록/설정 footer1개다.
  실제 마우스 hover에서 footer 배경 transparent·라벨 중립색·아이콘 파란색·transform none을 확인했다.
  예시 다크 설정·지원 발신자별 이름/사진·목록 복귀도 확인했다. 실제 계정 응답 사진·두 계정 대화·권한의 브라우저 E2E 증거는 아니다.

## 지정 검사

- 프론트 최종 11파일 **158개 통과**, 123.05초: Home 2파일24개, Benefits 4파일56개,
  Messenger 4파일70개, Benefits CSS8개. 이후 일반 가게 밀도 회귀1개를 추가해 CSS9개가 통과했다.
  개별/반복 실행을 합산하지 않으며 고유 검사159개다. 최종 밀도 변경 후 혜택 지정5파일 **65개 재실행 통과**,
  61.38초다. 이65개를 앞선158개에 다시 합산하지 않는다.
- 백엔드 지정 Mockito **41개 통과**: SupportAgentProfile30·ChatHistory1·ChatConcurrencyGuard2·StoreChatService8.
  JUnit XML의 failure/error/skipped 0을 재확인했다. legacy null ADMIN 발신자 회귀를 보정했다.
  새 JPQL의 실제 MySQL 실행/실행 계획·실제 계정의 사진 응답은 남아 있다. endpoint/스키마/쓰기 권한은 추가하지 않았다.
- 변경 소스/회귀/DEV JSX **22개 명시 경로 ESLint 통과·경고0**, CSS3개 PostCSS 파서/한글 선택자 관문 통과.
- 마지막 직접 Vite production build **exit0·23.90초**, sitemap prebuild/배포/서버 재시작 없이 실행했다.
  bundle budget은 initial321.1KiB gzip / largest index-DZkPht7Y.js564.0KiB로 통과했다. 예산은 바꾸지 않았다.
  DEV 엔트리 경로/예시 관리자·가게 표식이 dist의 JS/HTML/CSS에 없음을 확인했다.
- 지정 `git diff --check` 통과. 전체 사이트/전체 스위트/WCAG 준수/운영 검증 완료를 뜻하지 않는다.

## 보존과 다음 단계

Core/108개 선택 소스 ZIP은 변경하지 않았다. ZIP SHA-256은 보관한 `archive.sha256`과 일치한다:
`02d5809dabf319ed1778140210e4303862b5f5a37b0b5ef6dd5d880514af536e`.
이번 변경은 RESERVE Patterns이며 독립 신규 프로젝트 starter를 만든 것은 아니다.
Git stage/commit/branch/merge/PR/push/tag/배포·DB·실제 전송/탈퇴/업로드·권한·사용자 저장 설정 변경은 하지 않았다.

다음은 실제 계정의 지원 프로필/대화 UX 확인과 상세·내 예약 대표 패턴 전환이다.
조건별 혜택·실제 쿠폰·지역 설정·배너 번호 개편·웨이팅·피드·광고·외부 알림/첨부/AI는 별도 계획을 유지한다.
