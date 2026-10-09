# 디자인 시스템

Ant Design 위에 얹은 RESERVE의 디자인 토큰, 공통 컴포넌트, 화면 패턴이에요.

## 디자인 토큰 (`frontend/src/styles/tokens/`)

### Colors

```js
import { colors } from '../styles/tokens';

colors.primary.main      // #3182f6  — 브랜드 블루
colors.primary.light     // #e8f3ff  — 연한 배경
colors.primary.dark      // #2272eb  — 호버
colors.gray[50]          // #f9fafb  — Input 배경
colors.gray[100]         // #f2f4f6  — 비활성 배경
colors.text.primary      // #1a1f27
colors.text.secondary    // #4e5968
colors.text.tertiary     // #8b95a1
colors.border.light      // #f2f4f6
colors.border.default    // #e5e8eb
colors.success.main      // #00c73c
colors.error.main        // #f04452
colors.warning.main      // #ffb800
```

- `colors.*`의 실제 값은 `var(--c-..., fallback)` 문자열이에요.
- 포인트 색의 정본은 `hooks/useTheme.js`의 `ACCENT_OPTIONS`이고, `theme.css`의 기본 블루는 첫 페인트용 fallback이에요.
- 포인트 색을 바꾸면 `applyAccent`가 CSS 변수와 AntD `colorPrimary`를 함께 갱신해요.

### Typography

```js
import { fontWeight, fontSize } from '../styles/tokens';

fontWeight.regular   // 400
fontWeight.medium    // 500
fontWeight.semibold  // 600
fontWeight.bold      // 700
fontWeight.extrabold // 800

fontSize.xs     // 12px
fontSize.sm     // 13px
fontSize.md     // 14px
fontSize.base   // 15px
fontSize.lg     // 16px
fontSize.xl     // 17px
fontSize['2xl'] // 18px
fontSize['3xl'] // 22px
fontSize['4xl'] // 24px
fontSize['5xl'] // 28px
```

페이지의 제목·부제는 `PageTitle`·`PageDescription`을 함께 사용해요. 실제 화면과 로딩 화면이 같은 규칙을 써요.

```jsx
import { PageTitle, PageDescription } from '../components/common';

<PageTitle>내 예약 확인</PageTitle>
<PageDescription>예약과 웨이팅 현황을 확인해요</PageDescription>
```

- 제목은 PC 32px·모바일(767px 이하) 26px, 굵기 700, 자간 `-0.02em`, 줄 높이 1.4예요.
- 부제는 16px·400 굵기·줄 높이 1.65, `gray[600]`(라이트 `#6b7684`, 다크 `#a3aab4`)을 사용해요.
- 글꼴은 마이페이지에서 선택한 `--app-font`와 AntD 테마를 따라요. 기본은 Pretendard Variable이에요.
- 치수와 색은 `index.css`가 불러오는 `components-and-forms.css`에서 정해요. 호출부는 여백·정렬만 조절하고 글자 크기·굵기·자간·색을 덮지 않아요.
- 섹션·카드 제목, 법적 문서의 시행일처럼 작은 메타 정보는 각각의 기존 크기를 사용해요.

### Spacing / Radius / Heights

```js
import { radius, heights, maxWidth, shadows } from '../styles/tokens';

radius.sm     // 4px
radius.md     // 10px
radius.lg     // 14px   — Input
radius.xl     // 16px   — Button
radius['2xl'] // 20px
radius['3xl'] // 24px   — 히어로·지도·큰 패널 전용 (아래 규칙 참고)
radius.full   // 50%
radius.pill   // 100px

heights.input      // 54px
heights.buttonLg   // 56px
heights.buttonHero // 64px
heights.buttonSm   // 36px
heights.buttonMd   // 44px
heights.header     // 64px

maxWidth.sm  // 420px  — 로그인, 회원가입
maxWidth.md  // 700px  — 상세 페이지
maxWidth.lg  // 1000px — 관리 페이지
maxWidth.xl  // 1200px — 목록 페이지

shadows.card      // 0 2px 12px rgba(0,0,0,0.04)
shadows.cardHover // 0 4px 20px rgba(0,0,0,0.08)
```

### 반경 스케일

반경은 요소 크기로 골라요.

| 값 | 대상 |
|---|---|
| `radius.sm` (4px) | 태그·아주 작은 칩 (높이 ~24px 이하) |
| `radius.md` (10px) | 작은 버튼·인풋 내부 요소·썸네일 (높이 ~40px) |
| `radius.lg` (14px) | 입력 필드 |
| `radius.xl` (16px) | Button |
| `radius['2xl']` (20px) | 모달·시트·중간 패널 |
| `radius['3xl']` (24px) | 히어로 섹션·지도·전폭 패널 |
| `radius.full` (50%) | 아바타·원형 아이콘 버튼 |
| `radius.pill` (100px) | 세그먼트·필터 알약 |

- 숫자 대신 토큰을 써요(`borderRadius: 16` → `radius.xl`).
- 인접한 요소는 같은 단계이거나 한 단계 차이이고, 안쪽이 바깥쪽보다 더 둥글지 않아요.
- `components/common/Card.jsx`의 목록 카드와 `Card.Add`는 `borderRadius: 0`인 각진 카드예요.

## 공통 컴포넌트 (`frontend/src/components/common/`)

### Button

```jsx
import { Button } from '../components/common';

<Button variant="primary">로그인</Button>
<Button variant="secondary">취소</Button>
<Button variant="hero">시작하기</Button>
<Button variant="ghost">← 뒤로가기</Button>
<Button variant="danger">삭제</Button>
<Button variant="link">회원가입</Button>
<Button variant="ghost-sm-primary">결제하기</Button>
<Button variant="ghost-sm-danger">취소</Button>
<Button variant="ghost-sm-success">리뷰 보기</Button>
```

- 키보드 포커스는 `.reserve-btn:focus-visible` 공통 링(`--reserve-focus-ring`, `gray-500` 1px)이에요. 호출부에서 덮지 않아요.
- 로딩 중에는 `disabled`와 `aria-busy`가 함께 적용돼요.
- `size="sm"`(36px) 좌우 여백은 채움·테두리 버튼 모두 20px이에요. 너비는 문구 길이에 맞추고 인접한 버튼과 같게 늘리지 않아요.
- 패널 안의 저장·취소 한 쌍은 `outline sm` + `primary sm`, 8px 간격, 오른쪽 정렬이에요. 44px(`md`)·56px(`lg`)는 페이지 단위 폼의 주 행동에 써요.
- 대기 접수·호출·재호출·입장 같은 패널 실행은 `primary sm`(36px), 접수 취소처럼 기록을 되돌릴 수 없게 바꾸는 행동은 `danger sm`이에요. 폼을 닫기만 하는 취소와 구분해요. 대기 접수 문구 앞에 `+`를 붙이지 않고, 페이지 CSS로 버튼의 높이·여백·모서리를 덮지 않아요.
- 예약 카드 하단의 분할 액션 줄은 공통 `Card.actions`의 `ghost-sm-*` 버튼을 유지해요. 예약 취소는 `ghost-sm-danger`로 표시하고 회색으로 덮지 않아요.

### CopyableText

```jsx
import CopyableText from '../components/common/CopyableText';

<CopyableText value={merchantUid} label="주문번호" />
```

- 주문번호·예약번호·이메일처럼 복사할 값은 이 컴포넌트로 표시해요. `Typography`의 `copyable`이나 화면별 복사 버튼은 쓰지 않아요.
- 값이 없으면 복사 버튼을 그리지 않아요.
- 직접 import해요.

### Form 컴포넌트

```jsx
import { FormInput, FormTextArea, FormSelect, FormDatePicker, FormTimePicker } from '../components/common';

<FormInput placeholder="이메일" />
<FormInput type="password" />
<FormInput.WithButton buttonText="인증코드 전송" onButtonClick={fn} />
<FormTextArea rows={4} maxLength={1000} showCount />
<FormSelect options={STORE_CATEGORIES} />
<FormDatePicker />
<FormDatePicker multiple />         // 임시 휴무일 여러 날짜
<FormDatePicker.RangePicker />      // 운영 기간
<FormTimePicker />
<FormTimePicker.RangePicker />   // 영업시간 설정용
```

- 모든 입력 필드는 `variant="filled"`, `border: none`, `colors.gray[50]` 배경, `radius.lg`, `heights.input`, 16px 글꼴이에요. `.reserve-form-field` 클래스가 전역으로 강제해요.
- 포커스는 `components-and-forms.css`의 규칙 한 곳에서 1px 중간 회색(`gray-500`) 안쪽 테두리로 보여요. 오류 상태의 빨간 링은 덮지 않아요.

시간 범위 모달의 시작·종료 숫자는 직접 입력할 수 있다. `10:52` 또는 `1052` 같은 24시간 입력이
완성되면 오전·오후·시·분 휠도 같은 값으로 정렬한다. 이후 입력·선택 값이 바뀌면 기존 시간 휠의 0.2초 전환을 사용하며, 동작 줄이기 설정에서는 즉시 정렬한다.
잘못된 시간은 확정을 막고, 취소는 원래 값을 유지한다.
모바일 숫자 입력창은 16px를 유지해 입력할 때 화면이 확대되지 않게 한다.

입력창 옆 실행 버튼은 두 패턴이에요.

| 용도 | 패턴 |
|---|---|
| 문구가 필요한 폼 실행 (인증코드 발송 등) | `FormInput.WithButton` — 필드 높이 전체에 붙은 버튼 |
| 아이콘만 필요한 실행 (메시지 전송) | 채팅 입력 안쪽 44×44px·10px 모서리 버튼, `.reserve-chat-send` |

#### StoreForm 모바일 밀도

- 768px 미만에서 44px 액션 높이·10px 모서리, 필드 간격 12px·라벨 아래 8px, 라벨 최소 22px을 써요.
- 짧은 정책 필드만 두 칸으로 묶어요.
- 768–899px은 한 열, 900px 이상은 두 열이고, 900–1023px에서는 시간 범위 행만 세로예요.

#### 날짜 선택

