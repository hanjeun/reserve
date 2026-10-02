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

- 키보드 포커스는 `.reserve-btn:focus-visible` 공통 링(본문 보조색 2px)이에요. 호출부에서 덮지 않아요.
- 로딩 중에는 `disabled`와 `aria-busy`가 함께 적용돼요.
- `size="sm"`(36px) 좌우 여백은 primary·danger 24px, outline·secondary 20px이에요.
- 패널 안의 저장·취소 한 쌍은 `outline sm` + `primary sm`, 8px 간격, 오른쪽 정렬이에요. 44px(`md`)·56px(`lg`)는 페이지 단위 폼의 주 행동에 써요.

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

날짜 필드는 AntD 값 계약(dayjs, `value/onChange`, `disabledDate`)을 유지하고, 달력 표면은 `FormDatePicker`가 그려요. 운영 기간·임시 휴무일·광고 기간이 모두 이 컴포넌트를 써요.

- 한 날짜는 선택 즉시 닫고, 여러 날짜·기간은 하단 완료 버튼으로 확정해요.
- 기간 선택은 시작/종료 칸과 범위 강조를 보여 주고, `allowEmpty`를 지원해요.
- 편집 중인 칸은 1px `gray-400` + 회색 면, 선택 날짜는 `gray-200` 면 + 진한 글자, 기간 사이는 `gray-100`이에요. primary는 쓰지 않아요.
- 오늘은 작은 중립 점으로 표시해요.
- 월·연도 이동, 일요일 색, 비활성 날짜, 모바일 좌우 swipe를 제공해요.

### FormModal

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
- `Card onClick`은 이동이 아닌 동작용이에요. `role="button"`, `tabIndex`, Enter/Space를 제공하고, 안에 다른 버튼·링크를 넣지 않아요. `Card.Add`는 `<button>`이에요.
- 계정 메뉴·프로필 이미지 선택·모달/채팅 닫기 같은 컨트롤도 `<button>`이고, `:focus-visible` 링을 유지해요.
- `ReservationRow`는 상세 열기를 썸네일·가게명 버튼으로 제공해요.
- `AdBanner`는 캐러셀 점 버튼을 담고 있어서 `div role="button"` + Enter/Space + 포커스 링을 써요.

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
    return <DataState state="empty" kind="reservation" title="예약 내역이 없습니다." />;
}
```

읽기·목록 조회의 빈 결과와 실패를 표시해요. 빈 결과는 회색 도메인 아이콘과 안내, 실패는 회색 아이콘·사용자용 문구·`다시 불러오기`예요. `listErrorMessage`가 HTTP 상태를 문구와 아이콘 의미(`offline`, `forbidden`, `missing`, `rateLimited`, `retry`, `unavailable`)로 바꿔요.

- 결과가 나올 자리에 둬요. 순서는 `제목 → 필터/새로고침 → DataState`예요.
- 독립 조회가 모두 실패하면 `DataState` 하나로 합치고, 일부만 실패하면 해당 영역에 `compact`로 둬요.
- 상세 페이지도 없는 항목은 빈 상태, 조회 실패는 오류와 재시도로 구분해요.
- 재시도 중에는 같은 자리에 `SyncOutlined` 회전 아이콘을 보여요.
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

## 상호작용

### Hover · 누르는 동안 · 선택 상태

일반 탐색은 hover에 브랜드 파란색을 쓰지 않아요.

| 대상 | Hover | 누르는 동안 (`:active`) | 선택 상태 |
|---|---|---|---|
| primary / secondary / outline 버튼 | 투명도 또는 중립 테두리·면 변화 | `scale(0.96)` + 투명도, 메신저 홈 문의 CTA는 `scale(0.98)` | — |
| ghost / link 버튼 | 투명도 변화 | `scale(0.94–0.96)` + 투명도 | — |
| 헤더 검색 아이콘 / 뒤로가기 / 워드마크 | 중립 면 또는 투명도 | 뒤로가기는 왼쪽 180ms 피드백 후 이동, 워드마크는 즉시 이동 | — |
| 프로필 사진 / 홈 3D 바로가기 / 추천 사진 카드 | 중립색, 홈 이미지·추천 카드만 2px 상승 | `scale(0.94–0.97)` | — |
| 메신저 footer 홈·대화·설정 | 비활성 아이콘만 중립색 강조 | 명암만 | 활성 화면은 primary 아이콘·라벨, `aria-current=page` |
| 메신저 X·뒤로가기·새로고침 | 44×44 영역에 옅은 회색 면 | 명암만 | — |
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

### 포커스와 선택 테두리

| 상태 | 표시 |
|---|---|
| 키보드 포커스 (`:focus-visible`) | 본문 보조색 2px 링 |
| 입력칸 포커스 | 1px `gray-500` |
| 선택·편집 중 (등장 효과 카드, 지역 시트 인기 지역, 기간 시작/종료 칸) | 1px `gray-400` + 회색 면 |

- 키보드 포커스 링은 Tab 이동에만 보여요.
- 선택 상태는 회색 면 또는 중립 테두리예요. primary는 제출·결제 같은 실행 버튼과 현재 위치 표시에만 써요.

### 모션 축소

`useReducedMotion` 훅과 `@media (prefers-reduced-motion: reduce)`를 함께 써요.

- CSS 이동·확대·깜빡임은 미디어쿼리에서, 타이핑 루프·부드러운 스크롤은 훅에서 멈춰요.
- 홈은 첫 문구를 완성된 상태로 두고 reveal 요소를 즉시 보여요.
- 로딩 스피너는 속도만 완화할 수 있어요.

### 화면 전환 모션

- 화면 이동은 120–180ms 안에서 끝나요. 헤더·탭은 멈추고 도착한 콘텐츠만 움직여요.
- 일반 진입·앞으로가기는 오른쪽, 뒤로가기·직접 진입 fallback은 왼쪽에서 들어와요. 최상위 탐색 탭은 탭 순서로 방향을 정해요.
- 홈 이동은 도착한 홈만 왼쪽에서 들어와요.
- 검색 화면은 내용만 PC 8px·모바일 24px을 220ms 동안 위로 들이고, 취소·Escape는 반대로 닫아요.
- 같은 pathname의 필터·정렬·보기 전환과 데이터 로딩 스켈레톤에는 전환을 넣지 않아요.
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
- 종류·광고·우리동네는 `.reserve-store-identity-text`로 표시해요. 광고 표시는 공용 `AdMark`(화면엔 AD, 화면 낭독기엔 '광고')예요.

### 보기 전환 (`/stores`)

- 분야·정렬 오른쪽 끝의 44×44px 아이콘 버튼이에요. 다음 보기를 `UnorderedListOutlined`/`AppstoreOutlined`로 표시해요.
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

검증 문구는 토스트로 띄우지 않아요. 토스트는 `저장되었습니다` 같은 결과 통보용이에요.

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

`eslint.config.js`의 `no-restricted-syntax` 규칙은 `message.warning`/`error`의 인자가 "○○을 입력/선택/업로드/동의해주세요" 또는 "…필수입니다" 꼴이면 실패시켜요.

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
