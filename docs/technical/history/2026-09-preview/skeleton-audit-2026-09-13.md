# 페이지 로딩과 스켈레톤 전수 점검

> 2026-09-13 `local-preview-all-changes` 최신 로컬 배치. 사용자 최종 선택은 **소식·혜택 안내부터**다.
> 실제 쿠폰·웨이팅·피드 모델을 새로 만들거나 기존 인증·예약·결제 쓰기 규칙을 바꾸지 않았다.
> ‘페이지 소스 점검’, mock 상태 검사, 실제 비로그인 브라우저/로컬 공개 GET을 구분한다.
> 이 표의 줄 수/해시/미해결 항목은 9월 13일 이력이다. 주소·시간 조회·사업자 수정 초기값과 홍보글 권한의
> 9월 14일 후속 상태/검사 결과는 [최신 안정화 기록](stabilization-progress-2026-09-14.md)을 따른다. 전체 25개 URL의 재검증 완료가 아니다.
> 홈의 최신 가로 추천 행과 배너·3D·추천 사진의 **이미지 다운로드 대기/실패 처리 미적용**은 [9월 14일 홈 재점검](compact-messenger-and-home-store-rows-2026-09-14.md)을 따른다. 정적 데이터에 API 골격이 불필요하다는 판정은 이미지 로딩 골격까지 구현했다는 뜻이 아니다.

## 범위와 판단 기준

- App의 명시 URL은 25개, 실제 페이지 소스는 24개/5,731줄이다. 웨이팅·피드는 같은 준비 화면을 사용한다.
  최신 경로·줄 수·SHA-256은 [페이지 인벤토리](../../../design-system/visuals/2026-09-13-benefits-loading/page-source-inventory.json)다.
  모든 현재 라우트 페이지를 직접 읽었다. [관리자/사업자 인벤토리](../../../design-system/visuals/2026-09-13-benefits-loading/internal-source-inventory.json)는
  23파일/5,690줄이며 AdminPanel/BusinessPanel과 중복된다.
- 관리자 폴더 18파일, 사업자 통계/광고, QR 스캐너 및 예약 행·예약 상세/QR 모달·주소 검색·메신저 등 직접 자식을 추가로 읽었다.
  과거 Home/sections의 미사용 mock/마케팅 컴포넌트, 모든 hook/service의 전체 코드, 운영 서버 전체는 이 전수 범위가 아니다.
- **청크 대기:** App의 공통 Suspense에 `RouteLoadingSkeleton`을 둔다. 페이지 코드가 도착하는 동안만 표시한다.
  아직 실제 데이터/이미지 비율을 알 수 없으므로 페이지 종류별 경량 근사 골격이며 픽셀 1:1 보장을 하지 않는다.
- **최초 데이터 조회:** 가능한 경우 기존 행/카드/표/폼 골격으로 실제 데이터 영역을 대체한다.
- **재조회:** 현재 화면의 캐시 유지 또는 기존 골격 교체 정책을 보존한다. 실패 시 이전 결과임을 알리거나 명확한 오류를 보여준다.
- **저장·전송·인증·카메라·결제 확인:** 실제 Button/ModalLoading/진행 상태를 사용한다. 입력 전체를 골격으로 바꾸지 않는다.
- 정적 약관/폼/빠른 검색과 준비 중 탭에 가짜 API 대기를 만들지 않는다. 실패를 정상 0건으로 표현하지 않는다.

## 현재 25 URL

경로 기준 `frontend/src/pages/`. ‘보완’은 이번 로딩/오류 UI 배치이며 전체 디자인 개편 완료라는 뜻이 아니다.