날짜 필드는 AntD 값 계약(dayjs, `value/onChange`, `disabledDate`)을 유지하고, 달력 표면은 `FormDatePicker`가 그려요. 운영 기간·임시 휴무일·광고 기간·관리자 채팅 보존 기준일이 이 컴포넌트를 써요. 고객 예약 날짜는 별도 `BookingCalendar`를 사용해요.

- 달력에서 한 날짜를 누르면 즉시 닫고, 직접 입력·여러 날짜·기간은 하단 선택 완료 버튼으로 확정해요. 취소하면 원래 값을 유지해요.
- 기간 선택은 시작/종료 칸과 범위 강조를 보여 주고, `allowEmpty`를 지원해요.
- 모달의 날짜 칸에 `2026-10-08`, `2026.10.08`, `2026/10/08`, `20261008`을 입력할 수 있어요. 유효한 날짜가 완성되면 해당 월로 이동하고 기존 회색 선택 면·기간 강조를 갱신해요. 단일 날짜·기간에서는 Enter로도 확정할 수 있어요. 여러 날짜에도 별도 날짜 추가 버튼을 두지 않아요. 입력 중인 날짜는 바로 강조하고, Enter를 누르면 현재 날짜를 목록에 유지한 채 다음 날짜를 입력할 수 있어요. 선택 완료를 누르면 남아 있는 유효한 입력도 함께 반영해요.
- 미완성·존재하지 않는 날짜, 선택 제한에 걸리는 날짜, 시작일보다 이른 종료일은 확정하지 않아요. 입력한 내용을 임의로 잘라내거나 날짜 순서를 뒤집지 않으며, 입력만으로 폼 값이나 서버 값을 저장하지 않아요.
- 편집 중인 칸은 1px `gray-400` 테두리, 선택 날짜는 `gray-200` 면 + 진한 글자, 기간 사이는 `gray-100`이에요. primary는 쓰지 않아요.
- 오늘은 작은 중립 점으로 표시해요.
- 월·연도 이동, 일요일 색, 비활성 날짜, 모바일 좌우 swipe를 제공해요.

확정된 단일 날짜·시간과 기간·시간 범위의 양끝, 회차 시각, 예약 인원, 일반 선택값은 `RollingFieldValue`로 표시한다. 날짜가 미래로 또는
인원이 증가하면 위로, 이전 날짜로 또는 인원이 감소하면 아래로 200ms 동안 이동하며 살짝 회전한다.
날짜는 모달이 닫힌 뒤 전환하고, 모션 중 연속 선택은 같은 사이클 안에서 최신 값을 표시한다. 직접 입력은 전환을 중단한다.
현재 값은 접근성 이름에 즉시 반영하고, `prefers-reduced-motion`에서는 전환 없이 표시한다.
예약 인원·날짜의 기존 모션을 공통으로 사용한다. 이전 값이 있으면 이동 폭은 70%, 회전은 25°이며, 첫 값은 20% 이동과 투명도 전환만 사용한다. 날짜·시간 모달 안의 직접 입력·휠 초안에는 이 값 교체 모션을 붙이지 않는다.
이전 값은 절대 위치의 장식 레이어로 두어 부모 크기 계산에서 제외한다. 현재 값만 레이아웃을 결정하고, `contain: layout paint`로 날짜·인원 칸 안에서 전환한다. 값 교체를 위해 페이지나 예약 폼에 새 `key`를 주지 않는다.

### FormModal

모바일 상세·작성 표면은 `ResponsiveModal`을 사용해요. `mobileSize="content"`는 내용 높이,
`tall`은 서류·신고 대화처럼 긴 상세, `form`은 거의 전체 높이의 작성 시트예요.
PC의 기존 너비·중앙 모달은 유지하고, 모바일 본문만 스크롤하며 제목과 하단 버튼은 고정해요.
작성 중 키보드 높이·위치는 visualViewport를 CSS 변수로 반영해 입력값을 다시 렌더하지 않아요.
`FormModal`은 `form`이 기본이며, 최종 처리 확인은 `mobileSheet={false}`로 중앙창을 유지해요.
초기 초점은 제목으로 옮기고, Tab 이동·Escape·닫힌 뒤 호출 버튼 복원과 키보드 링은 유지해요.
지역·QR 시트는 기존 높이와 모션을 유지하면서 같은 초기 초점 처리를 사용해요.

```jsx
import { FormModal, FormField } from '../components/common';

<FormModal title="문의하기" open={open} onClose={onClose} onSubmit={handleSubmit} submitting={sending}>
    <FormField label="제목"><FormInput ... /></FormField>
    <FormField label="내용"><FormTextArea ... /></FormField>
</FormModal>
```

"작성해서 제출" 모달의 공용 뼈대예요. 기본 너비 520px·타이틀·취소/제출 버튼·필드 간격을 관리해요.

- 다단계 폼은 `Modal`에 `key`를 주지 않고, `scrollResetKey`에 현재 단계를 넘겨요.
- AntD popup 레이어는 `spacing.js`의 `zIndex.modal`(1100)이고, `App.jsx`의 `zIndexPopupBase`에서 적용해요.
- 확인 모달은 `useMessage.confirm`(`reserve-confirm-root`)을 써요. 좌우 16px·safe-area·`100svh` 안에 들어가고, 긴 본문만 스크롤하며 버튼은 문구에 따른 너비·최소 36px 높이를 사용해요.

모달의 취소·확인 버튼은 `ModalActions`를 사용한다. 테두리 있는 취소와 채운 확인 버튼을
기본 높이 36px·좌우 여백 20px·모서리 반경 16px를 공유한다. 너비는 각 버튼의 문구 길이로 정하며
고정 너비나 같은 너비의 열을 쓰지 않는다. `다음`이 `선택 완료`로 바뀌면 확인만 길어지고 취소는
자기 문구에 맞는 너비를 유지한다. `modal-layout.css`에서 강제하며, 화면 폭보다 긴 문구는 줄바꿈한다.
서로 다른 두 결정(인증 거절·승인)은 `ModalActionGroup`에서 기존 의미 색을 유지한다.
날짜·시간의 전체 해제는 별도 텍스트 동작으로 두고, 좁은 화면에서는 버튼 묶음을 다음 줄로 옮긴다.
QR 스캐너 시트의 큰 터치 버튼은 같은 높이와 동일한 두 열을 사용한다.
모달 밖의 편집 폼도 취소는 `outline`, 저장은 `primary`를 같은 높이로 사용한다.

배경 스크롤은 `App`의 `useModalScrollLock`에서 모든 열린 모달과 사진 프리뷰에 공통 적용한다.
마지막 모달이 닫히면 기존 페이지 위치와 body 위치 속성을 복원한다. 모달 본문·휠·포털로 열린
선택 목록의 내부 스크롤은 허용하고, 경계에서 배경으로 넘어가는 터치를 막는다.
달력 가로 스와이프·사진 확대/이동·핀치는 유지한다. 사진이 아닌 메신저 패널은 비모달이므로 잠그지 않는다.


### PageContainer

```jsx
import { PageContainer } from '../components/common';

<PageContainer size="sm" />   // 420px — 폼 페이지
<PageContainer size="md" />   // 700px — 상세 페이지
<PageContainer size="lg" />   // 1000px — 관리 페이지
<PageContainer size="xl" />   // 1200px — 목록 페이지
```

`boxSizing: 'border-box'`로 좌우 패딩을 최대 너비 안에 포함해요.

### Card

```jsx
import { Card } from '../components/common';
import { Link } from 'react-router-dom';

<Card hoverable>
    <Link to="/store/1" className="reserve-card-link">
        <Card.Cover src={imageUrl} alt="가게 이름" />
        내용
    </Link>
</Card>
<Card.Add onClick={fn}>새 가게 등록</Card.Add>
```

- 페이지 이동은 카드 `onClick`이 아니라 `Link`로 해요.
- 가게 상세 링크를 누르면 사진·본문·테두리를 포함한 카드 전체가 0.98배·불투명도 0.88로 반응해요. `.reserve-card:has(.reserve-store-card-hit:active)`에서 강제하며, 즐겨찾기·관리 버튼은 카드 이동 링크와 별도로 반응해요. 모션 줄이기 설정에서는 축소를 끄고 색 변화만 유지해요.
- `Card onClick`은 이동이 아닌 동작용이에요. `role="button"`, `tabIndex`, Enter/Space를 제공하고, 안에 다른 버튼·링크를 넣지 않아요. `Card.Add`는 `<button>`이에요.
- 계정 메뉴·프로필 이미지 선택·모달/채팅 닫기 같은 컨트롤도 `<button>`이고, `:focus-visible` 링을 유지해요.
- `ReservationRow`는 상세 열기를 썸네일·가게명 버튼으로 제공해요.
- `AdBanner`는 캐러셀 점 버튼을 담고 있어서 `div role="button"` + Enter/Space + 포커스 링을 써요.
- 가게 목록·예약 관리·내 예약·관리자 예약의 사진은 같은 `Card.Cover`를 써요. 기본 높이는 `auto`라 원본 비율을 보존하고, 고정 높이·`object-fit: cover`로 잘라서 사진 높이를 맞추지 않아요.
- 사진이 있는 목록 그리드는 가게 목록과 같은 4/3/2/1열·24px 간격·`align-items: start`를 써요. 카드 높이는 사진 비율과 본문 길이에 따라 달라져요. 사진이 없는 웨이팅 카드도 공통 `Card`를 쓰고 최소 높이·고정 높이로 이웃 카드와 늘려 맞추지 않아요.

### 웨이팅 목록 도구

