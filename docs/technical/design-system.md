# 디자인 시스템

Ant Design 위에 얹은 RESERVE의 디자인 토큰, 공통 컴포넌트, 화면 패턴 규칙을 모았어요.

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

`colors.*`의 실제 값은 hex가 아니라 `var(--c-..., fallback)` 문자열이에요.

- 포인트 색의 런타임 정본은 `hooks/useTheme.js`의 `ACCENT_OPTIONS`이고, `theme.css`의 기본 블루는 첫 페인트용 fallback이에요. 두 기본값은 라이트·다크 모두 같게 유지해요.
- 사용자가 포인트 색을 바꾸면 `applyAccent`가 CSS 변수와 AntD `colorPrimary`를 같은 리터럴 표로 함께 갱신해요.

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

### 반경(radius) 스케일 규칙

반경은 취향이 아니라 요소 크기로 정해요. 눈에 보이는 둥글기는 `반경 ÷ 요소 크기`라서, 같은 24px도 작은 배지에선 알약이 되고 큰 패널에선 거의 직각으로 보여요.

| 쓰는 값 | 대상 | 기준 |
|---|---|---|
| `radius.sm` (4px) | 태그·아주 작은 칩 | 높이 ~24px 이하 |
| `radius.md` (10px) | 작은 버튼·인풋 내부 요소·썸네일 | 높이 ~40px |
| `radius.lg` (14px) | **입력 필드** (`heights.input` 54px) | 폼 필드는 전부 여기 |
| `radius.xl` (16px) | **Button** | 손으로 만지는 표준 크기 |
| `radius['2xl']` (20px) | 모달·시트·중간 패널 | 화면 폭의 일부를 차지 |
| `radius['3xl']` (24px) | **히어로 섹션·지도·전폭 패널만** | 화면 폭을 거의 다 쓰는 것 |
| `radius.full` (50%) | 아바타·원형 아이콘 버튼 | 정사각형 요소 |
| `radius.pill` (100px) | 세그먼트·필터 알약 | 가로로 긴 요소 |

1. **숫자를 직접 쓰지 않아요.** `borderRadius: 16`이 아니라 `radius.xl`, `'50%'`가 아니라 `radius.full`이에요. 원시값이 아직 일부 남아 있지만 새 코드에서는 쓰지 않아요.
2. **`3xl`은 큰 것에만 써요.** 카드·버튼에 24px을 쓰면 `xl`(16px)로 맞춘 나머지 화면과 어긋나요. 더 둥글게 하고 싶으면 한 단계만 올려요.
3. **인접한 요소는 같은 단계이거나 한 단계 차이여야 해요.** 안쪽이 바깥쪽보다 더 둥글면 안 돼요.

`components/common/Card.jsx`의 목록 카드는 의도적으로 `borderRadius: 0`인 각진 사각형이에요. `radius.xl`의 예외가 아니라 별도 카드 형태이고, `Card.Add`도 같은 0을 써요.

> 반경은 관문 컴포넌트로 강제하기 어려워서 표를 보고 고르게 해요. 화면마다 곡률이 달라진 걸 나중에 되돌리는 비용이 훨씬 커요.

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

- 모든 `Button`은 `.reserve-btn:focus-visible` 공통 링(본문 보조색 2px)을 써요. 호출부에서 `outline: none`을 넣거나 키보드 포커스 스타일을 덮지 않아요.
- 로딩 중에는 네이티브 `disabled`와 `aria-busy`가 함께 적용돼요.
- `size="sm"`(36px)의 채움·테두리 변형은 좌우 여백을 공통 버튼 한 곳에서 줘요: primary·danger 24px, outline·secondary 20px. 공통 폼 모달 푸터와 같은 값이에요.
- 패널 안의 저장·취소 한 쌍(예: 사업자·관리자 › 자동 응답)은 모달 푸터와 같은 `outline sm` + `primary sm`, 8px 간격, 오른쪽 정렬이에요. 44px(`md`)·56px(`lg`)는 가게 등록 같은 페이지 단위 폼의 주 행동에 써요.

### CopyableText

```jsx
import CopyableText from '../components/common/CopyableText';

<CopyableText value={merchantUid} label="주문번호" />
```

주문번호·예약번호·이메일처럼 값을 복사해야 하는 표시는 이 컴포넌트만 써요.

- 값이 없으면 복사 버튼을 그리지 않고, 있으면 같은 AntD 아이콘·40px 클릭 면·완료 안내를 줘요.
- `Typography`의 `copyable`과 화면별 복사 버튼은 금지예요.
- 지연 화면의 공통 바렐 의존을 늘리지 않도록 직접 import해요.

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

모든 입력 필드는 `variant="filled"`, `border: none`, `backgroundColor: colors.gray[50]`, `borderRadius: radius.lg`, `height: heights.input`, `fontSize: 16px`이에요. 호출부 `size` prop과 무관하게 `.reserve-form-field` 클래스가 전역으로 강제해요.

- `FormInput.WithButton`도 같은 클래스를 통과해요. 결합 버튼은 보이는 문구를 접근 가능한 이름으로 쓰고, 로딩 중 `aria-busy`를 전달해요.
- **포커스**는 `components-and-forms.css`의 포커스 규칙 한 곳(`.reserve-form-field`·`.reserve-form-select`·시간 선택·날짜 선택 버튼)에서 1px 중간 회색(`gray-500`) 안쪽 테두리로 보여요. 흰 면 대비 3:1을 넘겨요. 호출부에서 포커스 색을 따로 칠하지 않고, 오류 상태의 빨간 링은 덮지 않아요.

입력창 옆 실행 버튼은 용도별로 두 패턴이고, 모양을 억지로 맞추지 않아요.

| 용도 | 패턴 |
|---|---|
| 문구가 필요한 폼 실행 (인증코드 발송 등) | `FormInput.WithButton` — 필드 높이 전체에 붙은 버튼 |
| 아이콘만 필요한 실행 (메시지 전송) | 채팅 입력 껍데기 안쪽 44×44px·10px 모서리 버튼 |

고객·관리자 채팅 전송 버튼의 크기·반경·상태색·키보드 포커스는 `.reserve-chat-send` 한 관문에서 관리해요. 화면별 인라인 크기나 hover 색을 두지 않고, 입력 껍데기 포커스는 중립 테두리(클릭 시 파란 halo 없음)예요. 아이콘 버튼에는 접근 가능한 이름을 붙이고 비활성·전송 중 상태를 유지해요.

#### StoreForm 모바일 밀도

등록·수정 공통 `StoreForm`은 작업 화면 패턴의 예외예요.

- 768px 미만에서만 44px 액션 높이·10px 모서리, 필드 간격 12px·라벨 아래 8px, 라벨 최소 22px을 써요.
- 짧은 정책 필드만 두 칸으로 묶고, textarea·달력 포털·다른 Core 폼은 축소하지 않아요.
- AntD 6 Select는 높이와 24px 글자 줄 높이 변수를 함께 맞춰요.
- 768–899px은 주요 한 열, 900px 이상은 두 열이고, 900–1023px에서는 시간 범위 행만 세로예요.

#### 날짜 선택 표면

날짜 필드는 AntD 값 계약(dayjs, `value/onChange`, `disabledDate`)을 유지하고, 달력 표면은 `FormDatePicker`가 직접 그려요. 운영 기간·임시 휴무일·광고 기간이 모두 이 관문을 지나므로 화면마다 원시 DatePicker 팝업을 만들지 않아요.