| URL / 파일·줄 수 | 초기 조회 / 재조회 / 작업 | 이번 판정·보완 |
|---|---|---|
| `/` · Home/index 418 | 추천 가게 행 Bone, 공지 Skeleton; 정적 사진/바로가기는 대기 불필요 | 기존 오류/0건/실제 평점 유지. 청크 골격 추가 |
| `/search` · Search/index 114 | 정적 서비스/빠른 검색, Enter 제출·복귀 | 데이터 골격 불필요. 인기 순위 API 없음 |
| `/benefits` · Benefits 76 | 새 소식 행 골격; 재조회 busy; 12건 페이지 번호 | 공개 실데이터 목록, 오류/0건/범위 밖 페이지 분리 |
| `/benefits/:id` · BenefitDetail 34 | 제목/사진/본문 Bone, 재시도 | 새 공개 텍스트 상세·가게/목록 연결. 임의 HTML 실행 없음 |
| `/waiting` · ComingSoon 29 | 정적 준비 안내 | 실제 대기 접수 없음, API 골격 불필요 |
| `/feed` · ComingSoon 29 | 정적 준비 안내 | 실제 게시/댓글/피드 API 없음 |
| `/stores` · StoreList 252 | 최초·재조회 StoreCardSkeleton; 필터/페이지 busy | 원본 카드/페이지네이션/조회 오류 유지 |
| `/store/:id` · StoreDetail 717 | 상세 골격; 리뷰/지도/월·시간별 조회 | 시간 슬롯 Bone 추가, 월 달력 대기 Bone·리뷰 실패/재시도 보완 |
| `/store/register` · StoreRegister 61 | 정적/임시저장 폼; 제출·이미지 업로드 loading | 폼 데이터 대기 불필요. 페이지 청크 골격 추가 |
| `/store/:id/edit` · StoreEdit 111 | 가게 조회 → 초기값 준비 후 폼 마운트 | 최초 spinner를 StoreFormSkeleton으로 교체; 소유권/수정 로직 보존 |
| `/my-stores` · MyStores 307 | 기존 카드 골격; 폐업 준비 ModalLoading | 조회 실패/재시도·초기 접근성 보완, 폐업 차단 보존 |
| `/my-reservations` · MyReservations 333 | 기존 최초·재조회 예약 행 골격; 결제/취소 확인 | hook의 error 반환 한 줄 및 실패/재시도 표시. 취소·환불 로직 불변 |
| `/my-favorites` · MyFavorites 96 | 카드 골격; 재조회 캐시 유지+상태 | 실패/실제 0건 분리, 재시도·접근성 보완 |
| `/payment/result` · PaymentResult 283 | 서버 결과 검증 중 Bone 결과 자리; 재조회도 완료 UI 숨김 | 기존 검증 조건 불변. URL success를 믿거나 새 PG 쓰기를 실행하지 않음 |
| `/my-page` · MyPage 1,231 | 계정 재확인; 사업자 인증 Bone; 개별 요청 busy | 사업자 조회 실패를 미신청 폼과 분리. 수정/탈퇴 준비 버튼 loading |
| `/messages` · MessagesPage 16 | MessengerContent에 위임 | 최근/손님/사장 대화 목록 및 최초 방 골격 보완, 실패·전송/더보기 보존 |
| `/business` · BusinessPanel 257 | 내부 4탭이 로딩 소유 | 예약 목록 유지. 보조 가게 필터 준비/실패/재시도 추가 |
| `/admin` · AdminPanel 142 | 내부 12탭이 로딩 소유 | 표/통계/메일/문의/결제 상태는 아래 세부 표. 배지 값에 가짜 skeleton 없음 |
| `/login` · Login 280 | 정적 폼; 제출 loading | 인라인/네트워크/정지 계정 오류 보존 |
| `/signup` · Signup 238 | 정적 폼; 발송/검증/가입 loading | 입력·동의·전송 오류 보존 |
| `/forgot-password` · ForgotPassword 301 | 정적 단계 폼; 발송/검증/변경 loading | 필수 검증·재인증 흐름 보존 |
| `/oauth2/callback` · OAuthCallback 69 | 실제 인증 전환 Loading fullPage | 목적 화면 미정인 인증 진행 spinner 보존 |
| `/signup/social` · SocialAgreement 129 | 정적 동의; 제출 loading | 필수 동의 gate 보존 |
| `/terms` · Terms 91 | 정적 본문 | 데이터 골격 불필요. 법적 내용 변경 없음 |
| `/privacy` · Privacy 146 | 정적 본문 | 동일 |

전역 App 인증 초기화 Loading과 PrivateRoute는 보존했다. 비로그인/동의/역할 관문을 골격으로 우회하지 않는다.

## 관리자·사업자 내부 깊이