- 첫 행 맨 왼쪽에 가게 목록의 `StoreListViewToggle` 아이콘을 두고, 오른쪽에 `FilterMenu` 가게 선택·접수 상태 필터를 두어요. PC·모바일 모두 같은 순서이고, 보기 전환은 별도 텍스트 세그먼트로 만들지 않아요.
- 기본 상태는 진행 중(대기·호출)이에요. 전체·대기·호출·입장 완료·취소 필터는 URL `waitingStatus`에 저장하고, 완료·취소도 같은 목록에서 확인해요. 별도 완료 목록을 아래에 덧붙이지 않아요.
- 그 아래 행은 공통 `FilterToolbar`의 `search`와 `onReload`를 써요. 검색은 왼쪽, `RefreshButton`은 오른쪽 끝이고, 검색어는 URL의 `waitingSearch`에 저장해요. 필터 행에 새로고침을 붙이지 않아요.
- 대기 명단 요약 옆 접수와 각 카드의 호출·입장·취소는 위의 패널 `sm` 버튼 규칙을 따라요.
- `접수 중지`는 새 직원·고객 접수만 막아요. 기존 명단과 선택한 현장 QR·원격 방식은 유지하며 호출·입장·취소는 계속 처리해요. `접수 시작`은 가게 소유자이고 운영 중인 가게에서만 가능해요.

내 예약의 웨이팅은 `ReservationListingToolbar`를 재사용해 보기 아이콘 바로 옆에 건수, 오른쪽에 상태·정렬을 두어요. 상태는 전체·대기 중·호출됨·입장 완료·취소됨이고, 정렬은 기존 최신 예약순·오래된 예약순을 사용해요. 예정 방문일이 없는 웨이팅에는 방문일 정렬을 넣지 않아요. 아래 `FilterToolbar`는 가게명·대기번호 검색을 왼쪽, 새로고침을 오른쪽에 두어요. 첫 로딩의 보기·건수·상태·정렬·검색·새로고침도 같은 공통 골격을 써요.

개인 목록의 상태·정렬·검색·페이지는 `waitingStatus`·`waitingSort`·`waitingKeyword`·`waitingPage`로 예약 필터와 분리해요. 서버가 본인·기존 표시 기간 안에서 필터를 적용한 뒤 페이지와 전체 건수를 계산해요. 검색·필터·자동 갱신 중에는 같은 계정·세션의 기존 화면과 입력을 유지하고 수동 새로고침만 기존 요청 중 회전 표시를 사용해요. 계정·세션이 바뀌면 이전 목록을 빌리지 않아요.

### 질문형 가게 등록·수정

- 새 등록은 `업종 → 예약·웨이팅 선택 → 선택한 방식의 설정 → 운영 시간·정원 → 가게 소개·사진 → 상세 미리보기`로 진행해요. 사용하지 않는 예약·웨이팅 질문은 건너뛰고, 선택을 바꿔도 초안의 값은 유지해요. 기존 가게 수정은 `수정할 항목 선택 → 해당 질문 → 상세 미리보기 → 수정 완료`로 같은 질문을 재사용해요. 항목 선택은 PC 3열·모바일 2열이고 로딩 골격도 같아요. 인증된 수정 조회·소유자/관리자 검증·기존 저장 API를 유지해요.
- 각 단계 상단에는 현재 질문 제목만 보여줘요. 회색 `가게 등록` 부제는 실제 질문·최종 미리보기와 로딩 스켈레톤 모두에 넣지 않아요. 입력칸의 설명과 운영·개인정보 안내는 유지해요.
- PC 질문은 최대 640px 폭으로 가운데에 두고, 마지막 상세 미리보기만 최대 1100px로 넓혀요. 설정 항목은 상세 미리보기의 정보 영역 안에 표시하고 `등록할 내용` 제목은 두지 않아요. 정보 영역의 폭을 따라 항목과 수정 버튼 사이가 지나치게 벌어지지 않게 해요. 모바일 등록의 세로 배치와 3열 선택지는 유지해요.
- 상위 폼은 단계·접수 방식·방문 이력·미리보기 기기만 구독해요. 업종·예약 방식·운영 조건·주소 메타데이터는 각 질문이 필요한 값만 구독해 문자 입력마다 숨겨진 모든 질문과 사진을 다시 계산하지 않아요. 등록·수정의 임시저장 상태가 이미 `idle` 또는 `pending`이면 타이핑마다 같은 상태 객체를 새로 만들지 않아요. 입력 자체를 지연하거나 임시저장·검증을 끄지 않아요.
- 단계별로 현재 질문만 검증해요. 최종 제출에서는 필요한 모든 칸을 검증하고 첫 오류가 있는 단계로 돌아가요. `다음`·`미리보기`·`등록 완료`·`수정 완료`는 항상 일반 버튼이며 마지막 완료 버튼의 명시적 클릭 경로에서만 전체 검증 후 저장 API를 실행해요. 미리보기 진입·기기 전환·폼의 암묵적 제출은 저장을 실행하지 않아요. 임시저장은 기존 계정·브라우저 범위를 따라요. 수정에서는 기존의 선택적 대표 사진·예약금/환불/예약 마감 검증과 이미지 순서를 유지하고 꺼진 예약·웨이팅의 저장값도 편집할 수 있어요.
- 기본 버튼·입력 크기와 색은 기존 Core 컴포넌트를 사용해요. 업종·손님 접수·예약 방식·웨이팅 접수는 `IconChoicePicker`의 56px 아이콘·짧은 라벨로 선택해요. 업종의 `ServiceDomainPicker`도 같은 컴포넌트를 사용해요. PC 업종은 6열, 나머지는 3열이고 모바일은 모두 3열이에요. 큰 선택 카드나 단계 숫자를 붙이지 않아요. 전체 이름·설명은 공통 Tooltip으로 hover·포커스에서 보여주고, 접수·예약 방식은 선택한 설명도 아래에 표시해요. 터치의 초기 포커스에는 외곽선을 붙이지 않고 키보드에는 아이콘 주위 공통 링을 유지해요.
- 모든 선택은 `aria-pressed`로 표시하고 같은 hover·누름 모션을 사용해요. 업종 아이콘을 누르면 직접 입력한 업종도 해당 기본 이름으로 바꾸며 `replacementKey`를 올려 `RollingFieldValue`의 기존 200ms 모션을 실행해요. 키보드 입력은 값을 그대로 갱신하고 모션을 실행하지 않아요. 직접 업종을 편집하면 아이콘의 선택 표시는 해제해요. 가게 분류에 필요한 서비스 분야 값은 유지해요. 날짜·숫자·선택칸의 기존 값 교체 모션은 계속 사용하고 동작 줄이기 설정에서는 움직이지 않아요.
- 상단 ←는 실제 질문 방문 이력으로 돌아가요. 마지막 미리보기에서 `수정`으로 들어가면 ←와 하단 `미리보기` 버튼이 미리보기로 복귀해요. 접수 방식을 바꿔 사라진 질문은 건너뛰고, 질문 이력이 없는 첫 단계에서만 이전 페이지로 돌아가요. 하단의 별도 이전 버튼은 두지 않아요. 하단 `미리보기`는 해당 질문 검증을 거치며 최종 등록 검증도 유지해요.
- 기존 가게 수정의 질문에서 ←는 진입했던 항목 선택이나 미리보기로 돌아가요. 수정 미리보기의 ←는 항목 선택으로, 항목 선택 화면의 ←는 이전 페이지로 가요. 하단 `미리보기`는 해당 질문을 검증한 뒤 미리보기로 이동해요.
- 스켈레톤 뒤 첫 질문에는 별도 등장 모션을 붙이지 않아요. 사용자가 단계를 이동하면 제목으로 포커스를 옮기고 기존 180ms 모션을 쓰며, 숨겨진 입력을 언마운트하지 않아요. 다른 페이지를 다녀와 같은 방문 기록으로 돌아오면 질문 방문 이력·마지막 질문·입력·사진·미리보기의 모바일/PC 선택을 탭 메모리에서 복원해요. 이 메모리는 계정·세션 전환과 등록 완료 시 비우며 디스크 자동 임시저장 설정과 독립적이에요.
- 세부 운영 설정은 처음부터 펼쳐 보여요. 사용자가 접으면 그 상태를 유지하고, 공통 `reserve-filter-menu-chevron`의 0°↔180° 회전을 사용해요.
- 서비스 분야 6종은 홈·검색·등록이 `ServiceDomainIcon`과 같은 WebP를 재사용해요. 2026-10-08에 받은 업종 ZIP의 512px WebP·라이선스를 적용했으며 재현 스크립트와 제작 설정은 `assets/service-domains/source/dots-20261008`에 보관해요. Blender 원본·512px/768px PNG는 내려받은 ZIP에 두고 배포하지 않아요. 작은 탐색 아이콘은 필요한 512px WebP 하나만 해시 URL로 불러와요. 추가 선택 아이콘은 `assets/choice-icons/{이름}-512.webp`를 받으면 같은 컴포넌트에서 연결하고, 준비 전에는 기존 기본 아이콘을 표시해요.
- 마지막 PC·모바일 미리보기는 실제 상세의 사진·소개·정보 레이아웃과 `ReservationPanel`을 재사용해요. 예약 날짜·시간·인원·요청 사항도 같은 컴포넌트로 표시해요. 미리보기의 예약 폼은 HTML form을 만들지 않으며 별도 폼 상태와 조회용 가게 ID 제거로 등록 폼·예약 API와 분리해요. 예약 입력과 버튼은 비활성이고, 웨이팅 접수 영역·버튼은 미리보기에서 표시하지 않아요. 웨이팅 전용 가게의 PC 미리보기는 빈 접수 열을 남기지 않고 가게 정보를 가운데에 보여줘요. 지도·실제 리뷰·찜·결제 요청은 실행하지 않아요. 예약금이 있으면 최종 요약에서 금액·환불·결제 마감도 확인할 수 있어요.
- PC·모바일 미리보기의 설정 항목은 `components/store/StoreInfoSection`의 실제 상세와 같은 아이콘·항목명·설명·구분선을 재사용해요. 사진·소개·휴무·예약 조건을 포함한 항목은 모두 `수정` 버튼과 함께 표시하고, 미입력은 `작성 안 됨`, 선택 사항 없음은 `없음`·`제한 없음`, 꺼진 기능은 `사용 안 함`으로 구분해요. 수정하면 해당 질문으로 이동하며 ←로 입력과 기기 선택을 유지한 채 미리보기에 돌아와요. 등록의 꺼진 예약·웨이팅은 접수 방식 질문으로 연결하고, 기존 가게 수정은 해당 설정 질문으로 연결해요. 세부 운영 설정 수정 시 접힌 설정을 펼쳐요. 실제 고객용 상세에는 수정 버튼·미입력 항목을 추가하지 않아요. 같은 업종 이름은 한 번만 표시하며 유효하지 않은 숫자로 `undefined`나 `NaN`을 표시하지 않아요. 예약 단위도 시간대·회차·날짜 방식에 맞춰 표시해요.
- 모바일 미리보기는 390px 화면을 기존 크기의 휴대폰 프레임에 넣고 필요한 만큼만 축소해요. 프레임에는 노치·다이나믹 아일랜드·가짜 상태 표시줄·하단 홈 바를 넣지 않아요. PC는 1100px 화면을 처음부터 컨테이너 폭에 맞추고 좁은 화면에서 `확대`·`화면 맞춤`으로 전환해요. 확대했을 때만 좌우 스크롤을 사용하고 기기·확대 전환 시 시작점으로 돌아가요. 미리보기 제목·화면·설명은 20px, 설명 사이에는 8px 간격을 두고 내부 최소 페이지 높이에서 생기던 공백을 제거해요. 미리보기의 날짜·시간 안내는 보조 텍스트 색으로 읽기 쉽게 표시하되 입력 비활성은 유지해요. 휴대폰 프레임은 화면 설명용이며 실제 iOS·Android 동작 검증을 대신하지 않아요.