- 한 날짜는 선택 즉시 닫고, 여러 날짜·기간은 하단 완료 버튼으로 확정해요.
- 기간 선택은 시작/종료 칸과 범위 강조를 함께 보여 주고, 한쪽만 허용하는 `allowEmpty`도 보존해요.
- 편집 중인 시작/종료 칸은 얇은 회색 1px(`gray-400`) + 회색 면이에요. 선택 날짜는 회색 면(`gray-200`)+진한 글자, 기간 사이는 옅은 회색(`gray-100`)이에요. 예약 달력·시간 칩과 같은 무채색 규칙이라 primary를 쓰지 않아요.
- 오늘은 외곽선을 더하지 않고 작은 중립 점으로 표시해요.
- 월·연도 이동, 오늘 표시, 일요일 색, 비활성 날짜, 모바일 좌우 swipe를 공통 제공해요.
- 날짜 버튼에는 전체 날짜의 접근 가능한 이름과 선택 상태가 있고, 모달은 제목과 연결해요. 모션 축소 환경에서도 선택 의미가 애니메이션에 의존하지 않아요.

### FormModal

```jsx
import { FormModal, FormField } from '../components/common';

<FormModal title="문의하기" open={open} onClose={onClose} onSubmit={handleSubmit} submitting={sending}>
    <FormField label="제목"><FormInput ... /></FormField>
    <FormField label="내용"><FormTextArea ... /></FormField>
</FormModal>
```

문의하기·메일 작성 같은 "작성해서 제출" 모달의 공용 뼈대예요. 기본 너비(520px)·타이틀·취소/제출 버튼·필드 세로 간격을 한 곳에서 관리해요.

- 다단계 폼은 `Modal`에 `key`를 주지 않아요(언마운트로 닫힘 애니메이션이 사라져요). 대신 `scrollResetKey`에 현재 단계를 넘겨 다음 단계가 항상 맨 위에서 시작하게 해요.
- AntD popup 기준 레이어는 `spacing.js`의 `zIndex.modal`(1100)로, 헤더와 메신저 실행 버튼보다 위예요. `App.jsx`의 `zIndexPopupBase` 한 곳에서 적용해요.

**확인 모달**은 `useMessage.confirm`의 `reserve-confirm-root` 관문을 써요. AntD 6 포털 패널은 좌우 16px·safe-area·`100svh` 안에 들어가고, 긴 본문만 스크롤하며 버튼 행은 최소 44px로 분리해요. 옵션·콜백·disabled·문장 줄 나눔은 유지하고, 이 규칙을 원시 modal 전체나 `FormModal`에 전파하지 않아요.

### PageContainer

```jsx
import { PageContainer } from '../components/common';

<PageContainer size="sm" />   // 420px — 폼 페이지
<PageContainer size="md" />   // 700px — 상세 페이지
<PageContainer size="lg" />   // 1000px — 관리 페이지
<PageContainer size="xl" />   // 1200px — 목록 페이지
```

기본 `boxSizing: 'border-box'`로 좌우 패딩을 `width: 100%`와 최대 너비 안에 포함해요. 호출부마다 모바일 overflow를 숨기지 않고 이 관문에서 너비를 관리해요.

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

- 페이지 이동은 카드 `onClick`이 아니라 실제 `Link`로 표현해요. 새 탭·주소 복사·스크린리더 링크 의미가 유지돼요.
- `Card onClick`은 이동이 아닌 동작용 호환 경로예요. `role="button"`, `tabIndex`, Enter/Space 활성화를 자동 제공하고, 안에 다른 버튼·링크를 중첩하지 않아요. `Card.Add`는 네이티브 `<button>`이에요.
- 계정 메뉴·프로필 이미지 선택·모달/채팅 닫기 같은 동작 컨트롤도 네이티브 `<button>`을 써요. 마우스 `:focus` 외형은 지워도 `:focus-visible` 링은 반드시 복구해요.
- 승인·취소 버튼이 있는 `ReservationRow`는 행 전체를 버튼으로 감싸지 않고, 상세 열기를 썸네일·가게명 네이티브 버튼으로 제공해요.

> 주의: `AdBanner`는 캐러셀 점이 실제 버튼이라 배너 전체를 버튼으로 감쌀 수 없어요. `div role="button"` + Enter/Space + 명시적 포커스 링을 쓰는 복합 컨트롤 예외이니 일반 카드에 복사하지 마세요. 구조를 바꿀 땐 캐러셀 컨트롤과 가게 링크를 형제로 분리해요.

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

사용 가능한 Skeleton: `StoreCardSkeleton`, `ReservationCardSkeleton`, `MyReservationCardSkeleton`, `ReviewCardSkeleton`, `StoreDetailSkeleton`, `AdminTableSkeleton`, 저수준 `Bone`

### DataState — 조회의 빈 결과와 실패

```jsx
import { DataState } from '../components/common';

if (isError) {
    return <DataState state="error" kind="reservation" subject="예약 목록"
        error={error} onRetry={refetch} retrying={isFetching} />;
}

if (items.length === 0) {
    return <DataState state="empty" kind="reservation" title="예약 내역이 없습니다." />;
}
```

`DataState`는 읽기·목록 조회의 표시 관문이에요. 빈 결과는 회색 도메인 아이콘과 안내, 실패는 상태별 회색 AntD 아이콘·사용자 안전 문구·회색 `다시 불러오기`를 보여요. 서버 원문 오류·스택·권한 세부는 화면에 내지 않고, `listErrorMessage`가 HTTP 상태를 문구와 아이콘 의미(`offline`, `forbidden`, `missing`, `rateLimited`, `retry`, `unavailable`)로 정규화해요.

- 한 화면의 독립 조회가 모두 실패하면 상위 영역의 `DataState` 하나로 합쳐요.
- 결과가 나올 자리에 둬요. 제목 아래나 탭 헤더와 툴바 사이에 오류 띠를 끼우지 않아요. 첫 실패는 `제목 → 필터/새로고침 → DataState` 순서이고, 이전 결과가 남은 재조회 실패만 그 결과 바로 위에 `compact`로 둬요.
- 일부 조회만 실패하면 성공한 데이터를 지우지 않고 해당 영역에만 `compact` 상태를 둬요.
- 상세 페이지도 같아요. 없는 항목은 빈 상태 아이콘, 조회 실패는 오류 아이콘과 재시도로 구분해요.
- 조회 재시도는 항상 중립 `다시 불러오기`이고, 요청 중에는 같은 자리에 `SyncOutlined` 회전 아이콘을 보여요(일반 로딩 링으로 바꾸지 않아요). 툴바 전체 갱신은 `RefreshButton`의 `새로고침`이고 그 화살표도 요청 중 회전해요. 같은 화면 상태를 다시 재생하는 동작은 `label`만 바꿔 같은 버튼을 써요. 등록·결제·삭제처럼 새 작업을 보내는 버튼에는 적용하지 않아요.
- 폼 검증, 제출/결제 mutation 실패, 카메라·위치 같은 장치 실패에는 `DataState`를 쓰지 않아요.

ESLint가 AntD `Alert`·`Empty`의 직접 import를 막아요. 결제 결과처럼 거래 확정·미확정을 보여 주는 화면은 도메인 전용 상태 화면을 써요. 이 제한은 테스트의 AntD mock이나 저장된 데이터의 부분 갱신 안내를 대체하지 않아요.

오류는 백엔드 HTTP 응답 → `axios`의 안전한 오류 객체 → React Query/훅의 `error` → `DataState` 순으로 흘러요. 같은 조회 실패를 전역 토스트로 한 번 더 띄우지 않아요.

### ChartCard

차트만으로 값을 전달하지 않아요. `ChartCard`에는 짧은 `summary`, `tableColumns`, `tableRows`를 함께 넘겨요. 제목은 의미 있는 `h3`, 원본 수치는 접을 수 있는 실제 `<table>`이고, 표가 있으면 시각 차트 영역은 `aria-hidden="true"`예요.

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

정상 0건과 조회 실패는 달라요. 실패한 데이터로 빈 차트를 만들지 않고, 부분 실패면 `compact` `DataState`로 실패한 source만 표시해요.

### FavoriteButton

```jsx
<FavoriteButton storeId={id} />
<FavoriteButton storeId={id} initialStatus={true} />
```

`aria-label`, `aria-pressed`, 로딩 중 `aria-busy`를 주는 토글 버튼이에요. 호출부는 `title`로 이름을 대신하지 않아요.

## 상호작용

### Hover · 누르는 동안 · 선택 상태