| 실제 내부 영역 | 기존/보완 로딩 | 실패·0건 / 작업 경계 |
|---|---|---|
| 사업자 인증 pending/all, 회원, 가게, 전체 예약, 광고, 휴지통, 시스템 로그 | 기존 AdminTableSkeleton 유지 | 8개 목록의 실패 Alert·재시도 추가, 정상 빈 목록과 분리 |
| Dashboard | 통계/차트 Bone, 재조회 캐시+busy | 기존 전체·부분 실패 안내 유지 |
| PaymentOperations + AdPaymentOperations | 기존 표 골격, 캐시+busy | 기존 확인/재조회 오류·모달/행 disable 유지 |
| Mailbox | 기존 메일 골격, 새로고침 busy | 실패를 빈 메일함과 분리; 작성/삭제 busy 유지 |
| ChatTab | 방 Bone 및 최초 대화 Bone 추가, 재조회 메시지 유지 | 방/대화 실패 안내; 준비/실패 중 전송 disable |
| ChatReportsPanel | 기존 목록 골격, 검토 모달 busy | 대화 조회에 기존 ModalLoading 연결; 기존 실패 분기 유지 |
| Business 예약 | 기존 예약 행 골격 | 가게 필터의 보조 조회 실패/재시도 보완; 실제 예약 액션 불변 |
| StatisticsTab | 기존 통계/차트 골격, RefreshButton busy | 실패를 매출/리뷰 0으로 표시하지 않음. 캐시는 이전 결과로 안내 |
| AdManageTab | 기존 테이블 골격 | 광고/가게 조회 실패 분리, 취소/삭제 matching-row busy; 기존 과금·상태 로직 불변 |
| QrScannerTab | 기존 400ms 마운트 Bone·카메라 시작 Bone | 권한/카메라 오류·재시도 유지, 실제 카메라 접근하지 않음 |
| 예약 상세/QR 모달 | 기존 ModalLoading | QR 오류와 재시도 있음. 실제 예약/QR 생성 쓰기 미실행 |

카드 크기·색·예약/결제/제재 쓰기·서버 전체 건수·페이지네이션 방식을 이 표의 오류 표시 보완으로 바꾸지 않았다.

## 디자인 시스템의 이번 국소 변경

- 탐색 탭은 헤더와 동일한 `--c-header-bg`, blur(20px)를 사용한다. 라이트 rgba(255,255,255,.9),
  다크 rgba(22,24,28,.85). 불투명 white 면을 제거했고 읽기 가능한 반투명 면은 유지한다.
- 기존 Bone의 props/기본값/style 우선순위를 그대로 독립 경량 모듈로 옮기고 `Skeletons`의 공개 named export를 유지했다.
  새 라우트 골격이 관리자 표/AntD 페이지 번호 의존성을 앱 첫 다운로드로 끌어오던 문제를 차단한다.
  개별 페이지의 정밀 데이터 골격·기존 Core의 색/hover/pressed 규칙은 교체하지 않았다.
- 소식 패턴: 썸네일 72px/PC 88px, 목록 1열/900px 이상 2열, 제목 16px·요약 13px·날짜 12px.
  단순 hover는 중립 opacity, active는 눌림, 키보드 focus-visible은 중립 테두리, reduced-motion은 모션을 제거한다.
- 누락된 상세 사진 fallback은 96px로 제한한다. 가게 원본 사진의 자연 비율과 본문 읽기 공간을 보존한다.
- 동결 ZIP은 변경하지 않았다. 새 프로젝트용 독립 실행 패키지를 만든 것으로 표현하지 않는다.

## 남긴 항목과 다음 배치

| 항목 | 이번 경계 / 다음 할 일 |
|---|---|
| AddressSearch | 검색 실패와 빈 결과가 합쳐져 spinner만 사라지는 기존 경로. 별도 상태/안내 UX 보완 필요 |
| 시간 슬롯 API 실패 | 기존 catch에서 빈 시간대로 보일 수 있음. 날짜/서버 예약 정책을 보존하면서 오류·재시도 모델 분리 필요 |
| MyPage 사업자 수정 프리필 실패 | 기존 빈 폼 진입 동작은 남김. 이번에는 실제 요청 loading만 추가, 다음 데이터 안전 배치에서 진입 차단 검토 |
| 기존 promotion 수정/삭제 | 작성자 ID 외 현재 소유권·계정/가게 상태 재검사 보강 필요. 공개 화면에는 작성/수정/삭제 액션을 추가하지 않음 |
| 실제 소식 작성/운영 검수 | 공개 가능한 기존 내용 검수·작성 UX·정책을 다음 배치에서 연결. 기존 private API/CUD 인증 유지 |
| 실제 쿠폰·인기 검색어·웨이팅·피드 | 독립 데이터/권한/보존 정책부터. 가짜 순위/할인/대기 시간을 만들지 않음 |
| 기타 페이지 디자인 | 대표 내 예약/상세 시안부터 기존 기능 보존하며 한 화면씩 전환. 이번 전수 조회를 전체 시각 개편 완료로 계산하지 않음 |

## 확인의 경계

브라우저 실측·예시/실데이터 구분 및 정확한 검사 결과는 [이번 실측 README](../../../design-system/visuals/2026-09-13-benefits-loading/README.md)에 둔다.
실제 계정 로그인/대화·예약 취소·회원 변경·카메라·PG·운영 DB·알림 발송은 실행하지 않았다.
전체 frontend/backend suite를 실행한 것이 아니며, 새 public 읽기 경계와 변경 상태만 명시적으로 검사했다.