### 가게 상세 웨이팅 안내

- 실제 가게 상세의 예약 폼과 웨이팅 안내는 `StoreActionPanel`의 제목·PC 카드 틀을 재사용해요. 모바일은 기존 예약 폼과 같은 한 열 배치를 쓰고, 예약과 웨이팅을 함께 제공할 때는 두 영역 사이에 24px 간격을 둬요. 등록·수정 미리보기에는 웨이팅 접수 영역을 넣지 않아요.
- 현장 QR·원격·두 방식 모두에 맞춰 `회원가입·로그인 → 접수 시작 → 인원·개인정보 동의 → 내 예약의 웨이팅·호출 후 입장 QR` 순서를 설명해요. QR을 스캔하는 것만으로 접수하지 않으며, 비로그인 사용자의 접수 버튼은 로그인으로 이동하면서 현재 경로의 QR fragment를 유지해요. 현장 QR이 없는 화면에서도 먼저 로그인할 수 있지만 접수 모달은 열지 않아요. 가입 후 다른 화면으로 이동했다면 현장 QR을 다시 스캔하도록 안내해요.
- 접수 중지 상태에서는 새 접수 버튼을 제공하지 않고 기존 대기의 호출·입장 확인을 안내해요. 로그인한 사용자는 `내 웨이팅 확인`으로 이동할 수 있어요. 안내만 보기 위해 개인정보 정책을 조회하지 않으며, 실제 접수 모달의 최신 고지 조회·동의·인원 검증·중복 요청 방지·계정 전환 보호는 유지해요.

### 가게 초안 자동 저장 설정

- 사업자·관리자의 마이페이지에서 자동 임시저장만 켜거나 끌 수 있어요. 기본은 켜짐이고, 저장된 초안과 같은 계정·브라우저 범위에 적용해요.
- 끄면 대기 중인 자동 저장과 화면 종료 시 자동 저장을 막아요. 기존 초안 복원과 수동 `임시저장`·`수정완료`는 유지해요. 설정은 서버 등록·수정 승인과 별개이며, 다른 계정에 적용하지 않아요.

### Avatar

```jsx
import { Avatar } from '../components/common';

<Avatar src={profileImage} size={56} />
```

### Skeleton

```jsx
import { StoreCardSkeleton, MyReservationCardSkeleton } from '../components/common';

if (isLoading) return <StoreCardSkeleton count={6} />;
```

`StoreCardSkeleton`, `ReservationCardSkeleton`, `MyReservationCardSkeleton`, `ReviewCardSkeleton`, `StoreDetailSkeleton`, `AdminTableSkeleton`, 저수준 `Bone`이 있어요.

### DataState

```jsx
import { DataState } from '../components/common';

if (isError) {
    return <DataState state="error" kind="reservation" subject="예약 목록"
        error={error} onRetry={refetch} retrying={isFetching} />;
}

if (items.length === 0) {
    return <DataState state="empty" kind="reservation" title="예약 내역이 없어요." />;
}
```

읽기·목록 조회의 빈 결과와 실패를 표시해요. 빈 결과는 회색 도메인 아이콘과 안내, 실패는 회색 아이콘·사용자용 문구·`다시 불러오기`예요. `listErrorMessage`가 HTTP 상태를 문구와 아이콘 의미(`offline`, `forbidden`, `missing`, `rateLimited`, `retry`, `unavailable`)로 바꿔요.

- 결과가 나올 자리에 둬요. 순서는 `제목 → 필터/새로고침 → DataState`예요.
- 빈 목록·검색 결과·빈 차트 등 결과 영역 전체가 비었을 때는 `compact` 없이 가운데 정렬해요. 최소 높이 240px, 위아래 40px·좌우 20px 여백, 3D 그림 모바일 80px·PC 96px, 제목 18px(`fontSize['2xl']`)·600 굵기, 설명 15px(`fontSize.base`)가 공통 기준이에요. 그림이 실패하면 해당 슬롯의 절반 크기로 기존 도메인 아이콘을 표시해요. 작은 부분 오류는 `compact`의 20px 아이콘을 유지하고 페이지에서 크기를 따로 덮지 않아요.
- `DataTable`은 문자열 `locale.emptyText`와 기본 빈 결과를 같은 `DataState`로 표시해요. 의도적으로 넘긴 빈 문자열·사용자 정의 노드·함수는 보존해요. 표마다 작은 안내 문구를 별도로 만들지 않아요.
- 독립 조회가 모두 실패하면 `DataState` 하나로 합치고, 일부만 실패하면 해당 영역에 `compact`로 둬요.
- `compact`는 부분 조회 오류·좁은 인라인 상태만 위한 왼쪽 정렬 행이에요. 아이콘 20px·본문 14px·설명 13px을 유지해요. 필드 힌트·단순 선택 안내를 페이지 빈 결과로 바꾸지 않아요.
- 상세 페이지도 없는 항목은 빈 상태, 조회 실패는 오류와 재시도로 구분해요.
- 재시도 중에는 공통 `Button`의 `SpinIndicator`를 보여줘요.
- 폼 검증, 제출/결제 실패, 카메라·위치 같은 장치 실패에는 쓰지 않아요.
- AntD `Alert`·`Empty` 직접 import는 ESLint가 막아요. 결제 결과는 전용 상태 화면을 써요.

### ChartCard

`summary`, `tableColumns`, `tableRows`를 함께 넘겨요. 제목은 `h3`, 원본 수치는 접을 수 있는 `<table>`이고, 표가 있으면 차트 영역은 `aria-hidden="true"`예요.

```jsx
<ChartCard
    title="예약금 순결제액 추이"
    summary="확정 환불을 차감한 결제 완료일 기준입니다. 기간 합계 75,000원입니다."
    tableColumns={[
        { key: 'date', label: '날짜' },
        { key: 'value', label: '순결제액', render: value => `${value.toLocaleString()}원` },
    ]}
    tableRows={revenueTrend}
>
    <ResponsiveContainer>{/* visual chart */}</ResponsiveContainer>
</ChartCard>
```

실패한 데이터로 빈 차트를 만들지 않고, 부분 실패는 `compact` `DataState`로 표시해요.

### FavoriteButton

```jsx
<FavoriteButton storeId={id} />
<FavoriteButton storeId={id} initialStatus={true} />
```

`aria-label`, `aria-pressed`, 로딩 중 `aria-busy`를 주는 토글 버튼이에요.

## 3D 상태 그래픽

`RESERVE-state-illustrations-delivery`의 밝고 둥근 스타일과 같은 `empty-news`를 사용해요. `StateIllustration`이 29종의 512·768px 투명 WebP 중 현재 상태에 필요한 파일만 요청해요. 그림은 정지 WebP이며 빈 상태·없는 가게·404·조회 오류·준비 중·확정 결과는 `StateIllustration`이 이름으로 재생 대상을 정해요. 처리 중인 호출부는 `interactive`로 재생을 끌 수 있어요. QR와 결제 미확정 그림은 기본 재생 대상이 아니에요. 해당 방문에서 스켈레톤이 한 번이라도 보였거나 이미지가 아직 로드되지 않았다면 등장 모션을 생략해요. 스켈레톤 없이 이미 로드된 캐시 이미지만 가시성을 확인해 1.4초 등장·안착을 한 번 실행하며 숨긴 화면·탭에서는 일시 중지해요. 별도 영상·Lottie 재생기는 설치하지 않아요. 원본 PNG·Blender와 다른 스타일은 앱 번들에 넣지 않아요.

서비스 분야 6종과 추가 선택·빠른 메뉴 13종은 정지 이미지예요. 홈은 기존 hover 반응만 유지하며 긴 등장·클릭 재생을 하지 않아요. 등록의 선택 아이콘은 hover·누르는 동안 2px 위로만 이동하고 선택값을 즉시 반영해요. 추가 13종은 `src/assets/choice-icons/`의 512px WebP 합계 125,008바이트이며, 56px 슬롯에서 표시해요. PNG·768px·Blender 원본은 전달받은 ZIP에 보관하고 앱에서는 사용하지 않아요. 추가 묶음의 라이선스와 제작 메타데이터를 자산 폴더에 함께 보관해요.

2026-10-09의 `RESERVE-small-size-refinements-v1.zip`은 48종 중 8종의 보완본이에요. 운동·클래스·회차제·웨이팅 선택은 512px 4개, 광고 빈 상태·결제 성공/실패/미확정은 512·768px 8개를 앱에서 교체했어요. 기존 경로와 표시 크기·알파·라이선스를 유지하며 별도 영상이나 재생기를 추가하지 않아요. 나머지 서비스·선택 아이콘의 768px 4개는 원본 ZIP에 보관해요. 교체 전 앱 파일 12개도 기존 업종·추가 선택·상태 원본 ZIP에 같은 해시로 남아 있고, 동결된 제작 메타데이터는 덮어쓰지 않아요.