일반 탐색을 hover했다고 브랜드 파란색으로 바꾸지 않아요. 브랜드 액션의 기존 색, 선택·오류·즐겨찾기 상태, 키보드 포커스 링은 별개예요. `primary.dark` 설명에 hover가 있다고 모든 링크를 파랗게 하라는 뜻은 아니에요.

| 대상 | Hover | 누르는 동안 (`:active`) | 누른 뒤의 상태 |
|---|---|---|---|
| 공통 primary / secondary / outline 버튼 | 기존 색 유지, 투명도 또는 중립 테두리·면 변화 | `scale(0.96)` + 투명도; 메신저 홈 문의 CTA는 `scale(0.98)` | 동작 결과/로딩은 기존 컴포넌트가 관리 |
| ghost / link 버튼 | 기존 글자색 유지, 투명도 변화 | `scale(0.94–0.96)` + 투명도 | 링크·액션 의미 유지 |
| 헤더 검색 아이콘 / 뒤로가기 / RESERVE 워드마크 | 중립 면 또는 투명도 변화 | 뒤로가기는 왼쪽 180ms 피드백 후 이동. 워드마크는 움직이지 않고 즉시 이동하며, 탐색 탭 밖에서 오면 도착한 홈이 왼쪽에서 들어옴 | 기존 전용 검색 진입·PC/모바일 뒤로가기 |
| 프로필 사진 / 홈 3D 바로가기 / 추천 사진 카드 | 중립색 유지; 홈 이미지·추천 카드만 2px 상승 | 기존 `scale(0.94–0.97)` | 사진/물체의 눌림만 보존 |
| 메신저 footer의 홈·대화·설정 | 배경 투명, 비활성 아이콘만 중립색으로 강조 | 이동·축소 없이 명암만 변화 | 활성 화면은 primary 아이콘·라벨, `aria-current=page` |
| 메신저 X·뒤로가기·새로고침 | 투명한 44×44 영역에 옅은 회색 면·중립 전경 | 이동·축소 없이 명암만; 조회 중 새로고침은 무반응 | 화면 닫기·돌아가기·목록 다시 조회 |
| 메신저 문의 질문 | 중립 글자·테두리와 옅은 회색 면 | 축소 없이 명암만 | 선택 문구는 입력 초안에 추가 |
| 홈 탭·지역·현재 위치·전체 보기·공지 텍스트 | 중립색 또는 투명도 | 크기·위치 변화 없이 명암 | 탭은 진한 글자 + 밑줄; 위치는 명시적 클릭에서만 요청 |
| 홈 scroll-snap 메인 배너 | 투명도만 변화 | 크기·위치 변화 없이 투명도 | 배너·트랙 scale 금지, snap 좌표 보존; 작은 3D/사진과 구분 |
| 전용 검색 화면 | 기존 중립색·회색 면 | 기존 소형 컨트롤 정책 | 헤더 UI 변경을 검색 폼·Core 전체에 전파하지 않음 |
| 입력 없는 종류·정렬 메뉴 (`FilterMenu`) | 흰 면(다크 paper) 또는 투명 면, 중립 테두리/면 강조 | 크기 변화 없이 중립 면 변화 | 중립 선택 면 + 체크; 열림은 꺾쇠로 표시 |
| 일반 가게 카드 | 원래 중립 그림자 + 사진 `1.05` 줌, 글자색 유지; 공개 탐색의 hoverable 카드만 2px 상승 | 내부 이동 링크 `scale(0.98)` | 카드 크기·사진 원본 비율 유지 |
| 즐겨찾기 | 사진 위 오버레이는 흰 면·그림자 유지; `StoreCard`·`StoreListRow` 정보 영역은 면 없는 하트만 | `scale(0.94)` | `aria-pressed`와 빨간 하트가 선택을 표현 |
| pill tabs / SegmentedControl / 페이지네이션 | 회색 면 + 진한 글자 | 기존 소형 컨트롤의 눌림 규칙 | 회색 선택 면 / 진한 글자; 일반 AntD tabs 선택색과 구분 |
| 날짜·시간 선택 | 회색 hover | 선택 셀의 기존 표현 | 선택 날짜·시간은 회색 면(`gray-200`)+진한 글자. primary 없음 |

- 2px 상승은 hover 가능한 fine pointer이면서 모션 감소가 꺼진 환경에만 적용해요. 헤더·탭·필터 트리거와 열린 메뉴는 움직이지 않아요.
- 비활성·응답 대기 중에는 실제 클릭과 눌림 효과를 막아요.
- 공통 버튼에 평상시 인라인 `opacity: 1`을 넣지 않아요. 전역 hover/active 투명도를 덮어 피드백을 죽여요.

### 포커스와 선택 테두리

| 상태 | 표시 |
|---|---|
| 키보드 포커스 링 (`:focus-visible`) | 본문 보조색 2px. 공통 버튼·카드 링크·즐겨찾기·달력 칸·차트·헤더·탭·메신저·`FilterMenu`·AntD 모달 닫기 X 모두 같아요 |
| 입력칸 포커스 (입력·선택·날짜·검색·채팅 입력) | 1px 중간 회색(`gray-500`) |
| 선택·편집 중 (등장 효과 카드, 지역 시트 인기 지역, 기간 선택 시작/종료 칸) | 얇은 회색 1px(`gray-400`) + 회색 면. 검정·진한 회색 테두리는 쓰지 않아요 |

- 키보드 포커스 링은 Tab 이동에만 보이고 마우스 클릭·hover·메뉴 터치에는 붙이지 않아요.
- 텍스트 입력은 클릭만으로도 `:focus-visible`이 될 수 있어서 목록 메뉴의 판정에 쓰지 않아요.
- 선택 상태(달력 날짜·시간 칩·등장 효과 카드·관리자 메일 목록·지역 시트)는 회색 면 또는 중립 테두리예요. primary는 제출·결제 같은 실행 버튼과 현재 위치 표시에만 써요.
- 모션 감소에서도 상태색·포커스는 유지해요.

### 모션 축소

전역 `useReducedMotion` 훅과 `@media (prefers-reduced-motion: reduce)`를 함께 써요.

- CSS 이동·확대·깜빡임은 미디어쿼리에서 끄고, 타이핑 루프·부드러운 스크롤처럼 JS가 만드는 움직임은 훅으로 멈춰요.
- 홈은 첫 문구를 완성된 상태로 고정하고 reveal 요소를 즉시 보여요.
- 로딩 스피너처럼 진행 상태를 전달하는 움직임은 없애지 않고 속도만 완화할 수 있어요.

### 화면 전환 모션

- 화면 이동 피드백은 120–180ms 안에서 끝내요. 공통 라우트는 헤더·탭을 멈춘 채 도착한 콘텐츠만 움직여요.
- 일반 진입·앞으로가기는 오른쪽, 뒤로가기·직접 진입 fallback은 왼쪽에서 들어와요. 최상위 탐색 탭은 탭 순서로 방향을 정해요.
- 홈 이동(RESERVE 워드마크)은 로고를 움직이지 않고 도착한 홈만 왼쪽에서 들어와요.
- 전용 검색은 검색 내용만 PC 8px·모바일 24px을 220ms 동안 위로 들이고, 취소·Escape는 반대로 닫아요. 입력창·헤더는 고정하고 포커스를 유지해요.
- 홈 배너는 scroll-snap으로 슬라이드 전체를 이동시키고, 사진·문구를 따로 재등장시키지 않아요.
- 같은 pathname의 필터·정렬·보기 전환, 데이터 로딩 스켈레톤, 카드↔가로 행 전환에는 새 애니메이션을 넣지 않아요. 배너 목적지의 필터·결과와 목록의 이전·다음 페이지 이동은 별도 국소 패턴이에요.
- 두 라우트를 동시에 움직이는 View Transition은 현재 `BrowserRouter` 셸에서 구현하지 않아요.
- 모션 감소 설정에서는 즉시 이동·표시해요.

### 검증 하네스

