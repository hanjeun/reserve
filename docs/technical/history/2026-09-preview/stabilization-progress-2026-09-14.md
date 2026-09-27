# 안정화와 다음 디자인 전환 체크포인트

> 2026-09-14 `local-preview-all-changes` 작업 기록. 로컬 구현·명시적 검사·실제 화면 관찰·통합/운영 검증을 구분한다.
> 기존 프리뷰 변경과 108개 디자인 시스템 소스 스냅샷을 보존한다. Git 작업·배포·운영 설정 변경은 실행하지 않는다.
> 혜택 기획전 첫 UI의 당시 구현/실측/공개 API404 경계는 [이전 체크포인트](benefits-campaign-progress-2026-09-14.md)다.
> 최신 작은 혜택/홈 사진 카드/톡 커버·프로필 계약과 공개 API200 재확인은 [최신 후속](messenger-and-discovery-refinement-2026-09-14.md)이다.
> 이 문서의56/70개 검사 수치는 앞선 안정화 배치 기록이며 혜택 배치에 다시 합산하지 않는다.

## 이번 작업

| 대상 | 구현/확인 방향 | 남은 경계 |
|---|---|---|
| 홍보글 수정·삭제 | **로컬 구현·명시적 검사 완료.** 활성 회원 → 기존 작성자 → 현재 가게 상태·소유권을 서비스 관문에서 재검사. 새 소유자에게 원 작성자의 편집 권한을 자동 부여하지 않음 | 관리자 회원 제재의 모든 동시 실행 경합이나 운영 MySQL 증명은 아님 |
| 주소 검색 | **로컬 구현·7개 지정 검사 완료.** 정상 0건과 실패 분리, 현재 검색어 재시도, 입력 직후 이전 응답/선택 무효화 | 실제 주소 공급자 장애·모바일 입력/임시저장/업로드 흐름은 별도 확인 |
| 예약 시간 조회 | **로컬 구현·17개 지정 검사 완료.** 실패 안내·재시도, 현재 가게/날짜 조회와 선택값 연결, 미조회·실패한 값의 폼 제출 차단. 정상 기존 예약의 정원 제외 의미도 보존 | 서버의 최종 예약 가능 조건·가격·결제 정책은 유지. 실제 예약/수정/결제는 실행하지 않음 |
| 사업자 수정 초기값 | **로컬 구현·13개 지정 검사 완료.** 성공한 기존 PENDING 신청 데이터로만 수정 폼을 열고 실패는 안내·재시도. 취소/세션 전환/언마운트 뒤 늦은 응답 무효화. 열린 편집창도 세션이 다르면 숨김 | 실제 수정 저장·등록증 업로드·관리자 승인 경쟁은 별도 확인 |
| 탈퇴 확인창 | 실제 로그인 화면에서 준비 상태 조회와 표시 경로 관찰 | 운영 중 가게 1곳 때문에 준비 단계에서 차단됨. 확인창까지 진입할 수 없어 ‘완전히 안 보임’ 원인은 여전히 미확정 |
| 탈퇴 세션 안전성 | **로컬 구현·27개 지정 검사 완료.** 준비 조회/확인창의 시작 세션을 검증해 이전 계정의 콜백이 현재 계정 삭제로 이어지지 않도록 보강. 삭제 응답의 늦은 후처리도 새 세션에 반영하지 않음 | 실제 삭제/로그아웃 없이 mock으로 검사. 미재현인 표시 문제의 원인 해결과 구분 |

탈퇴 관찰에서 확인한 차단 안내는 가게 1곳, 예약·환불·결제 확인·웹훅 각 0건이었다.
최종 탈퇴 확인/삭제는 누르지 않았고 관찰 후 원래 혜택 화면으로 복귀했다.
[앞선 공통 레이아웃 보정](layout-regressions-2026-09-14.md)은 표본 확인이며 이번 실제 계정의 확인창 재현 증거가 아니다.

## 실행 검사

이번 실행의 지정 검사만 계산한다. 개별 실행과 최종 묶음의 같은 검사를 중복 합산하지 않는다.

