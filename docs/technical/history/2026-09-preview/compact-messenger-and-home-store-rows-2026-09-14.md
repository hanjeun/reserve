# 작은 메시지 입력창·홈 추천 가로 행·로딩 재점검

> 2026-09-14 `local-preview-all-changes` 로컬 수정. 커밋·통합·배포·DB 초기화·백엔드 재시작은 하지 않았다.
> 사용 중인 반쪽 Chrome/NamuWiki 창은 변경하지 않고 숨김 IAB에서 반응형 DOM을 확인했다.

## 구현한 범위

- `MessengerContent`: 입력 박스 50px, textarea 40px/24px 줄 높이와 PC 14px·모바일 16px 글꼴, 전송 버튼 44px를 가운데 정렬했다. 여러 줄 입력은 내부 스크롤한다. 아래 초안/키보드 문구만 제거하고 초안·Enter/Shift+Enter/한글 조합·2000자·실패/전송 차단을 보존했다.
- 대화 목록 하단의 중복 문의 CTA와 관련 미사용 CSS를 제거했다. 홈의 ‘관리자에게 문의’, 실제 상대 선택, 뒤로가기와 footer는 그대로다. 빈/오류 목록 진입은 지원방 생성·읽음 처리를 하지 않는다.
- 실제 홈 추천은 첨부된 캐치테이블 가로 행 참고에 맞춰 `1:1 사진 — 이름 / 한 줄 소개 / 평점(리뷰)·종류·주소`로 바꿨다. 모바일/태블릿 1열, 900px 이상 2열이다. 사진은 64px/768px 이상 80px이며 홈 썸네일만 `cover`를 사용한다. 일반 StoreCard와 Core·동결 스냅샷은 변경하지 않았다.
- 실제 평점, `getStores({ page: 0, size: 4, sort: 'rating' })`, 상세 링크, 조회/오류/재시도/정상 0건 분기, 같은 가로 골격의 Bone을 보존했다. 0리뷰 안내는 이후 최신 피드백에 따라 별 아이콘·`0.0 (0)`으로 통일했다. [후속 기록](search-results-and-rating-zero-2026-09-14.md). 캐치테이블의 가게·사진·혜택·리뷰 데이터를 복제하지 않았다.
- DEV 메신저 예시는 실제 입력 CSS와 같은 placeholder를 사용한다. 예시 표시와 전송 비활성 상태는 유지하며 API·인증·읽음·영구 저장을 연결하지 않았다.

## 홈 스켈레톤의 현재 상태

| 영역 | 실제 처리 | 판정 |
|---|---|---|
| 앱 인증 초기화 | `Loading fullPage` | 스피너이며 스켈레톤 아님 |
| 홈 페이지 코드 청크 | `RouteLoadingSkeleton`의 `DiscoverySkeleton` | 배너와 바로가기의 근사 골격. 실제 사진 파일 다운로드 상태를 추적하지 않음 |
| 추천 가게 데이터 | 최초 `isLoading` 때 가로 행 4개 Bone | 적용. 오류·재시도·정상 0건 구분, 성공 캐시 재조회는 콘텐츠 유지 |
| 운영 안내 데이터 | 최초 AntD Skeleton | 적용. 오류·재시도 구분, 정상 0건은 섹션 숨김 |
| 메인 배너 사진 | 정적 3개, 첫 사진 eager/high·나머지 lazy, 비율/어두운 면 예약 | 이미지 다운로드 전용 shimmer와 `onError` 대체는 미적용 |
| 서비스 3D·빠른 메뉴 사진 | 정적 링크/라벨, 이미지 원본 치수 지정 | 정적 데이터 골격은 불필요. 이미지 다운로드/실패 전용 처리는 미적용 |
| 추천 가게 사진 | API 성공 후 native lazy 이미지, 정사각 영역 예약 | 데이터 Bone이 없어져도 사진 대기는 남을 수 있음. 유효 URL의 다운로드 실패 대체는 미적용 |
| 헤더·탭·프로필·푸터 | 텍스트/링크/SVG 정적 구조. 계정 청크의 둥근 placeholder, Avatar 오류 fallback | 정적 데이터 골격은 불필요. 프로필 사진 오류 대체는 있으나 load shimmer는 없음 |