```bash
npm run test:run -- src/components/chat/MessengerInteractionPolicy.test.js
npm run test:e2e -- e2e/interaction-patterns.spec.js e2e/search-motion.spec.js
npm run build
```

- 첫 줄은 메신저 상태 규칙, 둘째 줄은 PC·모바일 모의 Chromium의 hover·눌림·키보드 포커스·모션 감소를 검사해요.
- `npm run build`의 postbuild 번들 예산이 앱 셸의 정적 의존성 증가를 막아요.

> 주의: 기존 `test:policy`는 아직 위 브라우저 검사를 실행하지 않아요. CI 관문 연결과 남은 업무 화면·실제 Safari 검증은 후속 범위예요.

### 집중형 작업 화면

사업자·관리자·메시지처럼 한 작업에 집중하는 화면의 규칙이에요. 공개 탐색·예약 화면에 앱 사이드바를 추가하라는 뜻은 아니에요.

- 데스크톱 작업 내비게이션은 고정 폭 264–280px 안에 제목·아이콘·짧은 라벨만 둬요. 활성 항목은 옅은 회색 면 + 진한 글자이고, 한 화면에 활성 면은 하나예요.
- 기능 아이콘은 AntD의 같은 선형 계열만 쓰고 기본 20px이에요. 텍스트가 있는 버튼의 아이콘은 장식으로 숨기고 라벨이 접근 가능한 이름이 돼요. 이모지나 다른 아이콘 세트를 섞지 않아요.
- 한 화면에 주 동작은 하나예요. 빈 작업 면에는 한 줄 안내와 다음 행동 하나만 둬요.
- 입력·작성 면은 큰 둥근 중립 테두리, 아주 약한 그림자, 1px 중립 포커스(`.reserve-form-field:focus-within`)예요. 브랜드 파랑은 제출·선택 완료·현재 위치처럼 결과를 바꾸는 행동에만 써요.

## 공개 탐색 패턴

### 헤더

PC·모바일 공통 헤더는 `뒤로가기(탐색 루트 밖) — 전체 RESERVE 워드마크 — 오른쪽 검색 아이콘·둥근 프로필 사진`이에요.

- 워드마크는 Pretendard·22px·850 굵기·-0.8px 자간이에요.
- 높이는 `heights.header` 64px이고, 모든 공통 헤더가 같은 최대 폭·반투명 배경·반응형 여백을 써요. 홈만 따로 덮어쓰지 않아요.
- 검색 아이콘은 44×44px `/search` 진입 링크이고 입력칸·실행 버튼이 아니에요. 추가 예약/찜/알림/메뉴 아이콘은 아직 두지 않아요.
- 검색어가 있는 `/stores` 결과에서만 아이콘 대신 현재 검색어를 보여 주는 pill 링크(검색 화면으로 이동하며 검색어 복원)를 두고, 이때 모바일(768px 미만) 로고만 R로 줄여요.
- 뒤로가기는 이동 직전 180ms 왼쪽 피드백을 주고, 워드마크는 눌림·대기 없이 즉시 이동하거나 홈 최상단으로 스크롤해요. 모션 감소에서는 지연 없이 이동해요.
- 로고/뒤로가기·프로필의 44px 동작 영역, 테마 토큰, 중립 hover·키보드 포커스 링을 유지해요.

### 상단 탭

- `홈 · 탐색 · 혜택 · 웨이팅 · 피드`, 높이 44px이에요. 공통 `DiscoveryNav`를 주요 화면에 한 번 렌더하고 활성 탭은 경로로 판정해요.
- 헤더와 같은 `--c-header-bg`·20px 블러를 쓰고, 배경은 뷰포트 전체 폭, 내용은 최대 1248px에 맞춰요. 중간 경계선 없이 탭 하단에만 선 하나를 둬요.
- 분야·검색 결과 목록, 가게/소식 상세, 계정 화면에서는 탭을 숨기고 헤더 뒤로가기를 제공해요.
- 분류 기준은 `constants/discovery.js` 한 곳에 둬요. 혜택은 실제 가게 소식·안내 목록/상세(쿠폰 아님)이고, 웨이팅·피드는 준비 중 화면이에요.

### 홈

- 패턴 치수는 `feature-surfaces.css`의 `--reserve-home-*` 변수로 관리해요. 최대 폭 1248px, 여백은 모바일 20px(아주 좁으면 16px)·태블릿/PC 24px이에요.
- 간격 변수: `--reserve-home-section-spacing: 20px`, `--reserve-home-content-spacing: 16px`, `--reserve-home-divider-size: 4px`. 공통 폼/테이블/로딩 면까지 4px로 바꾸는 규칙은 아니에요.
- 뷰포트는 `100svh` 기준이에요(`dvh` 금지).
- 분야 바로가기는 오리지널 투명 WebP 물체 이미지이고 배경 판·테두리를 붙이지 않아요. 분야별 광학 크기는 `constants/discovery.js`, 홈 전용 바로가기는 `Home/index.jsx`에서 관리해요. 모바일/태블릿 5열, PC는 서비스 6개와 빠른 메뉴 4개의 두 영역이에요.
- 메인 캐러셀은 `picture`로 모바일/태블릿 3:2(원본 960×640), PC(900px 이상) 2.5:1(전용 1600×640) 사진을 골라요. 모바일 사진을 늘리거나 잘라 쓰지 않아요. PC 다음 버튼과 번호는 현재 프레임 안에 둬요.
- 운영 안내는 공지 API를 다시 조회하지 않고, 같은 `picture` 원칙의 사진 링크(`/operation-guide`)를 모바일 3:2·PC 2.5:1로 보여요.
- 페이지 선택은 프로필 메뉴를 쓰고 고정 하단 메뉴·보정 공백은 두지 않아요.
- 홈 추천은 `StoreListRow`를 그대로 써요(주소 없이 목록과 같은 정보·배치·하트). 900px 미만 1열, 이상 2열이고 로딩·0건·실패·재시도를 보존해요.
- 이미지 자산·레이아웃 참고 범위·생성 프롬프트: [home-visual-assets.md](home-visual-assets.md)

### 가게 카드·목록

가게를 사진 카드로 보이는 곳은 전부 `StoreCard`, 한 줄로 보이는 곳은 전부 `StoreListRow`예요. 가게 목록·관심·혜택 가게·광고 미리보기·홈 추천·내 가게 관리가 대상이에요.

- 관리 화면은 같은 컴포넌트에 `actions`(수정·삭제 줄)를 넘기고, 찜이 의미 없는 곳은 `StoreCard showFavorite={false}`로 하트 자리를 비워요. 화면별 복사본 카드를 만들지 않아요.
- `StoreCard`는 원래 공통 카드(각진 모서리·기존 그리드)예요. `Card.Cover`는 `width: 100%; height: auto`로 원본 비율을 유지하고, 페이지별 190px/220px 크롭은 두지 않아요.
- `StoreCard` 정보 영역: 이름과 44px 하트 → 종류·AD·우리동네 일반 텍스트 → 별점. 위아래 12px, 줄 사이 2px이에요. 카드 링크와 하트는 별도 키보드 대상이고, 스켈레톤도 같은 순서예요.
- `StoreListRow`는 PC·모바일 모두 1열, 사진 1:1 면(768px 미만 80px, 이상 96px)·14px 반경·`object-fit: cover`, 정보 간격 12px이에요. 이름 → 한 줄 설명 → 평점(리뷰 수) → 종류·AD·우리동네 순이고 긴 텍스트는 말줄임해요.
- 종류·광고·우리동네는 칩 면 없이 `.reserve-store-identity-text`에서 간격과 줄바꿈을 공유해요. 광고 표시는 공용 `AdMark`(화면엔 옅은 AD, 화면 낭독기엔 '광고')이고 중립 대비·굵기로 구별해요.

### 보기 전환 (`/stores`)