### 백엔드: 지정 Mockito 회귀 56개 통과

변경 소스는 `PromotionService.java`, 신규 검사는 `PromotionMutationSafetyTest.java`다.
수정 전 former-owner의 UPDATE/DELETE 2사례가 예외를 발생시키지 않아 실패했고 수정 후 통과했다.
현재 가게를 요청 storeId가 아닌 원 연결 가게로 검사하며 원 작성자·현재 소유자 조건을 모두 유지한다.

```powershell
# backend; 실제 JDK 21.0.8 / Gradle Wrapper 9.6.1
.\gradlew.bat test --tests kr.it.reserve.promotion.PromotionMutationSafetyTest --tests kr.it.reserve.promotion.PublicPromotionServiceTest --tests kr.it.reserve.member.MemberWithdrawalSafetyTest --tests kr.it.reserve.store.StoreDeletionSafetyTest --offline --no-daemon --console=plain
```

이번 실행은 exit 0이며 생성된 JUnit XML도 재확인했다: 신규 mutation 47개·public 읽기 4개·탈퇴 1개·폐업 4개,
failure/error/skipped 모두 0이다. DB 행 잠금을 모킹한 검사이므로 실제 MySQL 경합이나 영속성 컨텍스트의 모든 경쟁을 증명하지 않는다.
AdminSanctionService 회원 제재가 같은 비관적 읽기 잠금을 쓰지 않는 기존 경계는 이번에 변경하지 않았다.

전체 프론트/백엔드 스위트·전체 URL의 로그인 E2E·실제 두 계정 대화·운영 DB/OAuth/PortOne 확인은 이번 기록에 포함하지 않는다.

### 프론트: 최종 지정 묶음 70개 통과

| 지정 파일 | 검사 수 | 범위 |
|---|---:|---|
| `AddressSearch.test.jsx` | 7 | 정상 0건/실패/재시도, 입력 즉시 이전 응답 무효화, 선택 데이터 보존 |
| `TimeSlotPicker.test.jsx` | 17 | 실제 AntD Form 검증/제출, DAY 입력과 조회 상태 동기화, 기존 예약 정원 경계 |
| `MyPage.businessPrefill.test.jsx` | 13 | 초기값 실패/재시도/취소, 늦은 응답과 열린 편집창의 세션 격리 |
| `MyPage.withdrawalReadiness.test.jsx` | 27 | 준비 실패/차단/불완전 응답, 확인 전 삭제 없음, 중복/취소, 세션 전환/언마운트/늦은 mock 삭제 응답 |
| `useMessage.test.jsx` | 5 | 공통 확인창 계약과 실제 AntD 확인창 구조/취소. 계정 삭제 요청은 없음 |
| `BookingCalendar.test.jsx` | 1 | 선택 가능한 날짜 조회 대기 중 달력 선택 차단 |

```powershell
# frontend; 기존 bundled Node 24.19.0
$taskNode = 'C:\Users\USER\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $taskNode node_modules/vitest/vitest.mjs run src/components/store/StoreForm/AddressSearch.test.jsx src/pages/store/TimeSlotPicker.test.jsx src/pages/member/MyPage.businessPrefill.test.jsx src/pages/member/MyPage.withdrawalReadiness.test.jsx src/hooks/__tests__/useMessage.test.jsx src/components/store/BookingCalendar.test.jsx --configLoader=native --maxWorkers=1 --no-file-parallelism
```

최종 실행은 **6파일·70개 통과, exit 0, 99.13초**다. 원래 Vite 설정과 단일 worker/직렬 실행을 사용했고 환경/의존성/설정 파일은 바꾸지 않았다.
jsdom의 pseudo-element `getComputedStyle` 미구현 안내 2건은 있었지만 테스트 실패는 없었다.
개별 주소/시간 24개·사업자 13개·탈퇴 세션 27개와 앞선 시간 10개 중간 실행을 이 최종 숫자에 다시 더하지 않는다.