근거: `pages/Home/index.jsx`의 `FeaturedCarousel`, `DiscoveryShortcuts`, `NoticeHighlights`, `DiscoveryStoreCard`, `StoreRowSkeleton`, `RecommendedStores`; `App.jsx`, `RouteLoadingSkeleton.jsx`, `Header.jsx`, `HeaderAccountMenu.jsx`, `DiscoveryNav.jsx`, `Avatar.jsx`, `Footer.jsx`, `utils/image.js`, 중앙 `feature-surfaces.css`의 관련 구간.

현재 `getThumbnailUrl`의 URL 부재용 외부 placeholder는 **유효 URL의 네트워크 실패 대체가 아니다**. 이번 요청은 적용 여부 점검이므로 공통 이미지 로더를 추가하거나 전체 25개 URL을 다시 전환하지 않았다. 후속은 배너·3D·추천 이미지에 한정한 load/error 상태와 로컬 fallback 보완이 적절하다. 홈 청크 골격의 바로가기 4칸도 실제 10개와는 근사값이다.

## 실행한 확인

- 메신저 `MessengerContent.test.jsx`, `MessengerVisuals.test.jsx`, `MessengerSupportIntro.test.jsx`: 3파일 **67개 통과**. 빈/실패 목록의 중복 CTA 부재, 홈/기존 상대 진입, 입력 DOM/CSS 계약, 기존 질문·늦은 응답 방어를 포함한다. jsdom의 pseudo-element `getComputedStyle` 미구현 경고는 브라우저 픽셀 검증을 대체하지 않는다.
- 홈 `index.test.jsx`, `index.styles.test.js`: 2파일 **24개 통과**. 실제 데이터 순서·상세 링크·0리뷰·로딩/실패와 320~1248px 소스 폭 계약을 확인했다. 소스 계약의 폭 계산은 브라우저 실측과 구분한다.
- 변경 JS/JSX 7파일 ESLint: 경고 0으로 통과.
- 숨김 IAB: DEV 메신저 390×844·960×900에서 composer 50px/textarea 40px/send 44px, 세 영역 중심 일치와 문서 가로 넘침 없음. 예시 3줄 입력은 높이 40px을 유지하며 내부 scrollHeight 112px이다. 대화 목록에 문의 CTA가 없고 실제 상대별 예시 행·footer는 남는다.
- 공개 실제 `/` GET 화면: 390px은 1열·64×64px 사진, 960px은 2열·80×80px 사진, 모두 사진 오른쪽에 정보와 문서 가로 넘침 없음. 실제 리뷰가 없는 두 테스트 가게를 표시했고 가입·예약·결제·위치 권한·채팅 전송을 실행하지 않았다.
- Vite 직접 production build와 번들 예산 검사 통과(초기 gzip 321.1KiB). 대상 whitespace/diff와 중앙 CSS 파싱 검사도 통과했다. 전체 프론트/백엔드 suite와 로그인 두 계정 채팅·느린/실패 이미지 다운로드는 이번 검사 범위가 아니다.

## 임시 가게 이미지 제안과 별도 보류

사용자가 생성 사진을 받아 임시 가게를 직접 등록하는 흐름은 디자인 밀도·긴 제목·사진 비율을 확인하기에 유용하다. 이는 **제안**이며 이번에 이미지를 생성하거나 DB에 가게를 등록하지 않았다. 권장 범위는 로컬 테스트용 가상 가게, 명확한 테스트 표시, 실제 영업·혜택·리뷰로 오인되는 문구 금지와 예약/결제 차단이다. 해당 차단 기능이 이미 있다는 뜻은 아니다. 외부 공개/예약·결제 쓰기로 확대하기 전에 별도 경계를 정해야 한다.

이전 실제 로그인 점검의 채팅 API 404와 내역 초기화/재시작 보류는 [별도 기록](support-inquiry-and-chat-reset-2026-09-14.md)을 따른다. 이번 입력/카드 UI 변경은 그 오류를 해결했다고 주장하지 않는다.