- 분야·정렬 오른쪽 끝의 투명한 44×44px 아이콘 버튼이에요. 다음 보기를 `UnorderedListOutlined`/`AppstoreOutlined`와 접근성 라벨로 표시하고, 중립 hover·키보드 포커스 링·Enter/Space를 유지해요.
- URL에 `?view=cards` 또는 `?view=list`로 명시해요. 값이 없거나 잘못되면 화면 기본값 또는 같은 탭의 마지막 보기로 URL을 보정해요.
- 같은 조회 데이터를 재사용하므로 별도 API를 만들지 않아요. 데이터 스켈레톤 중에는 보기·지역·분야·정렬을 모두 잠가요.

### 가게 목록 필터

- 분야·정렬은 `<FilterMenu appearance="plain" />`로 PC·모바일 모두 오른쪽에 4px 간격으로 두고, 가게 수는 왼쪽에 둬요.
- 큰 제목·소개 없이 필터부터 시작해요. 페이지 `h1`은 공통 visually-hidden으로 유지하고, 본문 상단 여백은 PC 16px·모바일 12px이에요.
- 목록 본문에는 별도 검색창·파란 검색 버튼을 두지 않아요.

### 가게 상세

`StoreIdentity`를 PC·모바일에 똑같이 써요.

- 갤러리 → 가게명(모바일 22px·PC 24px)과 `문의` 보조 액션 → `StoreIdentityText`의 종류·우리동네 → 평점·리뷰 수 → 소개 순이에요. 키워드 배지는 소개 뒤 보조 정보예요.
- 갤러리 위 저장 하트, 사진 미리보기·지도·예약 정보는 유지해요. 문의 클릭 영역은 최소 56×44px이에요.
- 소개를 좁은 정보 표의 한 행에 중복하지 않아요.

### 지역 선택

홈·공개 목록이 같은 `RegionSheet`를 써요.

- 전국 17개 시도는 항상 선택 가능하고, 시군구·인기 바로가기·가게 수는 공개 ACTIVE 가게 주소의 앞 두 토큰에서만 만들어요.
- 시도 → 시군구 한 곳을 골라요. `초기화`는 초안을 전국으로 바꾸고 `적용`이 URL `region`과 결과를 바꿔요. 0건 지역은 빈 결과로 안내해요.
- 대표 사진은 서버가 검증한 공공누리 제1유형 관광정보 API 프록시만 써요. 없거나 실패하면 핀 아이콘이고, 출처는 공개 안내 페이지 하나로 연결해요.
- PC는 높이 최대 700px 중앙 대화상자, 모바일은 최대 86svh 바텀 시트예요. 메신저 런처보다 앞에 두고, 헤더·적용 영역을 고정한 채 두 목록만 독립 스크롤해요.
- 네이티브 버튼 Tab/Enter, Escape·바깥 클릭 닫기, 44px 이상 클릭 영역, 중립 hover·포커스, 모션 감소 시 즉시 전환을 유지해요.
- 지역을 바꿔도 분류/거리 조건은 보존하고 페이지는 1로 돌아가요.

### 검색

실제 검색 입력은 `/search` 전용 화면에만 둬요. 상세는 [search-ui.md](search-ui.md)에 있어요.

- 필드 높이 44px·반경 100px·입력 글꼴 16px·버튼 동작 영역 44px이에요.
- 왼쪽 아이콘은 form 제출 버튼이고 Enter와 같은 처리로 제출해요. 한글 조합 Enter·빈 값·지우기·취소 정책을 유지해요.
- 결과 헤더의 pill은 편집 가능한 input이 아니라 검색어 복원 링크예요.

### 평점 표시

`normalizeStoreRating` 순수 유틸에서 정규화해요. 가게 카드(혜택/관심 포함)·목록형·홈·상세·내 가게·관리자 표 모두 별 아이콘·한 자리 소수·괄호 리뷰 수를 쓰고, 리뷰가 없으면 `0.0 (0)`이에요. 잘못된 값으로 NaN을 표시하지 않아요.

### 혜택 (`/benefits`)

실제 공개 가게 소식만 가로 사진 배너로 보여요. 없는 혜택 종류·지역·유효기간·쿠폰·인기 집계를 추정하지 않아요.

- 배너 구성: 가게 사진 배경 → 짧은 실제 본문 → 큰 가게명 → 실제 소식 제목 티켓이에요.
- `page`는 12건·서버 메타를 쓰고, 조회 상태·AbortSignal·무관한 URL 값을 유지해요. 일반 가게 필터·페이지는 `/stores`에 있어요.
- 최대 1248px, gutter는 모바일 20px(360 미만 16px)·태블릿/PC 24px, 국소 `--reserve-benefit-section-spacing/content-spacing/divider-size`는 20/16/4px이에요.
- 900px 미만 1열·이상 2열이에요. `--reserve-benefit-banner-ratio`의 3.2:1 골격과 `--reserve-benefit-banner-min-height`의 120/164/156px 최소 높이를 grid로 겹쳐 긴 제목이면 자연스럽게 커져요.
- 사진은 absolute·cover이고 왼쪽 그라데이션으로 글자 대비를 확보해요. 배너 크기·위치는 hover/active에 바꾸지 않고, 실제 사진만 fine pointer·모션 감소 OFF에서 1.02 줌해요.
- 허용되지 않은/없는/실패한 사진은 64px 로고이고, 사진 URL이 바뀌면 placeholder 상태를 초기화해요. 스켈레톤도 같은 치수예요.
- `--reserve-benefit-photo-backdrop/photo-fg/ticket-bg`는 사진 위 대비용 고정 브랜드 토큰이고, 나머지 치수는 국소 `--reserve-benefit-banner-padding/store-size/description-size/ticket-size`로 관리해요.

### 광고 작성과 결제 전 미리보기

- 작성 순서는 `추천 문구 → 제목 → 내용`이에요. 추천을 고르면 두 입력을 채우지만 다시 수정할 수 있어요.
- 미리보기는 가게 목록과 같은 컴포넌트(`StoreCard`·`StoreListRow`·`AdBannerSurface`)를 `preview`로 그려요. 하트(`FavoriteButton preview`)와 `AD` 표시까지 실제 목록 그대로이고, 링크·즐겨찾기 동작·노출 집계만 꺼요. 미리보기 전용 카드 틀을 덧씌우지 않아요.
- 노출형(`BADGE`)은 별도 배지 이미지가 아니라 실제 목록 카드·행에 붙는 작은 광고 표시예요.
- 결제 정보는 행마다 상자를 두르지 않은 영수증 목록이에요. 왼쪽 항목·오른쪽 값, 요금은 `하루 금액 × 일수`로 근거를 보이고 합계만 크게 써요. 파란색은 결제 버튼 하나에만 둬요.
- 두 단계 구분은 모달 제목과 하단 동작으로 충분해서 `1 / 2` 같은 진행 문구를 두지 않아요. 모션 재생은 `RefreshButton label="효과 다시 보기"`를 재사용해요.

## 메신저 패턴