첫 Node 22 실행은 초기화 대기 중 안전 종료했고 테스트 결과가 없었다. MyPage 첫 결과의 실패는 아이콘 포함 탭 접근성 이름 선택자 오류로 보정했다.
실제 기능 통과 기록과 환경/테스트 보정 기록을 구분한다.

검토 중 발견한 회귀와 보존 계약:

1. DAY 자동 시간 입력과 조회 성공 effect가 같은 배치일 때 validator가 이전 loading 상태를 읽어 오류가 남았다. 조회 전이 때 화면 상태와 부모 검증 ref를 같은 관문에서 갱신해 보정하고 실제 AntD Form 회귀를 추가했다.
2. 공개 `getAvailability`는 자기 예약도 정원 합계에 포함하지만 `updateReservation`은 자기 예약 ID를 제외한다. 정원 flag=false라는 이유만으로 정상 기존 편집값을 지우지 않는다. 이미 검증된 현재 가게/원 날짜·시간이고 성공 응답에 실제 시간이 존재할 때만 기존값을 유지하며, 빠진 시간·다른 날짜·미조회/실패는 계속 차단한다. 서버의 저장 시 최종 정원/중복 검증은 그대로 둔다.
3. 탈퇴 준비 응답과 최종 확인 콜백은 시작 세션/회원/역할/화면을 재검사한다. 이전 로그인에서 연 확인창으로 새 계정을 삭제하지 않게 하고 늦은 삭제 응답이 새 세션을 로그아웃시키거나 이동/메시지를 실행하지 못하게 했다. 이 보호는 실제 확인창이 안 보이는 증상의 재현/해결 증거가 아니다.

### 빌드와 변경 범위 검사

- 변경 프론트 소스 3개와 신규 회귀 4개, 총 **7개 명시 경로 ESLint 통과·경고 0**.
- `vite build --configLoader native` **exit 0, 45.96초**. 직접 Vite 빌드이며 npm prebuild의 sitemap 생성이나 운영 배포는 실행하지 않았다.
- 새 빌드의 `scripts/check-bundle-budget.mjs` **통과**: 초기 321.1 KiB gzip, 최대 JS 청크 563.9 KiB. 기존 예산을 변경하지 않았다.
- 수정 소스/문서의 지정 `git diff --check` **통과**. 문서 9개·신규 검사 5개의 trailing whitespace와 문서의 상대 파일 링크 **52개 대상 존재 확인도 통과**했다. 링크 검사는 파일 대상 검사이며 모든 URL/Markdown fragment 검사는 아니다.

## 최신 dev와 공개 저장소 상태