같은 날 `RESERVE-edit-controls-v1.zip`의 운영 설정·소개/사진·접수 중지·웨이팅 미사용 4종을 연결했어요. 512·768px WebP 8개는 원본과 같은 바이트로 보관하며 `ChoiceIllustration`은 512px만 번들에 연결해요. 제작 코드·manifest·라이선스는 `assets/choice-icons/source/edit-controls-v1`에 있어요. PNG·Blender와 제작 전체 구조를 담은 원본 ZIP 8개는 `C:/Users/USER/AppData/Local/RESERVE/asset-archive/20261009`에 한 부씩 보관해요. Downloads의 ZIP을 이곳으로 이동했으며 원본을 삭제하거나 동결 스냅샷·QR 캡처를 바꾸지 않았어요.

이용안내·웨이팅 안내·동의/권리 출처의 텍스트 링크는 `TextLink`의 같은 색을 유지하고 hover·키보드 포커스·선택 상태에서 밑줄을 표시해요. `useMessagesEntry`는 홈·이용안내·메신저 런처의 진입을 함께 처리해요. 로그인·약관 관문과 수정키/새 탭 링크를 유지하고, PC 일반 클릭은 현재 화면의 패널을 열어요. 모바일은 먼저 표시한 골격 뒤에 등장 애니메이션을 다시 시작하지 않으며 닫힘 동작은 유지해요.

정적인 결과·안내는 페이지 전체인지 목록 안인지가 아니라 그림의 역할로 구분해요. 재생 대상은 클릭·Enter·Space로 1.4초 모션을 다시 실행할 수 있어요. `DataState`는 다시 불러오는 동안 재생을 꺼요. 재생할 때 이미지 URL을 바꾸거나 서버를 호출하지 않아요. 실행 중인 모션은 취소하고 하나만 재생해요. 동작 줄이기 설정에서는 정지 이미지로 표시하며, 이미지가 실제 링크·버튼 안에 있으면 별도 버튼이나 포커스를 만들지 않아요. 상위 링크·버튼·숨김·`inert` 상태가 바뀌면 다시 판정하며, 실제 재생 직전에도 같은 경계를 확인해요. 키보드 포커스는 공통 1px 회색 링을 사용해요.
`IntersectionObserver`가 없으면 스크롤·크기 변경 때 한 프레임에 한 번 가시성을 갱신해요. 계속 도는 프레임 루프는 만들지 않고, 화면 밖·숨긴 탭의 모션은 일시 중지해요.

| 그림의 자리 | 클릭·키보드 재생 |
|---|---|
| 404·화면 오류의 `PageStatus`, 준비 중 안내 | 사용해요. |
| 대화·가게·예약 등의 큰 빈 상태와 조회 오류 `DataState` | 사용해요. 다시 불러오는 동안에는 꺼요. |
| 결제 완료·최종 실패·결제 상태 조회 실패 | 사용해요. 결제 상태와 요청에는 영향을 주지 않아요. |
| 홈 빠른 메뉴·업종·등록 선택지, 실제 버튼·링크·목록 행, 작은 인라인 오류 | 사용하지 않아요. 각 컨트롤의 기존 hover·누름 반응을 사용해요. |
| QR 스캔·QR 처리 결과, 결제 조회 중·미확정 상태 | 사용하지 않아요. |

| 움직임 | 전달 형식 | 선택 기준 |
|---|---|---|
| 등장·작은 바운스·기울임 | 투명 WebP + CSS transform·opacity | 기본 방식. 작은 이미지 몇 장이나 분리된 부품을 움직이고 별도 재생기를 설치하지 않아요. |
| 실제 입체 회전·반사광 변화 | 짧은 WebM + MP4 대체 영상 + 정지 WebP | 장면의 깊이가 바뀌는 경우. 흰 배경 영상은 다크 화면에 그대로 사용하지 않으며, 투명도와 브라우저 호환성을 확인해요. |
| 여러 부품의 정밀한 타이밍·상태 전환 | Lottie / dotLottie + 정지 WebP | 실제 변환 결과를 받은 뒤 선택해요. 전체 프레임을 이미지로 넣은 파일은 용량과 디코딩 비용을 따로 측정해요. |

- 모서리가 둥근 입체 형태·부드러운 조명·가독성 있는 대비는 원본 제작에서 맞춰요. 이미 렌더한 384px 영상을 확대해 선명도를 보완하지 않아요. 256 CSS px로 표시할 경우 512px·768px 원본을 제공받고 실제 화면의 픽셀 비율에 맞춰 골라요.
- 1~2초, 24~30fps로 한 번 재생한 뒤 같은 마지막 장면의 정지 이미지로 유지해요. 반복 재생과 소리는 기본으로 켜지 않아요. 정지 이미지를 먼저 보여주고 크기·비율을 미리 확보해 화면이 밀리지 않게 해요.
- 동작 줄이기 설정에서는 정지 이미지만 보여줘요. 이미지가 로드되고 화면에 보이며 탭이 활성일 때만 등장 모션을 시작해요. 파일을 읽지 못하면 기존 아이콘으로 표시해요. 영상·Lottie를 나중에 추가할 때는 숨겨진 탭에서 재생을 중단하고 화면 종료 시 디코더·캔버스를 해제해요.
- 선택한 상태의 파일만 불러와요. 재생기는 필요한 상태 화면에서 동적으로 불러오며 앱 셸의 고정 vendor 청크에 넣지 않아요. dotLottie는 JavaScript 외에 WASM 요청과 CSP 호환성까지 확인해요.
- 파일은 `src/assets/state-illustrations/`에서 Vite URL import로 사용해요. 빌드 결과의 해시가 붙은 `/assets/`는 기존 Nginx의 `public, max-age=31536000, immutable` 캐시를 사용해요. 내용이 바뀌면 URL도 바뀌며, 해시 없는 `public` 파일에 같은 캐시를 무작정 적용하지 않아요.
- 1개 정지 이미지 40KiB, 선택한 애니메이션 200KiB 이내를 초기 목표로 삼아요. 재생기의 첫 요청 비용은 별도예요. 목표를 맞추려고 원본 해상도나 투명 경계를 먼저 훼손하지 않고, 실제 내보낸 파일과 모바일 재생 비용으로 결정해요.
- 결제 상태는 기존 서버 확인 결과로만 선택해요. 조회 중·결과 미확정·통신 장애를 결제 실패 그림으로 표시하지 않아요. 이미지 자체는 장식으로 숨기며, 단독 재생 컨트롤에는 재생 이름과 키보드 동작을 제공해요. 결과·설명·다음 버튼은 실제 텍스트로 제공해요.
- 크기는 `stateIllustrationSize`(모바일 64/80/96px)·`stateIllustrationDesktopSize`(768px 이상 72/96/112px) 토큰으로 정해요. 본문 `DataState`는 md, 결제 결과·페이지 없음·준비 중 화면은 lg, QR 스캐너 대기 안내는 sm이에요. 실제 그림과 `StateIllustrationSkeleton`이 같은 반응형 슬롯을 쓰고 HTML 크기도 제한해 원본 512px로 펼쳐지지 않아요. 작은 버튼·입력 오류·목록 행의 아이콘은 유지해요.
- 전달받을 묶음: Blender/After Effects 원본과 연결된 리소스, 512px·768px 투명 정지 이미지, 움직일 부품별 이미지, WebM·MP4 또는 실제 Lottie 내보내기, 마지막 장면의 poster, 길이·fps·픽셀 크기·파일 크기·투명도·반복 여부·라이선스 정보예요.