- **패널**: PC는 모든 내부 화면에서 420px, 모바일은 공통 64px 헤더 아래 화면이에요. 홈은 사진 커버·관리자 안내 카드·문의 CTA 하나만 둬요.
- **footer**: `MessengerFooter`는 홈·대화·설정 네이티브 버튼, `aria-current=page`, 54px 버튼·약 63px 바닥 면이에요. 스크롤 본문과 분리하고 메시지 입력 중에는 숨겨요. hover 박스 없이 비활성 아이콘만 중립색으로 반응하고, primary는 활성 탭에만 써요.
- **커버**: `MessengerBrandCover`는 RESERVE `/og-image.png`가 기본이고 `coverImageSrc` prop으로 바꿀 수 있어요(설정/업로드 UI는 아직 없어요). 커버 위에 RESERVE 워드마크를 겹치지 않고, 접근성 제목 '메시지'는 sr-only로 유지해요.
- **아바타**: `MessengerAvatar`는 위험 프로토콜·자격증명 URL을 거부하고, 사진이 없거나 실패하면 브랜드 이미지 → 아이콘으로 fallback해요.
- **표시 이름**: SUPPORT 홈·목록·헤더·ADMIN 말풍선은 담당자 계정과 무관하게 `RESERVE 고객지원`과 브랜드 아바타로 고정해요. 회원이 보는 STORE 문의는 가게 이름, 사장님이 보는 받은 문의는 고객 이름이에요. 지원 담당자 이름·사진은 API에 넣지 않고 회원 ID/이메일도 표시하지 않아요.
- **제목 바**: `MessengerListHeading`은 72px 높이에서 제목·44px 새로고침을 가운데 정렬하고, PC 닫기 44px 영역도 같은 높이 변수로 계산해요. 대화·설정 제목은 같은 72px 바, 왼쪽 여백(PC 20px·모바일 16px), 글자 크기, 하단 경계선을 공유해요.
- **대화 목록**: 실제 상대 목록은 `MessengerConversationRow` 관문으로 모아요. 행은 상대 이름과 마지막 실제 메시지 한 줄만 보이고, 소개 문구를 메시지 말풍선으로 위장하지 않아요. 저장된 미리보기가 비면 권한 확인된 현재 페이지의 마지막 메시지를 읽기 전용으로 조회하고, 진짜 빈 방에만 '아직 메시지가 없습니다.'를 보여요.
- **설정**: `MessengerSettings`는 실제 계정·내 정보 관리·기존 알림 설정만 보여요. 없는 번역/알림음 스위치는 만들지 않아요. 사진은 현재 로그인 사용자의 `profileImageUrl`/`profileImage`이고, 없거나 실패하면 이니셜 → 사용자 아이콘이에요. 실제 알림 컨트롤이 있을 때만 환경 섹션과 구분선을 렌더해요.
- **런처**: 흰 브랜드 타일을 라이트·다크에서 유지하는 국소 패턴이에요. 전경은 `--c-messenger-launcher-fg` → `--c-primary-dark`, 배경은 `--c-messenger-launcher-bg` → 흰색이에요. PC 56px/radius 16px·모바일 48px/radius 14px, 중립 hover 들림/active 눌림·focus-visible·reduced-motion을 유지해요. 닫힌 런처는 `/icons/R_logo.png`를 이미지 prop으로 쓰고, 열린 PC 패널의 X·fallback·접근성 이름은 `MessengerLauncherVisual`/`MessengerShell`이 맡아요. 로고 교체를 지원방 아바타·상단 프로필에 전파하지 않아요.

## Import 패턴

```js
import { Button, FormInput, PageContainer, Card, Loading } from '../components/common';
import { useMessage, useStoreData, useReservations } from '../hooks';
import { API_ENDPOINTS, STORE_CATEGORIES, RESERVATION_STATUS_LABELS } from '../constants';
import { getImageUrl, getThumbnailUrl, formatDate, formatCurrency } from '../utils';
import { colors, radius, fontWeight, fontSize, heights } from '../styles/tokens';
```

## 꺾쇠·화살표 회전 규칙

**규칙: 왕복 180°.** 펼치면 시계방향으로 180°, 접으면 같은 길을 반시계로 되돌아와요.

| 대상 | 구현 위치 | 회전 대상 |
|---|---|---|
| 드롭다운 꺾쇠 (Select) | `styles/global/foundation.css` → `.ant-select-open .ant-select-suffix` | `span.ant-select-suffix` |
| 아코디언 화살표 (FAQ) | `styles/global/feature-surfaces.css` → `.ant-collapse-item-active .ant-collapse-arrow` | `span.ant-collapse-arrow` |

둘 다 svg가 아니라 span을 돌려요. 상태는 AntD 클래스(`.ant-select-open` / `.ant-collapse-item-active`)로 판정하니 React 상태가 필요 없어요. Material·iOS·Bootstrap·AntD 기본값이 모두 왕복이고, 꺾쇠는 방향 지시자라 되돌아오는 게 의미에 맞아요.

### 닫힘 상태에 `rotate(0deg)`를 명시해요

```css
.faq-collapse .ant-collapse-arrow            { transform: rotate(0deg); }   /* ← none 이면 안 된다 */
.faq-collapse .ant-collapse-item-active
  .ant-collapse-arrow                        { transform: rotate(180deg); }
```

> 주의: `transform: none` ↔ `rotate(180deg)`는 각도가 아니라 행렬 보간이에요. 정확히 180°는 방향이 정해지지 않는 퇴화 케이스라 엔진이 임의로(보통 반시계) 골라요. 두 끝값을 모두 각도로 두면 시계방향이 보장돼요.

### 되돌리기 — "항상 같은 방향으로 연속 회전"으로 바꾸려면

한 번 구현했다가 왕복으로 되돌린 방식이에요. 두 번 누르면 360°가 완성되고 회전이 끊기지 않아요. CSS transition은 두 상태를 오가는 것이라 왕복만 표현할 수 있어서, 단방향 연속에는 토글 횟수 상태가 필요해요.

**1) `FaqSection.jsx`의 CSS에서 회전 선언 두 개를 지워요.** `transition`과 `transform-origin`은 남겨요. CSS에 `rotate(...)`가 남으면 인라인 회전과 겹쳐 각도가 두 배가 돼요. 회전의 출처는 한 곳이어야 해요.

**2) 컴포넌트에 토글 횟수 상태를 넣어요.**

```jsx
import { useState } from 'react';

// 한 번 토글할 때 돌아가는 각도. 부호가 곧 방향이다(양수 = 시계, 음수 = 반시계).
const ROTATION_STEP = 180;

const [turns, setTurns] = useState({});        // { [panelKey]: 누적 토글 횟수 }
// accordion 이라 열린 패널은 최대 하나. onChange 는 "열린 키"만 주므로,
// 무엇이 닫혔는지 알려면 직전 활성 키를 따로 들고 있어야 한다.
const [activeKey, setActiveKey] = useState();

const handleChange = (key) => {
    const next = Array.isArray(key) ? key[0] : key;
    setTurns((prev) => {
        const t = { ...prev };
        const bump = (k) => { if (k != null) t[k] = (t[k] ?? 0) + 1; };
        if (activeKey != null && activeKey !== next) bump(activeKey);  // 닫히는 패널
        if (next != null) bump(next);                                 // 열리는 패널
        return t;
    });
    setActiveKey(next);
};
```

**3) `<Collapse>`를 제어 모드로 바꾸고 `expandIcon`에서 각도를 줘요.**

```jsx
<Collapse
    activeKey={activeKey}
    onChange={handleChange}
    /* panelKey 는 rc-collapse 가 Panel props 로 넘겨준다
       (@rc-component/collapse/es/Panel.js — expandIcon(props) 에 props 전체가 들어온다) */
    expandIcon={({ panelKey }) => (
        <DownOutlined style={{
            fontSize: 12,
            color: colors.text.tertiary,
            transform: `rotate(${ROTATION_STEP * (turns[panelKey] ?? 0)}deg)`,
        }} />
    )}
    /* ...나머지 props 동일 */
/>
```

- 각도 값은 계속 커지지만(180, 360, 540 …) 180°마다 같은 모습이라 문제없어요.
- 방향을 뒤집으려면 `ROTATION_STEP`의 부호만 바꿔요.
- 드롭다운 꺾쇠까지 통일하려면 `FilterSelect`/`FormSelect`에 같은 카운터를 넣어요(`onDropdownVisibleChange`로 토글을 세고 인라인 `transform`을 줘요). 관문 컴포넌트라 두 파일만 고치면 전 화면에 적용돼요.
- 정석에서 벗어난 선택이에요. 왕복으로 돌아갈 때는 `turns`/`activeKey`/`handleChange`와 `useState` import를 함께 지워요.

## 입력 Select와 목록 메뉴 — 컴포넌트로 강제한다