2026-09-14 읽기 전용 GitHub 조회에서 `dev`는 보호됨이며 SHA는
`160ec0e1432e9aa429416114af95d218c6f5b6b7`이었다. 열린 PR은 #110·#162·#164·#165·#168·#184의
의존성 PR 6개이며 모두 `dev` 대상이다. 체크 통과/머지 준비 여부는 이번 조회 범위가 아니다.
같은 날 merged PR 조회에서 #193~#198은 이미 dev에 머지됐음을 재확인했다.
[결제 광고 원장 #193](https://github.com/hanjeun/reserve/pull/193), [세션 격리 #194](https://github.com/hanjeun/reserve/pull/194),
[서버 조회 #195](https://github.com/hanjeun/reserve/pull/195), [탐색/SEO #196](https://github.com/hanjeun/reserve/pull/196),
[품질 정책 #197](https://github.com/hanjeun/reserve/pull/197), [채팅 닫기 #198](https://github.com/hanjeun/reserve/pull/198)을 전부 미완료로 다시 분리하지 않는다.

프리뷰의 `origin/dev`는 로컬 캐시이므로 그 ahead/behind 숫자를 위 원격 SHA와의 최신 차이로 사용하지 않는다.
최신 dev 통합은 아직 실행하지 않았다. 기존 겹치는 파일과 사용자 변경을 보존한 통합/분리는 현재 대화의 명시적 Git 승인 뒤 수행한다.
[9월 3일 분리 계획](preview-release-plan-2026-09-03.md)의 브랜치 이름·보호 상태·미완료 표를 그대로 재실행하지 않는다.

## 다음 구현 순서

1. 이번 안정화의 명시적 회귀 확인과 실제 계정에서 미재현인 탈퇴창의 경계를 정리한다.
2. 별도 승인 후 최신 dev 통합·위험도별 재검증. 승인 전에는 프리뷰의 독립적인 디자인 작업을 이어갈 수 있다.
3. **혜택 기획전 v2:** 기획전 배너 → 실제 주요 혜택/소식 → 혜택 종류·지역/서비스 필터 → 가게 목록.
   현재 소식 행 목록 v1은 이 목표의 완료안이 아니다. 현재 데이터로 가능한 것과 새 필드가 필요한 것을 먼저 나눈다.
4. 가게 상세·내 예약의 대표 패턴 → 관심 가게/계정/인증/등록·수정 → 사업자/관리자 작업 화면을 한 화면씩 전환한다.
5. 혜택 다음 웨이팅 → 피드. 대기 접수·호출·취소와 게시·노출·신고 정책을 먼저 정의한다.
6. 인기 검색어·실제 쿠폰·관심지역·채널형 광고·외부 알림·비공개 첨부·실제 AI 초안·새 DB/앱 도메인 분리는 독립 후속 계획이다.

혜택 종류·기간·조건·정규화된 지역은 현재 홍보글 DTO에 없다. 업종 category를 혜택 종류로 바꾸거나
작성일을 유효기간으로 표현하지 않는다. 임의 할인·기간·‘인기’ 순위도 생성하지 않는다.
[최신 혜택 구조와 페이지별 보존 계약](design-evolution-plan-2026-09-13.md)을 따른다.

혜택 첫 배치의 실제 데이터/API 경계:

- 공개 목록은 page/size만 받고 소식/가게명·자유 업종·주소·대표 사진·작성 시각을 반환한다. 원 홍보글 category와 가게 domain도 공개 DTO의 필터 계약이 아니다.
- 기존 가게 API의 서비스 domain·정렬·페이지·거리 입력은 사용할 수 있지만 ‘혜택 있는 가게’ 조건/지역 코드는 없다. 일반 가게 목록을 혜택 적용 가게 수로 표현하지 않는다.
- 새 계약 없이 시작하는 시안은 브랜드 기획전·실제 최근 소식·서비스별 **일반 가게 탐색**이다. 혜택 종류·지역/기간 필터와 캠페인 선정은 별도 서버 계약/데이터 보정 후 연결한다. 없는 필터를 작동하는 것처럼 표시하지 않는다.

기존 소스 ZIP의 SHA-256을 보존한 `archive.sha256`와 읽기 전용 대조했다:
`02d5809dabf319ed1778140210e4303862b5f5a37b0b5ef6dd5d880514af536e`로 일치한다.
이번에는 ZIP/보존 source를 덮어쓰거나 신규 starter 패키지를 만들지 않았다.

## 병행하는 운영 관문

- 첫 스키마 변경 운영 배포 전 백업·격리 복원 증거 확보. 로컬 디자인 개발을 막는 조건은 아니다.
- 운영 MySQL 제약·경합, OAuth 해제와 암호화키/기존 outbox 복호화, 결제 응답 유실/환불, 파일 삭제 재시도를 별도로 확인한다.
- 채팅 보존/신고 hold·가게 소유권 변경 정책을 확정하기 전 임의 파기나 그룹 채팅을 추가하지 않는다.
- 서버 목록 전체 후보 로딩·채팅 증분 조회 상한·광고 집계 경합/유실을 측정하고 정책을 정한다. 새 DB 도입만으로 해결됐다고 보지 않는다.
- CSP 수집 신뢰성 회복 후 최소 7일 관측으로 enforcement 여부를 판단한다.

큰 단계: [로드맵](roadmap-progress-2026-09-13.md). 과거 검사 수치는 날짜별 [품질 기록](../../quality-roadmap.md)에 보존한다.