근거: [토스의 적은 3D 이미지와 Lottie 구성 사례](https://toss.im/tossfeed/article/why-motion-in-finance), [dotLottie의 재생기와 WASM 구성](https://github.com/LottieFiles/dotlottie-web), [해시 URL과 immutable 캐시](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).

## 상호작용

### 값 교체와 QR 가이드

- 업종 입력은 `RollingFormInput`의 `replacementKey`가 바뀐 명시적 서비스 분야 선택에만 움직여요. 직접 입력·삭제·붙여넣기에는 네이티브 입력칸만 보여요. 자동 교체 시 네이티브 글자는 색 전환 없이 즉시 숨기고 `RollingFieldValue`의 기존 예약 인원·날짜와 같은 70% 이동·25° 회전·투명도·200ms 타이밍으로 표시해요. 이전 글자 레이어는 종료 상태의 투명도를 유지하고 종료 때 숨겨, 긴 값에서 짧은 값으로 바뀐 뒤 다시 나타나지 않게 해요. 네이티브 글자는 별도 타이머가 아니라 실제 모션 종료·취소에 맞춰 다시 보여줘요. 입력칸의 배경·테두리·포커스 전환은 유지해요.
- 등록의 접수 방식·예약 방식·웨이팅 방식 설명도 같은 값 교체 모션을 사용해요. 설명은 모바일 줄바꿈을 유지하며, 이전 설명은 접근성 읽기에서 제외해요. 같은 설명을 다시 선택하거나 동작 줄이기를 사용하는 경우에는 움직이지 않아요.
- `FilterMenu`·`FormSelect`·`FilterSelect`의 일반 글자 값은 실제 선택 항목 순서를 따라요. 이전 항목보다 위에 있는 항목을 선택하면 위로, 아래에 있는 항목을 선택하면 아래로 움직여요. 등록 업종과 선택 설명에도 같은 순서를 전달해요. 날짜·예약 인원의 기존 증감 방향은 유지하고, 복합 JSX 라벨과 호출부의 별도 `labelRender`는 그대로 사용해요.
- 모션이 진행 중일 때 빠르게 다른 값을 선택하면 현재 글자만 최신 값으로 바꾸고 같은 200ms 사이클을 마쳐요. 매 선택마다 취소·재시작하거나 이전 값을 재생 큐에 쌓지 않아요. 모션 시작 전 값으로 돌아오면 같은 글자 두 겹을 움직이는 대신 모션을 끝내고 원래 값을 바로 보여줘요. 직접 타이핑·유효하지 않은 값·동작 줄이기·컴포넌트 종료 시에는 모션을 취소하고 이전 레이어를 비워요.
- QR 가이드는 카메라 전체 영역 위에 그리며 디코딩 영역을 자르지 않아요. `BarcodeDetector`가 QR 좌표를 제공하는 브라우저에서는 기기 안에서 최대 약 5회/초 위치와 크기를 계산하고 이동·크기 변화에 160ms 전환을 적용해요. 지원하지 않거나 검출이 실패하면 기존 고정 모서리 가이드를 사용해요. 영상 업로드·서버 추적은 없으며 숨긴 탭·스캔 정지·체크인 처리 중에는 추적을 멈춰요. 모션 축소에서는 좌표 전환 애니메이션만 꺼요.
- 유효한 QR 좌표가 400ms 넘게 갱신되지 않으면 고정 가이드로 돌아가요. 같은 좌표·크기에는 스타일을 다시 쓰지 않아요. 이 빈도와 전환 값은 구현값이며 실제 휴대폰의 추적 성능을 검증한 결과는 아니에요.
- QR 체크인 성공·중복·실패는 `QrScanResult`로 스캐너 아래에 남겨요. 성공은 서버가 반환한 예약·입장 기록만 보여주고, 승인 상태를 바꾸거나 QR 토큰·연락처를 표시하지 않아요. 웨이팅 만료와 잘못된 코드는 서버의 동일한 오류 응답을 그대로 설명해요. 처리 후 스캔은 자동으로 이어지므로 결과 아래에 `다시 스캔` 버튼을 두지 않아요. 같은 QR이 계속 보이는 동안 체크인 요청을 반복하지 않으며, QR을 치웠다가 다시 비추면 다시 처리해요.
- `design-previews/qr-checkin.html`은 개발 환경 전용 예시 카메라·응답 캡처예요. 화면 표현을 확인하는 용도이며 실제 QR 검증·카메라 성능·운영 부하의 증거로 사용하지 않아요.

### Hover · 누르는 동안 · 선택 상태

일반 탐색은 hover에 브랜드 파란색을 쓰지 않아요.

| 대상 | Hover | 누르는 동안 (`:active`) | 선택 상태 |
|---|---|---|---|
| primary / secondary / outline 버튼 | 투명도 또는 중립 테두리·면 변화 | `scale(0.96)` + 투명도, 메신저 홈 문의 CTA는 `scale(0.98)` | — |
| ghost / link 버튼 | 투명도 변화 | `scale(0.94–0.96)` + 투명도 | — |
| 헤더 검색 아이콘 / 뒤로가기 / 워드마크 | 중립 면 또는 투명도 | 뒤로가기는 왼쪽 180ms 피드백 후 이동, 워드마크는 즉시 이동 | — |
| 프로필 사진 / 추천 사진 카드 | 중립색, 추천 카드만 2px 상승 | `scale(0.94–0.97)` | — |
| 홈 3D 바로가기 | 이미지 2px 상승 | 별도 재생·축소 없음 | — |
| 가게 등록 선택 아이콘 | 이미지 2px 상승 | 이미지 2px 상승 | 진한 라벨 + 밑줄 |
| 메신저 footer 홈·대화·설정 | 비활성 아이콘만 중립색 강조 | 명암만 | 활성 화면은 primary 아이콘·라벨, `aria-current=page` |
| 메신저 X·뒤로가기·새로고침 | 44×44 영역에 옅은 회색 면 | 명암만 | — |
| FAQ 삭제 | 투명 면에서 명암 | 공통 `ghost` 버튼의 `scale(0.94)` | — |
| 채팅 도구 / 목록 보기 / 달력 이동 / 소셜 로그인 | 중립 면 또는 명암 | 모션 감소가 꺼져 있으면 `scale(0.96)` | — |
| 메신저 문의 질문 | 중립 글자·테두리 + 옅은 회색 면 | 명암만 | 선택 문구는 입력 초안에 추가 |
| 홈 탭·지역·현재 위치·전체 보기·공지 텍스트 | 중립색 또는 투명도 | 명암만 | 탭은 진한 글자 + 밑줄 |
| 홈 scroll-snap 메인 배너 | 투명도 | 투명도 | 배너·트랙 scale 없음 |
| `FilterMenu` | 흰 면(다크 paper) 또는 투명 면 | 중립 면 변화 | 중립 선택 면 + 체크 |
| 일반 가게 카드 | 중립 그림자 + 사진 `1.05` 줌, 공개 탐색 카드만 2px 상승 | 내부 링크 `scale(0.98)` | — |
| 즐겨찾기 | 사진 위는 흰 면·그림자, 정보 영역은 하트만 | `scale(0.94)` | `aria-pressed` + 빨간 하트 |
| pill tabs / SegmentedControl / 페이지네이션 | 회색 면 + 진한 글자 | 소형 컨트롤 눌림 | 회색 선택 면 + 진한 글자 |
| 날짜·시간 선택 | 회색 hover | — | `gray-200` 면 + 진한 글자 |

- 2px 상승은 fine pointer이면서 모션 감소가 꺼진 환경에서만 적용돼요.
- 비활성·응답 대기 중에는 클릭과 눌림 효과를 막아요.
- 공통 버튼에 평상시 인라인 `opacity: 1`을 넣지 않아요.
- 공통 `Button`에서 아이콘만 있는 버튼은 44×44px이에요. FAQ 삭제는 `ghost` 버튼을 사용하며 평상시에 별도 회색 박스를 두지 않아요. 키보드에는 기존 1px 포커스 링을 유지해요.

### 포커스와 선택 테두리

| 상태 | 표시 |
|---|---|
| 키보드 포커스 (`:focus-visible`) | `--reserve-focus-ring`: 1px `gray-500` 링 |
| 입력칸 포커스 | 1px `gray-500` |
| 선택·편집 중 (등장 효과 카드, 지역 시트 인기 지역, 기간 시작/종료 칸) | 1px `gray-400` + 회색 면 |

- 키보드 포커스 링은 Tab 이동에만 보여요.
- 공통 버튼·카드/목록·필터·채팅·모달 닫기·탭/차트는 `foundation.css`의 같은 링 토큰을 사용해요. 브라우저 기본 컨트롤과 AntD 버튼도 같은 표시를 사용하고, 일반 클릭·터치에는 외곽선을 표시하지 않아요.
- 선택 상태는 회색 면 또는 중립 테두리예요. primary는 제출·결제 같은 실행 버튼과 현재 위치 표시에만 써요.

### 모션 축소

`useReducedMotion` 훅과 `@media (prefers-reduced-motion: reduce)`를 함께 써요.

- CSS 이동·확대·깜빡임은 미디어쿼리에서, 타이핑 루프·부드러운 스크롤은 훅에서 멈춰요.
- 홈은 첫 문구를 완성된 상태로 두고 reveal 요소를 즉시 보여요.
- 로딩 스피너는 `prefers-reduced-motion`에서 회전을 멈추고 정지된 원형 호와 로딩 문구를 표시해요.

### 공통 로딩 표시

- 원형 로딩은 `Loading.jsx`의 `SpinIndicator`를 사용해요. `loadingConfig.jsx`에서 AntD `Spin`·`Button`·`Select`에도 같은 표시를 지정해요.
- 기본 스피너를 숨긴 뒤 `::before`로 링을 만드는 전역 CSS는 사용하지 않아요. SVG의 회전과 호 모양 애니메이션이 같은 표시를 구성해요.
- 공통 `Button`·폼 필드 버튼의 스피너는 14px이고 현재 글자 색을 상속해요. 취소·확인·고스트 버튼에서도 흰색을 강제하지 않아요.
- 재시도·다시 불러오기·상태 재확인·재처리 버튼에는 회전 화살표와 별도 `loadingIcon`을 붙이지 않고 공통 `SpinIndicator`를 사용해요. 전용 `RefreshButton`의 새로고침 아이콘은 기존 동작을 유지해요.
- 목록·관리 도구줄의 첫 조회에는 `initialLoading`으로 `ListingControlsSkeleton`·`FilterToolbarSkeleton`을 표시해요. 보기 아이콘·가게·상태·정렬·검색·새로고침 자리도 실제 배치와 맞춰요. 캐시 자료의 새로고침은 `loading`으로 기존 컨트롤을 유지하며, 전체 오류와 기존 본문에 붙는 부분 오류를 구분해요.
- 웨이팅은 사진이 없는 실제 명단·카드 골격을 사용해요. 사업자·관리자 경로 골격은 선택한 탭의 도구줄·표·차트·채팅 설정을 따르고, 내 예약과 마이페이지도 선택한 탭·계정 역할에 맞춰요.

### 화면 전환 모션

- 화면 이동은 120–180ms 안에서 끝나요. 헤더·탭은 멈추고 도착한 콘텐츠만 움직여요.
- 일반 진입·앞으로가기는 오른쪽, 뒤로가기·직접 진입 fallback은 왼쪽에서 들어와요. 최상위 탐색 탭은 탭 순서로 방향을 정해요.
- 홈 이동은 도착한 홈만 왼쪽에서 들어와요.
- 검색 화면은 내용만 PC 8px·모바일 24px을 220ms 동안 위로 들이고, 취소·Escape는 반대로 닫아요.
- 검색 실행·분야 선택·전체 보기로 결과에 이동할 때는 검색 입력 화면의 방문 기록을 교체해요. 결과에서 뒤로가면 검색 입력을 다시 열지 않고 검색 전 페이지로 돌아가며, 검색어 수정 링크와 입력 화면의 취소·Escape는 그대로 사용할 수 있어요.
- 같은 pathname의 필터·정렬·보기 변경과 데이터 로딩 스켈레톤에는 페이지 진입 전환을 넣지 않아요. 선택 글자의 값 교체 모션은 위 규칙을 따라요.
- `LoadingPresentationContext`는 이동 키마다 실제로 표시된 페이지 골격을 기록해요. 그 이동에서 골격이 보였다면 데이터 도착 뒤 페이지·헤더 등장 효과를 다시 재생하지 않아요. 지도·시간 슬롯·달력 같은 부분 로딩은 `Bone pageLoading={false}`로 구분해요.
- 메신저 패널은 별도 로딩 기록을 사용해요. 패널의 조회 골격이 보인 뒤 상태 그림의 등장 모션을 생략하고, 패널을 열었다는 이유만으로 본문 페이지의 기록을 바꾸지 않아요.
- 검색·채팅 패널의 전용 열림·닫힘은 예외예요. 첫 채팅 조회가 골격을 보여도 `MessengerShell`의 기존 열림 효과를 유지하고, 열린 패널에서 가게 문의로 전환할 때는 `storeOpenRevision`으로 같은 효과를 다시 재생해요. 동작 줄이기 설정에서는 즉시 열어요.
- 알려지지 않은 경로의 준비 골격도 `routeSkeletonKind`와 기존 `RouteSkeletonPages`의 404 화면 규격을 사용해요. 로딩 상태의 문구는 `LoadingStatus`의 접근성 안내로 제공해요.
- 모션 감소 설정에서는 즉시 이동해요.

### 집중형 작업 화면

사업자·관리자·메시지 화면의 규칙이에요.

- 데스크톱 작업 내비게이션은 폭 264–280px, 제목·아이콘·짧은 라벨만 둬요. 활성 항목은 옅은 회색 면 + 진한 글자예요.
- 아이콘은 AntD 선형 계열 20px이에요. 텍스트가 있는 버튼의 아이콘은 장식으로 숨겨요.
- 한 화면에 주 동작은 하나예요.
- 입력·작성 면은 둥근 중립 테두리, 약한 그림자, 1px 중립 포커스(`.reserve-form-field:focus-within`)예요.

## 공개 탐색 패턴

### 헤더와 검색

헤더·탐색 탭·검색 화면의 배치와 동작은 [검색 화면과 헤더](search-ui.md)에 있어요.

- 헤더 높이는 `heights.header` 64px이고, 모든 화면이 같은 최대 폭·반투명 배경·여백을 써요.
- 상단 탭은 공통 `DiscoveryNav`가 경로로 활성 탭을 판정해요. 헤더와 같은 `--c-header-bg`·20px 블러, 내용 최대 1248px, 하단 선 하나예요.
- 분류 기준은 `constants/discovery.js`에 있어요.

### 홈

- 치수는 `feature-surfaces.css`의 `--reserve-home-*` 변수로 관리해요. 최대 폭 1248px, 여백은 모바일 20px(아주 좁으면 16px)·태블릿/PC 24px이에요.
- 간격 변수: `--reserve-home-section-spacing: 20px`, `--reserve-home-content-spacing: 16px`, `--reserve-home-divider-size: 4px`.
- 뷰포트는 `100svh` 기준이에요.
- 분야 바로가기는 투명 WebP 물체 이미지예요. 광학 크기는 `constants/discovery.js`, 홈 전용 바로가기는 `Home/index.jsx`에서 관리해요. 모바일/태블릿 5열, PC는 서비스 6개와 빠른 메뉴 4개예요.
- 메인 캐러셀은 `picture`로 모바일/태블릿 3:2(960×640), PC(900px 이상) 2.5:1(1600×640) 사진을 골라요.
- 운영 안내는 같은 방식의 사진 링크(`/operation-guide`)예요.
- 홈 추천은 `StoreListRow`를 써요. 900px 미만 1열, 이상 2열이에요.
- 이미지 자산: [home-visual-assets.md](home-visual-assets.md)

### 가게 카드·목록

사진 카드는 `StoreCard`, 한 줄 목록은 `StoreListRow`를 써요. 가게 목록·관심·혜택 가게·광고 미리보기·홈 추천·내 가게 관리가 대상이에요.

- 관리 화면은 `actions`(수정·삭제 줄)를 넘기고, 찜이 필요 없는 곳은 `showFavorite={false}`예요.
- `StoreCard`는 각진 모서리이고, `Card.Cover`는 `width: 100%; height: auto`로 원본 비율을 유지해요.
- `StoreCard` 정보 영역: 이름과 44px 하트 → 종류·AD·우리동네 → 별점. 위아래 12px, 줄 사이 2px이에요.
- `StoreListRow`는 1열, 1:1 사진(768px 미만 80px, 이상 96px)·14px 반경·`object-fit: cover`예요. 이름 → 한 줄 설명 → 평점(리뷰 수) → 종류·AD·우리동네 순이에요.
- 가게 목록 링크를 누르면 사진·본문이 함께 0.98배로 눌리고 투명도는 0.88이 돼요. 하트·관리 버튼은 별도 타깃을 유지하고, 동작 줄이기 설정에서는 크기를 바꾸지 않아요.
- 종류·광고·우리동네는 `.reserve-store-identity-text`로 표시해요. 광고 표시는 공용 `AdMark`(화면엔 AD, 화면 낭독기엔 '광고')예요.

### 보기 전환 (`/stores`)

- 첫 행 왼쪽의 44×44px 아이콘 버튼이에요. 분야·정렬은 오른쪽에 두고, 다음 보기를 `UnorderedListOutlined`/`AppstoreOutlined`로 표시해요.
- URL `?view=cards` 또는 `?view=list`로 정해요. 값이 없거나 잘못되면 기본값 또는 마지막 보기로 URL을 보정해요.
- 같은 조회 데이터를 재사용해요. 스켈레톤 중에는 보기·지역·분야·정렬을 잠가요.

### 가게 목록 필터

- 분야·정렬은 `<FilterMenu appearance="plain" />`로 오른쪽에 4px 간격, 가게 수는 왼쪽이에요.
- 페이지 `h1`은 visually-hidden이고, 본문 상단 여백은 PC 16px·모바일 12px이에요.

### 가게 상세

`StoreIdentity`를 PC·모바일에 똑같이 써요.

- 갤러리 → 가게명(모바일 22px·PC 24px)과 `문의` → 종류·우리동네 → 평점·리뷰 수 → 소개 순이에요. 키워드 배지는 소개 뒤예요.
- 문의 클릭 영역은 최소 56×44px이에요.

### 지역 선택

홈·공개 목록이 같은 `RegionSheet`를 써요.

- 전국 17개 시도는 항상 선택할 수 있고, 시군구·인기 바로가기·가게 수는 공개 ACTIVE 가게 주소의 앞 두 토큰으로 만들어요.
- 시도 → 시군구를 골라요. `초기화`는 초안을 전국으로, `적용`이 URL `region`과 결과를 바꿔요.
- 대표 사진은 공공누리 제1유형 관광정보 API 프록시만 쓰고, 없으면 핀 아이콘이에요.
- PC는 최대 700px 중앙 대화상자, 모바일은 최대 86svh 바텀 시트예요. 두 목록만 독립 스크롤해요.
- 지역을 바꿔도 분류/거리 조건은 유지하고 페이지는 1로 가요.
- 유효한 URL 선택을 우선하고 URL에 지역이 없으면 같은 탭의 `sessionStorage` 선택을 복원해요. 전체 선택도 저장하며 페이지 이동·새로고침에 유지하고 다른 브라우저 탭에 실시간 전파하지 않아요. 같은 지역을 다시 적용하면 현재 페이지를 유지해요.

### 평점 표시

`normalizeStoreRating`에서 정규화해요. 모든 화면에서 별 아이콘·한 자리 소수·괄호 리뷰 수를 쓰고, 리뷰가 없으면 `0.0 (0)`이에요.

### 혜택 (`/benefits`)

공개 가게 소식을 가로 사진 배너로 보여요.

- 배너 구성: 가게 사진 배경 → 짧은 본문 → 큰 가게명 → 소식 제목 티켓이에요.
- `page`는 12건·서버 메타를 써요.
- 최대 1248px, gutter는 모바일 20px(360 미만 16px)·태블릿/PC 24px, `--reserve-benefit-section-spacing/content-spacing/divider-size`는 20/16/4px이에요.
- 900px 미만 1열·이상 2열이에요. `--reserve-benefit-banner-ratio` 3.2:1 골격과 `--reserve-benefit-banner-min-height` 120/164/156px 최소 높이를 grid로 겹쳐요.
- 사진은 absolute·cover이고 왼쪽 그라데이션으로 글자 대비를 확보해요. fine pointer·모션 감소 OFF에서 사진만 1.02 줌해요.
- 사진이 없거나 실패하면 64px 로고예요.
- `--reserve-benefit-photo-backdrop/photo-fg/ticket-bg`는 사진 위 대비용 고정 토큰이고, 나머지 치수는 `--reserve-benefit-banner-padding/store-size/description-size/ticket-size`로 관리해요.

### 광고 작성과 미리보기

- 작성 순서는 `추천 문구 → 제목 → 내용`이에요. 추천을 고르면 두 입력을 채우고, 다시 수정할 수 있어요.
- 미리보기는 `StoreCard`·`StoreListRow`·`AdBannerSurface`를 `preview`로 그려요. 링크·즐겨찾기 동작·노출 집계만 꺼요.
- 노출형(`BADGE`)은 실제 목록 카드·행에 붙는 작은 광고 표시예요.
- 결제 정보는 왼쪽 항목·오른쪽 값의 영수증 목록이에요. 요금은 `하루 금액 × 일수`로 보이고 합계만 크게 써요. 파란색은 결제 버튼에만 써요.
- 모션 재생은 `RefreshButton label="효과 다시 보기"`를 써요.

## 메신저

- **패널**: PC 420px, 모바일은 64px 헤더 아래 전체 화면이에요. 홈은 사진 커버·관리자 안내 카드·문의 CTA 하나예요.
- **footer**: `MessengerFooter`는 홈·대화·설정 버튼, `aria-current=page`, 54px 버튼이에요. 메시지 입력 중에는 숨겨요. primary는 활성 탭에만 써요.
- **커버**: `MessengerBrandCover`는 `/og-image.png`가 기본이고 `coverImageSrc`로 바꿀 수 있어요. 제목 '메시지'는 sr-only예요.
- **아바타**: `MessengerAvatar`는 위험 프로토콜·자격증명 URL을 거부하고, 사진이 없으면 브랜드 이미지 → 아이콘으로 대체해요.
- **표시 이름**: SUPPORT 방은 `RESERVE 고객지원`과 브랜드 아바타로 고정해요. 회원이 보는 STORE 문의는 가게 이름, 사장님이 보는 받은 문의는 고객 이름이에요.
- **제목 바**: `MessengerListHeading`은 72px 높이에 제목·44px 새로고침을 둬요. 대화·설정 제목도 같은 72px 바, 왼쪽 여백(PC 20px·모바일 16px), 하단 경계선을 써요.
- **대화 목록**: `MessengerConversationRow`가 상대 이름과 마지막 메시지 한 줄을 보여요. 진짜 빈 방에만 '아직 메시지가 없습니다.'를 보여요.
- **설정**: `MessengerSettings`는 계정·내 정보 관리·알림 설정을 보여요. 사진이 없으면 이니셜 → 사용자 아이콘이에요.
- **런처**: 흰 브랜드 타일이에요. 전경 `--c-messenger-launcher-fg` → `--c-primary-dark`, 배경 `--c-messenger-launcher-bg` → 흰색이에요. PC 56px/radius 16px·모바일 48px/radius 14px이고, 닫힌 런처는 `/icons/R_logo.png`를 써요.

## Import 패턴

```js
import { Button, FormInput, PageContainer, Card, Loading } from '../components/common';
import { useMessage, useStoreData, useReservations } from '../hooks';
import { API_ENDPOINTS, STORE_CATEGORIES, RESERVATION_STATUS_LABELS } from '../constants';
import { getImageUrl, getThumbnailUrl, formatDate, formatCurrency } from '../utils';
import { colors, radius, fontWeight, fontSize, heights } from '../styles/tokens';
```

## 꺾쇠·화살표 회전

펼치면 시계방향 180°, 접으면 같은 길로 되돌아와요.

| 대상 | 구현 위치 | 회전 대상 |
|---|---|---|
| 드롭다운 꺾쇠 (Select) | `styles/global/foundation.css` → `.ant-select-open .ant-select-suffix` | `span.ant-select-suffix` |
| 아코디언 화살표 (FAQ) | `styles/global/feature-surfaces.css` → `.ant-collapse-item-active .ant-collapse-arrow` | `span.ant-collapse-arrow` |

상태는 AntD 클래스로 판정해요. 닫힘 상태에도 `rotate(0deg)`를 명시해요.

```css
.faq-collapse .ant-collapse-arrow            { transform: rotate(0deg); }   /* ← none 이면 안 된다 */
.faq-collapse .ant-collapse-item-active
  .ant-collapse-arrow                        { transform: rotate(180deg); }
```

## Select와 목록 메뉴

| 컴포넌트 | 모양 | 용도 |
|---|---|---|
| `FormSelect` | 채움형 회색 (`gray[50]` / 다크 `#23262b`), 높이 54px | 값을 입력하는 칸 (가게 카테고리, 글꼴, 광고 등록) |
| `FilterSelect` | 흰 면 + 옅은 테두리 (다크 `#1e2126`), `size="large"` | 목록 조작 도구 (별점순, 예약·광고 관리 필터, 통계 가게 선택) |
| `FilterMenu` | 네이티브 버튼 + Dropdown, 작은 pill 또는 투명 텍스트 | 간단한 탐색 선택 (공개 목록의 분야·정렬) |

순수 AntD `<Select>`는 직접 쓰지 않아요.

| `FilterMenu` 항목 | 값 |
|---|---|
| 트리거 | 보이는 면 32px, 동작 영역 44px, 반경 100px, 글자 13px/행 높이 20px |
| 드롭다운 | 최소 너비 128px, 안쪽 여백 4px, 반경 10px |
| 항목 | 최소 모바일 40px·PC 36px, 글자 13px |
| 최대 높이 | 320px와 `화면 절반 - 24px` 중 작은 값, 넘치면 내부 스크롤 |

- 선택 항목은 체크로 표시해요.
- Enter/Space·방향키로 열고 Escape로 닫으면 버튼에 포커스가 돌아가요.

### 규칙은 관문 컴포넌트에 둬요

정책은 반드시 지나가는 한 곳에서 강제해요. `useMessage.confirm`, `FormSelect`/`FilterSelect`가 그 형태예요.

### 전역 CSS 위치

`index.css`는 전역 CSS 진입점이고, 순서를 고정한 `styles/global/*.css`를 import해요. `.reserve-form-select`는 `components-and-forms.css`, `.reserve-filter-select`는 `interactions.css`에 있어요.

- 전역 정책(색·높이·상태별 톤) → `styles/global/*.css`
- 컴포넌트 지역 스타일(그 인스턴스의 폭·간격) → 인라인 `style`
- JSX에서 `<style>` 태그를 직접 렌더하지 않아요.

## 폼 검증 에러 메시지

| 항목 | 값 |
|---|---|
| 위치 | 컨트롤 바로 아래, 간격 `6px` |
| 크기 | `12px` / `line-height 1.5` |
| 색 | `colors.error.main` (라이트 `#f04452` / 다크 `#ff6b76`) |
| 접근성 | `role="alert"` |
| 사라짐 | 재검증 성공 시에만 |

두 구현 경로가 같은 규격을 내요.

1. AntD `Form.Item` (가게 등록·광고 신청·제재 모달 등) → `components-and-forms.css`의 `.ant-form-item-explain`이 크기·간격, `App.jsx`의 `ConfigProvider token.colorError`가 색을 맡아요. `colorError`는 `theme.css`와 같은 리터럴 값이에요.
2. `FormField` (`components/common/FormModal.jsx`, 문의 모달 등) → 컴포넌트가 직접 렌더해요.

검증 문구는 토스트로 띄우지 않아요. 토스트는 `저장됐어요` 같은 결과 통보용이에요.

### useFormErrors와 lint

`hooks/useFormErrors.js`는 `errors` state + `clearError` + 틀린 칸을 전부 모으는 `validate`를 제공해요.

```jsx
const { errors, validate, clearError, resetErrors } = useFormErrors();

if (!validate((e) => {                       // early return 금지 — 틀린 칸을 전부 채운다
    if (!storeId) e.storeId = '가게를 선택해주세요.';
    if (!dateRange) e.dateRange = '노출 기간을 선택해주세요.';
})) return;

<FormField label="가게" error={errors.storeId}>
    <FormSelect onChange={(v) => { setStoreId(v); clearError('storeId'); }} />
</FormField>
```

`eslint.config.js`의 `no-restricted-syntax` 규칙은 `message.warning`/`error`의 인자가 "○○을 입력/선택/업로드/동의해주세요" 또는 "…필수예요" 꼴이면 실패시켜요.

### 어느 방식을 쓸지

| 상황 | 쓸 것 |
|---|---|
| `<Form>` 안의 칸 | `Form.Item` 의 `rules` |
| `<Form>` 안이지만 Form 필드가 아닌 값(업로드 파일, 지도 좌표 등) | `form.setFields([{ name, errors: ['...'] }])` |
| `<Form>` 밖의 폼(`FormModal`·`FormField`) | `useFormErrors` + `<FormField error={...}>` |
| `FormField`로 감쌀 자리가 없는 곳(별점, 약관 체크박스 묶음) | `<span className="reserve-field-error" role="alert">` 직접 |

- 한 칸에 두 방식을 섞지 않아요.
- 같은 검증을 두 군데 두지 않아요.

## 페이지네이션

| 성격 | 화면 | 방식 | 구현 |
|------|------|------|------|
| 탐색 결과 | 가게 목록(`/stores`) | 서버 페이지네이션, 기본 12건 | `useStoreList.js` (`useQuery`) + AntD `Pagination` |
| 관리 | 관리자 패널 전 탭 | 서버 페이지네이션 | `DataTable` + `total` |
| 관리 | 사장님 예약 관리 | 서버 페이지네이션, 기본 15건 | `ReservationCard` + AntD `Pagination` |
| 관리 | 사장님 광고 관리 | 서버 검색·가게 필터·페이지네이션, 기본 20건·최대 100건 | `DataTable` + Spring Page |

- URL은 `page=2`처럼 1부터, 서버 요청은 `page=1`처럼 0부터 시작해요. `size`를 명시해요.
- 키워드·분야·정렬·좌표가 바뀌면 첫 페이지로 가고, 페이지 이동은 다른 조건을 유지해요.
- 페이지별 query key를 분리해요.
- `page.totalElements`/`page.totalPages`와 평탄 응답을 모두 읽어요.
- 결과가 줄거나 잘못된 URL이면 유효 페이지로 replace해요. 조회 실패는 0건과 구분해요.
- 페이지 클릭은 맨 위로 이동해요.
- 번호 면은 PC 32px·모바일 30px이고, 모바일은 `showLessItems`·`size="small"`에 페이지 크기 선택을 숨겨요.
- 사장님 예약 관리의 `useManageReservations` query key에는 `page`, `size`, `search`, `status`, `storeId`가 들어가요. 요청사항도 검색 대상이고, 동일 생성 시각은 id로 보조 정렬해요.
- 사장님 광고 관리는 `page`·`size`·검색어·가게 필터를 보내고 `page.totalElements`를 전체 건수로 써요.
- 운영자용 목록은 `DataTable`을 쓰고, 서버 페이지네이션이면 `total`을 넘겨요.

### 목록 상태 보존

- 결과를 다시 찾는 데 필요한 상태는 URL에 둬요: `page`, 검색어, 가게·상태·정렬 필터, 사업자 통계의 가게·기간, 광고 목록의 가게·검색어.
- 한 화면의 여러 목록은 `reservation*`, `statistics*`, `advertisement*`처럼 이름을 나눠요.
- 카드/목록 보기는 URL `view`가 우선이고, 없으면 `useViewModeParam`이 경로별 `sessionStorage`의 마지막 보기를 복원해요.
- 진행 중인 작업이나 민감한 값(광고 신청·수정 폼, 모달, QR 스캔, 비밀번호·파일·위치)은 저장하지 않아요.

## 규칙

- UI에 텍스트 이모지를 쓰지 않아요. 아이콘은 AntD 아이콘을 써요.
- 색상·크기는 토큰을 써요(`style={{ color: colors.text.primary }}`).
- 업로드 이미지 URL은 `getImageUrl()`/`getThumbnailUrl()`로 처리해요. 정적 자산은 `/images/…` 경로를 써요.