| 컴포넌트 | 모양 | 언제 쓰나 |
|---|---|---|
| **`FormSelect`** | 채움형 회색 (`gray[50]` / 다크 `#23262b`), 높이 54px | **값을 적어 넣는 칸.** 가게 등록 카테고리, 마이페이지 글꼴, 광고 등록 |
| **`FilterSelect`** | 흰 면 + 옅은 테두리 (다크 `#1e2126`), `size="large"` | **목록을 조작하는 도구.** 별점순, 예약관리·광고관리 필터, 통계 가게 선택 |
| **`FilterMenu`** | 입력 없는 네이티브 버튼 + Dropdown. 작은 흰 pill 또는 투명 텍스트 메뉴 | **간단한 탐색 선택.** 공개 가게 목록의 서비스 분야·정렬 |

`FormSelect`는 다른 Form 컴포넌트와 같은 톤·높이예요. 입력칸이 아닌 것을 채움형으로 칠하면 폼처럼 보이고, 입력칸을 흰 면으로 두면 옆 입력들과 어긋나요. 두 갈래인 게 정상이에요.

**`FilterMenu` 치수와 동작**

| 항목 | 값 |
|---|---|
| 트리거 | 보이는 면 32px, 동작 영역 44px, 반경 100px, 글자 13px/행 높이 20px |
| 드롭다운 | 최소 너비 128px, 안쪽 여백 4px, 반경 10px |
| 항목 | `box-sizing: border-box` 포함 최소 모바일 40px·PC 36px, 글자 13px |
| 최대 높이 | 320px와 `화면 절반 - 24px` 중 작은 값, 넘치면 메뉴 내부 스크롤 |

- 트리거의 44px 클릭 영역과 옵션 높이를 혼동하지 않아요. 메뉴 버튼은 축소하지 않고 선택 항목은 체크로 표시해요.
- 입력 요소가 없어 선택만으로 모바일 키보드가 뜨지 않아요. Enter/Space·방향키로 열고 Escape로 닫으면 버튼에 포커스가 돌아가요. 상태 CSS는 공통 모듈에서 강제해요.
- 기본 `FilterSelect`·`FormSelect`의 크기는 바꾸지 않아요. 예전 `FilterSelect appearance="chip"` 분기와 CSS는 제거됐어요.

> 주의: 순수 AntD `<Select>`를 직접 쓰지 마세요. 예전엔 `className="reserve-filter-select"`를 기억해서 붙여야 했고, 두 번 잊어서 회색으로 떨어졌어요. 이제 어느 쪽인지는 `import`하는 순간 정해져요.

### 규칙은 주석이 아니라 코드에 둔다

반복된 회귀는 전부 주석에는 규칙이 있는데 강제 장치가 없던 경우였어요.

| 사례 | 규칙이 어디 있었나 | 결과 |
|---|---|---|
| 필터 Select 색 | 주석 + 외워야 하는 className | 2곳이 회색으로 떨어짐 |
| 카드 hover 그림자 | 주석 | 인라인 `boxShadow`가 hover를 죽임 |
| 확인 모달 줄바꿈 | 호출부 8곳이 각자 처리 | `useMessage.confirm` 래퍼로 관문화해서 해결 |

해법은 관문 하나예요. 호출부 N곳 대신 반드시 지나가는 한 곳에서 강제해요. `useMessage.confirm`, `FormSelect`/`FilterSelect`가 그 형태예요.

### 전역 CSS는 컴포넌트 안에 두지 않는다

`index.css`는 전역 CSS의 단일 진입점이고, cascade 순서를 고정한 `styles/global/*.css`를 한 번씩 import해요. `.reserve-form-select`는 `components-and-forms.css`, `.reserve-filter-select`는 `interactions.css`에 있어요.

- **전역 정책**(색·높이·상태별 톤) → `index.css`가 import하는 `styles/global/*.css`
- **컴포넌트 지역 스타일**(그 인스턴스의 폭·간격) → 인라인 `style`

컴포넌트 안 `<style>` 태그에 전역 규칙을 넣으면 그 컴포넌트를 안 쓰는 화면에는 규칙이 없어요. 프로젝트 JSX는 `<style>` 태그를 직접 렌더하지 않아요. AntD CSS-in-JS와 Vite 개발 서버가 `<head>`에 만드는 태그는 라이브러리 동작이라 별개예요.

## 폼 검증 에러 메시지

| 항목 | 값 |
|---|---|
| 위치 | 컨트롤 **바로 아래**, 간격 `6px` |
| 크기 | `12px` / `line-height 1.5` (본문보다 작게 — 보조 설명의 위계) |
| 색 | `colors.error.main` (라이트 `#f04452` / 다크 `#ff6b76`) |
| 접근성 | `role="alert"` — 스크린리더가 즉시 읽는다 |
| 사라짐 | **재검증 성공 시에만.** 타이머로 지우지 않는다 |

두 구현 경로가 같은 규격을 내야 해요.

1. **AntD `Form.Item`** (가게 등록·광고 신청·제재 모달 등) → `styles/global/components-and-forms.css`의 `.ant-form-item-explain` 전역 규칙이 크기·간격을, `App.jsx`의 `ConfigProvider token.colorError`가 색을 맡아요.
2. **`FormField`** (`components/common/FormModal.jsx`, 문의 모달 등) → 컴포넌트가 직접 렌더해요.

> 주의: AntD 기본 에러색은 `#ff4d4f`라서 `ConfigProvider`에서 `colorError`를 맞추지 않으면 두 빨강이 섞여요. AntD가 JS로 파생색을 계산하니 `var(--c-error)`를 넣을 수 없고 리터럴이어야 해요. `theme.css`와 값이 중복되니 한쪽을 고치면 다른 쪽도 고쳐요.

검증 에러는 "지금 이 값이 잘못됐다"는 지속 상태라 자동으로 사라지지 않아요(WCAG 3.3.1). 타이머로 사라지는 건 `저장되었습니다` 같은 결과 통보용 토스트예요. 검증 문구를 토스트로 띄우면 사라진 뒤 어느 칸이 문제였는지 알 수 없어요.

### lint로 강제해요

**① 관문 훅 `useFormErrors`** (`hooks/useFormErrors.js`) — `errors` state + `clearError` + 틀린 칸을 전부 모으는 `validate`를 훅 하나로 제공해요.

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

**② `no-restricted-syntax` lint 규칙** (`eslint.config.js`) — `message.warning`/`error`의 인자가 "○○을 **입력/선택/업로드/동의**해주세요" 또는 "…**필수입니다**" 꼴이면 CI가 실패해요.

- 실제 검증 어미만 보므로 `로그인이 필요한 서비스입니다`·`위치를 가져올 수 없어요` 같은 정당한 토스트는 걸리지 않아요.
- 변수로 조립한 문구는 못 잡아요. 의도적이에요. 넓게 잡으면 `eslint-disable` 주석만 늘어나요.

### 어느 기계를 쓸지

기준은 하나예요. **이 입력칸이 AntD `<Form>` 안에 있는가?**

| 상황 | 쓸 것 |
|---|---|
| `<Form>` 안의 칸 | `Form.Item` 의 `rules` |
| `<Form>` 안이지만 Form 필드가 아닌 값(업로드 파일, 지도 좌표 등) | `form.setFields([{ name, errors: ['...'] }])` |
| `<Form>` 밖의 폼(`FormModal`·`FormField`) | `useFormErrors` + `<FormField error={...}>` |
| `FormField`로 감쌀 자리가 없는 곳(별점, 약관 체크박스 묶음) | `<span className="reserve-field-error" role="alert">` 직접 |

- 두 기계를 한 칸에 섞지 않아요. `Form.Item rules`와 `FormField error`를 같이 주면 에러가 두 번 렌더돼요.
- 검증 로직을 두 군데 두지 않아요. 제출 버튼이 이미 `disabled`로 막거나 `onFinish`가 검증 뒤에만 불리는데 같은 검사를 반복하면 죽은 검사예요. 읽는 사람이 진짜 관문을 못 찾게 돼요.

## 목록을 넘기는 방법 — 페이지네이션

PC·모바일을 다른 목록 방식으로 나누지 않아요. 홈 추천 행은 짧은 미리보기이고 전체 결과는 `/stores`에서 넘겨요.

| 성격 | 화면 | 방식 | 구현 |
|------|------|------|------|
| **탐색 결과** — 조건·페이지를 보존해 다시 찾는다 | 가게 목록(`/stores`) | 서버 페이지네이션, 기본 12건 | `useStoreList.js` (`useQuery`) + 기존 AntD `Pagination` |
| **관리** — 특정 건을 찾아 처리하고, 어디까지 봤는지 기억해야 한다 | 관리자 패널 전 탭 | 서버 페이지네이션 | `DataTable` + `total` |
| **관리** — 예약을 검색·처리한다 | 사장님 예약 관리 | 서버 페이지네이션 | 기존 `ReservationCard` + AntD `Pagination`, 기본 15건 |
| **관리** — 광고를 검색·처리한다 | 사장님 광고 관리 | 서버 검색·가게 필터·페이지네이션 | `DataTable` + Spring Page, 기본 20건·최대 100건 |

공개 가게 목록은 무한 스크롤 대신 페이지를 써요. 원래 카드 크기와 법적 고지 푸터를 유지하면서 공유 가능한 페이지 좌표를 주기 때문이에요. offset 페이지라 중간에 데이터가 바뀌면 위치가 밀릴 수 있어요.

- URL은 `page=2`처럼 1부터, 서버 요청은 `page=1`처럼 0부터 시작해요. `size=12`를 명시해요.
- 키워드·분야·정렬·좌표 변경은 첫 페이지로 돌아가고, 페이지 이동은 다른 조건을 보존해요.
- 페이지별 query key·캐시를 분리하고, 이전 페이지의 늦은 응답이 현재 결과를 덮지 않아요.
- Spring Boot 3.5의 `page.totalElements`/`page.totalPages`와 이전 평탄 응답을 모두 읽어요.
- 삭제로 결과가 줄거나 잘못된 공유 URL이면 유효 페이지로 replace 보정해요. 조회 실패는 정상 0건과 구분해요.
- 페이지 클릭은 맨 위로 이동해요. 무한 스크롤 sentinel·추가 로딩·"모두 불러왔습니다" 문구는 두지 않아요.
- 기존 회색 선택 면의 AntD `Pagination`을 재사용해요. 번호 면은 PC 32px·모바일 30px 라운드 사각형이고, 모바일은 `showLessItems`·`size="small"`에 페이지 크기 선택을 숨겨요.
- 관리 화면도 모바일에서 같은 서버 페이지네이션을 유지하고, 전체 건수를 현재 페이지 행 수로 대체하지 않아요.

**사장님 예약 관리**는 카드 모양을 유지하면서 서버 검색·필터·전체 건수·페이지 이동을 연결했어요. `useManageReservations`의 query key에 `page`, `size`, `search`, `status`, `storeId`가 들어가요. 검색·필터 변경은 첫 페이지로 가고, 요청사항도 서버 검색 대상이에요. 동일 생성 시각은 id 보조 정렬로 구분하고, 101건·201건 경계·다른 사업자 가게 제외·count 일치 회귀 테스트가 있어요.

**사장님 광고 관리**도 `page`·`size`·검색어·가게 필터를 서버에 보내고 `page.totalElements`를 전체 건수로 써요.

### 목록 상태 보존

- 결과를 바꾸거나 다시 찾는 데 필요한 상태는 URL에 둬요: `page`, 검색어, 가게·상태·정렬 필터, 사업자 통계의 가게·기간, 광고 목록의 가게·검색어.
- 한 화면의 여러 목록은 `reservation*`, `statistics*`, `advertisement*`처럼 이름을 나눠 서로 덮어쓰지 않아요.
- 카드/목록 보기는 URL `view`가 우선이에요. 값이 없으면 `useViewModeParam`이 경로별 `sessionStorage`의 마지막 보기를 복원하고 URL을 보정해요.
- 새 광고 신청, 수정 폼, 모달 열림, QR 스캔, 비밀번호·파일·위치 권한처럼 진행 중인 작업이나 민감한 값은 저장하지 않아요.

### 새 목록을 만들 때

- 공개 가게 검색·분야·전체 목록 → 사진형 카드 또는 목록형 + 서버 페이지네이션. 홈 추천 미리보기와 구분해요.
- 연속 피드 → 무한 스크롤 여부를 따로 결정해요. 준비 중인 피드를 구현 완료로 표현하지 않아요.
- 운영자가 처리하는 목록 → `DataTable`. 서버 페이지네이션이면 `total`을 반드시 넘겨요(안 넘기면 AntD가 현재 행 수로 페이지 수를 계산해요).
- 애매하면 페이지네이션을 골라요. 되돌리기 쉬운 쪽이에요.

> 주의: 인자 없이 목록 API를 부르지 마세요. 서버 기본 `size`가 조용히 상한이 되어 그 뒤 데이터가 화면에서 사라져요.

## 규칙

- UI에 텍스트 이모지를 쓰지 않아요. 동작·상태 아이콘은 AntD 아이콘을 써요.
- 색상·크기는 반드시 토큰을 써요(하드코딩 금지). 인라인 스타일로 토큰을 적용해요(`style={{ color: colors.text.primary }}`).
- 업로드 이미지 URL은 `getImageUrl()`/`getThumbnailUrl()` 유틸로 처리해요(CloudFront URL). 프로젝트 정적 자산은 `/images/…` 경로를 써요.
- 변경 전 디자인 시스템 소스 스냅샷은 `docs/design-system/snapshots/2026-09-13-baseline/`에 보존해요. 일반 Core와 RESERVE 전용 Patterns를 점진적으로 구분하고, 기존 토큰·상태 규칙을 일괄 교체하지 않아요.

## 관련 기록

화면별 실측·결정 경위는 아래 기록에 있어요. 현재 규칙은 이 문서가 정본이에요.

| 주제 | 기록 |
|---|---|
| 상호작용 전수 점검·예외 선택자 | [interaction-audit-2026-09-13.md](history/2026-09-preview/interaction-audit-2026-09-13.md) |
| 공개 화면 실측·참고 사이트 확인 범위 | [design-measurements-2026-09-13.md](history/2026-09-preview/design-measurements-2026-09-13.md) |
| 디자인 전환 계획(구현/계획 구분) | [design-evolution-plan-2026-09-13.md](history/2026-09-preview/design-evolution-plan-2026-09-13.md) |
| 모바일 폼 밀도·확인 모달·홈 배너 보정 | [layout-regressions-2026-09-14.md](history/2026-09-preview/layout-regressions-2026-09-14.md) |
| 메신저 홈·footer | [messenger-home-refinement-2026-09-13.md](history/2026-09-preview/messenger-home-refinement-2026-09-13.md) |
| 메신저 헤더·조회 오류 경계 | [messenger-header-and-runtime-routing-2026-09-14.md](history/2026-09-preview/messenger-header-and-runtime-routing-2026-09-14.md) |
| 메신저 런처 | [visuals/2026-09-13-messenger](../design-system/visuals/2026-09-13-messenger/README.md) |
| 혜택 사진 배너·내 설정 사진 | [benefit-banners-and-account-avatar-2026-09-14.md](history/2026-09-preview/benefit-banners-and-account-avatar-2026-09-14.md) |
| 입력창·홈 추천·이미지 로딩 | [compact-messenger-and-home-store-rows-2026-09-14.md](history/2026-09-preview/compact-messenger-and-home-store-rows-2026-09-14.md) |
| 가게 목록 보기 전환 | [store-list-view-modes-2026-09-14.md](history/2026-09-preview/store-list-view-modes-2026-09-14.md) |
| 검색 결과·평점 `0.0 (0)` 통일 | [search-results-and-rating-zero-2026-09-14.md](history/2026-09-preview/search-results-and-rating-zero-2026-09-14.md) |
| 채널톡형 광고 소개 카드(제안 단계, 미구현) | [channel-style-advertising-and-storage-review-2026-09-13.md](history/2026-09-preview/channel-style-advertising-and-storage-review-2026-09-13.md) |
