# 디자인 시스템

Ant Design 기반 디자인 토큰 시스템입니다.

---

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

실제 `colors.*` 값은 위 hex 자체가 아니라 `var(--c-..., fallback)` 문자열이다. 포인트 색의 런타임
정본은 `hooks/useTheme.js`의 `ACCENT_OPTIONS`이고, `theme.css`의 기본 블루는 첫 페인트용 fallback이다.
두 기본값은 라이트·다크 모두 동일하게 유지한다. 사용자가 포인트 색을 바꾸면 `applyAccent`가 CSS 변수와
AntD `colorPrimary`가 같은 리터럴 표를 보도록 함께 갱신한다.

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

#### 반경(radius) 스케일 규칙 (2026-08-19 등재)

**반경은 "취향"이 아니라 요소의 크기에 따라 정해진다.** 같은 24px 라도 작은 배지에 쓰면 알약이 되고
큰 패널에 쓰면 거의 직각으로 보인다 — 눈에 보이는 둥글기는 `반경 ÷ 요소 크기` 라서 그렇다.
그래서 새 컴포넌트를 만들 때마다 "느낌 좋은 값"을 고르면 화면마다 미묘하게 다른 곡률이 쌓인다.

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

**지켜야 할 것**

1. **숫자를 직접 쓰지 않는다.** `borderRadius: 16` 이 아니라 `radius.xl`. 리터럴은 스케일 밖으로 새는
   유일한 경로다 — 지금 `borderRadius: '50%'` 가 17곳에 원시값으로 박혀 있고(→ `radius.full`),
   `16`·`4` 도 몇 군데 남아 있다. 새로 쓰는 코드에서는 하지 말 것.
2. **`3xl` 은 큰 것에만.** 정의는 돼 있는데 **현재 사용처가 0곳**이다. 카드나 버튼에 24px 을 쓰면
   `xl`(16px)로 통일된 나머지 화면과 곡률이 어긋난다. "조금 더 둥글게" 가 필요하면 한 단계만 올린다.
3. **한 화면 안에서 인접한 요소는 같은 단계이거나 한 단계 차이여야 한다.** 패널(20) 안의 버튼(16)은
   자연스럽지만, 작은 카드 안의 배지(24)는 어색하다 — 안쪽이 바깥쪽보다 더 둥글면 안 된다.

`components/common/Card.jsx`의 목록 카드는 제품에서 의도적으로 `borderRadius: 0`인 각진 사각형이다.
따라서 `radius.xl` 규칙의 예외가 아니라 별도 카드 형태이며, `Card.Add`도 같은 0을 사용한다.

> **왜 문서에 적는가.** 이 프로젝트에서 반복된 회귀는 전부 "규칙이 사람 머릿속에만 있던" 경우였다
> (필터 Select 색, 카드 hover 그림자, 확인 모달 줄바꿈). 반경은 관문 컴포넌트로 강제하기 어렵다 —
> 새 컴포넌트를 만드는 순간 아무 값이나 넣을 수 있기 때문이다. 그래서 **표를 보고 고르게** 만든다.
> 규칙을 지키는 비용보다 화면마다 곡률이 다른 걸 나중에 되돌리는 비용이 훨씬 크다.

---

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

모든 `Button`은 `.reserve-btn:focus-visible` 공통 링을 사용한다. 호출부에서 `outline: none`을 추가하거나
키보드 포커스 스타일을 덮지 않는다. 로딩 중에는 네이티브 `disabled`와 `aria-busy`가 함께 적용된다.

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

모든 입력 필드: `variant="filled"`, `border: none`, `backgroundColor: colors.gray[50]`, `borderRadius: radius.lg`, `height: heights.input`, `fontSize: 16px`(호출부 `size` prop과 무관하게 항상 동일 — `.reserve-form-field` CSS 클래스로 전역 강제). `FormInput.WithButton`도 같은 클래스를 반드시 통과하며, 결합 버튼은 보이는 문구를 접근 가능한 이름으로 사용하고 로딩 중 `aria-busy`를 전달한다.

#### 날짜 선택 표면

날짜 필드는 AntD의 값 계약(dayjs, `value/onChange`, `disabledDate`)을 유지하지만 달력 표면은
`FormDatePicker`가 직접 그린다. 가게 등록·수정의 운영 기간, 임시 휴무일, 광고 기간이 모두 이 관문을
지나므로 화면마다 다른 원시 DatePicker 팝업을 만들지 않는다.

- 한 날짜는 선택 즉시 닫고, 여러 날짜·기간은 하단 완료 버튼으로 확정한다.
- 기간 선택은 시작/종료 칸과 범위 강조를 함께 보여준다. 한쪽만 허용하는 `allowEmpty`도 보존한다.
- 월·연도 이동, 오늘 표시, 일요일 색, 비활성 날짜, 모바일 좌우 swipe를 공통 제공한다.
- 날짜 버튼에는 전체 날짜의 접근 가능한 이름과 선택 상태가 있고, 모달은 제목과 연결한다.
- motion 축소 환경에서도 선택 의미가 애니메이션에 의존하지 않는다.

### FormModal

```jsx
import { FormModal, FormField } from '../components/common';

<FormModal title="문의하기" open={open} onClose={onClose} onSubmit={handleSubmit} submitting={sending}>
    <FormField label="제목"><FormInput ... /></FormField>
    <FormField label="내용"><FormTextArea ... /></FormField>
</FormModal>
```

"작성해서 제출" 계열 모달(문의하기, 메일 작성 등)의 공용 뼈대 — 너비(520px 고정) · 타이틀 스타일 · 취소/제출 버튼 스타일 · 필드 세로 간격을 한 곳에서 관리해 모달마다 제각각 달라지는 것을 막는다.

### PageContainer

```jsx
import { PageContainer } from '../components/common';

<PageContainer size="sm" />   // 420px — 폼 페이지
<PageContainer size="md" />   // 700px — 상세 페이지
<PageContainer size="lg" />   // 1000px — 관리 페이지
<PageContainer size="xl" />   // 1200px — 목록 페이지
```

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

페이지 이동은 카드 `onClick`이 아니라 실제 `Link`로 표현한다. 그래야 브라우저의 새 탭·주소 복사와
스크린리더 링크 의미가 유지된다. `Card onClick`은 페이지 이동이 아닌 동작용 호환 경로이며 자동으로
`role="button"`, `tabIndex`, Enter/Space 활성화를 제공한다. 그 안에는 다른 버튼이나 링크를 중첩하지 않는다.
`Card.Add`는 네이티브 `<button>`이다.

계정 메뉴·프로필 이미지 선택·모달/채팅 닫기처럼 동작을 실행하는 컨트롤도 네이티브 `<button>`을 쓴다.
마우스 `:focus` 외형은 지울 수 있지만 `:focus-visible` 링은 반드시 복구한다. 행 안에 승인·취소 버튼이
이미 있는 `ReservationRow`는 행 전체를 또 버튼으로 감싸지 않고, 같은 상세 열기 동작을 썸네일·가게명
네이티브 버튼으로 제공한다.

`AdBanner`의 캐러셀 점은 라이브러리가 실제 버튼으로 생성하므로 배너 전체를 네이티브 버튼으로 감쌀 수 없다.
현재 `div role="button"` + Enter/Space + 명시적 포커스 링을 쓰는 **복합 컨트롤 예외**이며, 이 패턴을 일반
카드에 복사하지 않는다. 구조를 바꿀 때는 캐러셀 컨트롤과 가게 링크를 형제 요소로 분리한다.

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

### ChartCard

차트만으로 값을 전달하지 않는다. `ChartCard`에는 짧은 `summary`, `tableColumns`, `tableRows`를 함께 넘긴다.
제목은 의미 있는 `h3`, 요약은 일반 텍스트, 원본 수치는 접을 수 있는 실제 `<table>`로 렌더한다.
동일 정보를 중복 읽지 않도록 시각 차트 영역은 표가 있을 때 `aria-hidden="true"`다.

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

정상 0건과 조회 실패는 다르다. 실패한 데이터로 빈 차트를 만들지 말고, 부분 실패면 실패한 source를
지속적인 Alert로 표시하며 성공한 source만 유지한다.

### FavoriteButton

```jsx
<FavoriteButton storeId={id} />
<FavoriteButton storeId={id} initialStatus={true} />
```

`FavoriteButton`은 `aria-label`, `aria-pressed`, 로딩 중 `aria-busy`를 제공하는 토글 버튼이다.
호출부는 `title`만으로 이름을 대신하지 않는다.

### 모션 축소

전역 `useReducedMotion` 훅과 `@media (prefers-reduced-motion: reduce)`를 함께 사용한다. CSS 이동·확대·깜빡임은
미디어쿼리에서 끄고, 타이핑 루프나 부드러운 스크롤처럼 JavaScript가 만드는 움직임은 훅으로 중지한다.
홈에서는 첫 문구를 완성된 상태로 고정하고 reveal 요소를 즉시 노출한다. 로딩 스피너처럼 진행 상태를
전달하는 움직임은 없애지 않고 속도만 완화할 수 있다.

### Hover · 누르는 동안 · 선택 상태 (2026-09-13)

PC(900px 이상) 공통 헤더는 전체 RESERVE 워드마크와 최대 560px 검색창을 사용한다. 워드마크는 원래 Pretendard·22px·850 굵기·-0.8px 자간을 유지하며 PC에는 뒤로가기를 표시하지 않는다. 브랜드/계정 영역은 각각 196px로 검색창을 중앙 정렬하며, 높이 64px·검색 pill 44px·기존 상호작용은 유지한다. 모바일은 기존 R 로고 또는 뒤로가기·검색·프로필 구성을 유지한다. 주요 화면의 탐색 탭은 44px 높이다.

**일반 탐색을 hover했다고 브랜드 파란색으로 바꾸지 않는다.** 브랜드 액션의 기존 색,
선택·오류·즐겨찾기 상태와 키보드 포커스 링은 별개다. `primary.dark` 토큰의 설명에
hover가 있다고 모든 링크를 파란색으로 바꾸라는 뜻은 아니다.

| 대상 | Hover | 누르는 동안 (`:active`) | 누른 뒤의 상태 |
|---|---|---|---|
| 공통 primary / secondary / outline 버튼 | 기존 색 유지, 투명도 또는 중립 테두리·면 변화 | `scale(0.96)` + 투명도 | 동작 결과/로딩은 기존 컴포넌트가 관리 |
| ghost / link 버튼 | 기존 글자색 유지, 투명도 변화 | `scale(0.94–0.96)` + 투명도 | 링크·액션 의미 유지 |
| 헤더 검색창 / R 로고 / 프로필 | 중립 회색 면 또는 투명도 변화 | 검색창 `0.98`, 로고·프로필 `0.94` | 기존 검색 진입·페이지 메뉴 |
| 홈 탭·지역·바로가기·추천 행 / 검색 화면 | 중립색, 투명도 또는 회색 면; 홈 바로가기 이미지·추천 행만 미세한 2px 상승 | `scale(0.96–0.97)` | 탭은 진한 글자 + 밑줄; 가짜 선택·위치 상태를 만들지 않음 |
| 입력 없는 종류·정렬 메뉴 (`FilterMenu`) | 흰 면(다크 paper) 또는 투명 면, 중립 테두리/면 강조 | 크기 변화 없이 중립 면 변화 | 중립 선택 면 + 체크; 열림은 꺾쇠로 표시 |
| 일반 가게 카드 | 원래 중립 그림자 + 사진 `1.05` 줌, 글자색 유지; 공개 탐색의 hoverable 카드만 2px 상승 | 내부 이동 링크 `scale(0.98)` | 카드 크기·사진 원본 비율 유지 |
| 즐겨찾기 | 흰 사진 오버레이 유지, 그림자 변화 | `scale(0.94)` | `aria-pressed`와 빨간 하트가 선택을 표현 |
| pill tabs / SegmentedControl / 페이지네이션 | 회색 면 + 진한 글자 | 기존 소형 컨트롤의 눌림 규칙 | 회색 선택 면 / 진한 글자; 일반 AntD tabs의 선택색과 구분 |
| 날짜·시간 선택 | 회색 hover | 선택 셀의 기존 표현 | 선택 날짜·시간의 primary 표현은 유지 |

공통 헤더·탐색 탭·홈·전용 검색·문의 버튼·입력 없는 `FilterMenu`의 키보드 `:focus-visible` 링은 본문 보조색 2px이다. 그 밖의 공통 버튼·링크의 기존 primary 링은 유지하며 마우스 클릭·hover와 혼동하지 않는다. 메뉴를 터치해도 링을 붙이지 않는다.
텍스트 입력은 클릭만으로도 `:focus-visible`이 될 수 있으므로 이를 목록 메뉴의 판정에 쓰지 않는다.
검색 입력의 포커스는 중립색 테두리로 표시하며, 폼 오류·선택 날짜·브랜드 액션의 기존 상태색은 바꾸지 않는다.
모션 감소 설정에서는 확대·축소/이동과 해당 전환을 끄되 상태색·포커스는 유지한다.
2px 상승은 hover 가능한 fine pointer와 모션 감소가 꺼진 환경에만 적용한다. 헤더·탭·필터 트리거와 열린 메뉴는 움직이지 않는다.
비활성·응답 대기 중에는 실제 클릭과 눌림 효과를 차단한다. 공통 버튼의 평상시 인라인
`opacity: 1`은 넣지 않는다. 전역 hover/active 투명도를 덮어 피드백을 죽이기 때문이다.

이 표는 정책과 확인된 구현을 정리한 것이며 모든 업무 화면의 브라우저 실행 증거는 아니다.
기존 예외·미정리 규칙, 수정 전 전체 선택자 목록과 확인 범위는
[interaction-audit-2026-09-13.md](interaction-audit-2026-09-13.md)를 참고한다.

---

## Import 패턴

```js
import { Button, FormInput, PageContainer, Card, Loading } from '../components/common';
import { useMessage, useStoreData, useReservations } from '../hooks';
import { API_ENDPOINTS, STORE_CATEGORIES, RESERVATION_STATUS_LABELS } from '../constants';
import { getImageUrl, getThumbnailUrl, formatDate, formatCurrency } from '../utils';
import { colors, radius, fontWeight, fontSize, heights } from '../styles/tokens';
```

---

## 꺾쇠·화살표 회전 규칙 (2026-08-05 확정)

**규칙: 왕복 180°.** 펼치면 시계방향으로 180°, 접으면 같은 길을 반시계로 되돌아온다.

| 대상 | 구현 위치 | 회전 대상 |
|---|---|---|
| 드롭다운 꺾쇠 (Select) | `styles/global/foundation.css` → `.ant-select-open .ant-select-suffix` | `span.ant-select-suffix` |
| 아코디언 화살표 (FAQ) | `styles/global/feature-surfaces.css` → `.ant-collapse-item-active .ant-collapse-arrow` | `span.ant-collapse-arrow` |

둘 다 **span을 돌린다**(svg 아님). 상태는 AntD가 관리하고(`.ant-select-open` / `.ant-collapse-item-active`)
우리 CSS가 그 클래스로 판정하므로 **React 상태가 필요 없다.**

### 반드시 지킬 것 — 닫힘 상태에 `rotate(0deg)`를 명시한다

```css
.faq-collapse .ant-collapse-arrow            { transform: rotate(0deg); }   /* ← none 이면 안 된다 */
.faq-collapse .ant-collapse-item-active
  .ant-collapse-arrow                        { transform: rotate(180deg); }
```

`transform: none` ↔ `rotate(180deg)` 로 두면 브라우저가 각도가 아니라 **행렬을 보간**한다.
정확히 180°는 행렬 분해에서 방향이 결정되지 않는 퇴화 케이스라 엔진이 임의로(보통 반시계) 방향을 고른다.
"펼칠 때 반시계로 돈다"는 증상의 실제 원인이 이것이었다(2026-08-04 브라우저 실측으로 확정).
두 끝값을 모두 각도로 두면 각도 보간이 되어 시계방향이 보장된다.

### 왜 왕복인가

Material·iOS·Bootstrap·AntD 기본값이 전부 왕복이다. "같은 문을 열고 닫는다"는 물리 은유이고,
드롭다운 꺾쇠는 **방향 지시자**(아래로 열림 / 위로 닫힘)라 되돌아오는 게 의미에 맞다.

---

### ↩️ 되돌리기 — "항상 같은 방향으로 연속 회전"으로 바꾸려면

2026-08-05에 한 번 구현했다가 **정석(왕복)으로 되돌린** 방식이다.
두 번 누르면 360°가 완성되고, 회전이 끊기지 않아 더 부드럽게 느껴진다.
아래 절차를 그대로 따르면 복원된다. (당시 브라우저 실측으로 각도가
`0 → 180 → 360 → 540 → 720` 으로 단조 증가하는 것까지 확인했다)

**왜 CSS만으로는 안 되는가** — CSS transition은 두 상태를 오가는 것이라 왕복밖에 표현할 수 없다.
단방향 연속은 "직전에 몇 번 돌았는지"를 알아야 하므로 **상태가 필요하다.**

**1) `FaqSection.jsx` 의 CSS에서 회전 선언 두 개를 지운다.**
`transition`과 `transform-origin`은 남긴다. `rotate(...)`가 CSS에 남아 있으면 인라인 회전과
겹쳐서 각도가 두 배가 된다 — **회전의 출처는 한 곳이어야 한다.**

**2) 컴포넌트에 토글 횟수 상태를 넣는다.**

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

**3) `<Collapse>` 를 제어 모드로 바꾸고 `expandIcon` 에서 각도를 준다.**

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

**알아둘 점**

- 각도 값은 계속 커진다(180, 360, 540 …). 화면상으로는 180°마다 같은 모습이라 문제없다.
- 방향을 뒤집으려면 `ROTATION_STEP` 의 **부호만** 바꾼다.
- **드롭다운 꺾쇠까지 통일하려면** `FilterSelect`/`FormSelect` 에 같은 카운터를 넣어야 한다
  (`onDropdownVisibleChange` 로 토글을 세고 인라인 `transform` 을 준다).
  관문 컴포넌트가 이미 있으므로 그 두 파일만 고치면 전 화면에 적용된다 —
  화면마다 손대야 했다면 반드시 샜을 것이다.
- 이 방식은 **정석에서 벗어난 선택**이다. 되돌릴 때는 이 문서의 "규칙: 왕복 180°"로 복귀하고,
  상태(`turns`/`activeKey`/`handleChange`)와 `useState` import 를 함께 지운다.

---

## 입력 Select와 목록 메뉴 — 컴포넌트로 강제한다

| 컴포넌트 | 모양 | 언제 쓰나 |
|---|---|---|
| **`FormSelect`** | 채움형 회색 (`gray[50]` / 다크 `#23262b`), 높이 54px | **값을 적어 넣는 칸.** 가게 등록 카테고리, 마이페이지 글꼴, 광고 등록 |
| **`FilterSelect`** | 흰 면 + 옅은 테두리 (다크 `#1e2126`), `size="large"` | **목록을 조작하는 도구.** 별점순, 예약관리·광고관리 필터, 통계 가게 선택 |
| **`FilterMenu`** | 입력 없는 네이티브 버튼 + Dropdown. 작은 흰 pill 또는 투명 텍스트 메뉴 | **간단한 탐색 선택.** 공개 가게 목록의 서비스 분야·정렬 |

가게 탐색의 분야·정렬은 모두 `<FilterMenu appearance="plain" />`로 PC·모바일 모두 오른쪽에 4px 간격으로 나란히 둔다. 가게 수는 왼쪽에 둔다.
목록은 큰 제목·소개 문구 없이 필터부터 시작한다. 페이지 `h1`은 공통 visually-hidden 규칙으로 유지하며, 본문 상단 여백은 PC 16px·모바일 12px다.
보이는 면은 32px, 버튼 동작 영역은 44px, 반경은 100px, 글자는 13px/행 높이 20px다.
드롭다운은 최소 너비 128px·안쪽 여백 4px·반경 10px이며, 항목은 `box-sizing: border-box`로 안쪽 여백을 포함해 최소 모바일 40px·PC 36px다. 옵션 글자는 13px다. 트리거의 44px 클릭 영역과 옵션 높이를 혼동하지 않는다.
분야처럼 항목이 많으면 메뉴 내부에서 스크롤한다. 최대 높이는 320px와 화면 절반에서 24px를 뺀 값 중 작은 쪽으로 제한한다.
메뉴 버튼은 축소하지 않고 선택 항목은 체크로 표시한다. 입력 요소가 없어 선택만으로 모바일 키보드를 띄우지 않는다.
Enter/Space·방향키로 열고 Escape로 닫아 버튼에 포커스를 돌려준다. 상태 CSS는 공통 모듈에서 강제한다.
목록 본문에는 별도 검색창·파란 검색 실행 버튼을 두지 않는다. 기본 FilterSelect나 FormSelect의 크기는 바꾸지 않는다.
과거 입력 기반 작은 `FilterSelect appearance="chip"` 분기와 해당 CSS는 사용처를 메뉴로 옮긴 뒤 제거했다.

`FormSelect`는 `FormInput`·`FormTextArea`·`FormDatePicker`·`FormTimePicker`와 같은 톤·같은 높이다.
입력칸이 아닌 것을 채움형으로 칠하면 폼처럼 보여 위계가 무너지고,
반대로 입력칸을 흰 면으로 두면 옆의 입력들과 어긋난다. **두 갈래인 게 정상이다.**

> ⚠️ **순수 AntD `<Select>`를 직접 쓰지 말 것.** 예전에는 `className="reserve-filter-select"`를
> 개발자가 기억해서 붙여야 했고, **두 번 잊었다** — StoreList의 "별점순"과 StatisticsTab의 가게 선택이
> 클래스 없이 렌더돼 회색으로 떨어져 있었다. StatisticsTab 주석에는 "FilterToolbar와 정확히 일치하도록
> 맞춘다"고 적혀 있었는데 **의도만 있고 구현이 없던** 상태였다.
> 이제 어느 쪽인지는 `import` 하는 순간 결정된다.

### 이 사건의 교훈 — 규칙은 주석이 아니라 코드에 둔다

이 프로젝트에서 반복된 회귀는 **전부** "주석에는 규칙이 있는데 강제 장치가 없는" 케이스였다.

| 사례 | 규칙이 어디 있었나 | 결과 |
|---|---|---|
| 필터 Select 색 | 주석 + 외워야 하는 className | 2곳이 회색으로 떨어짐 |
| 카드 hover 그림자 | 주석 | 인라인 `boxShadow`가 hover를 죽임 |
| 확인 모달 줄바꿈 | 호출부 8곳이 각자 처리 | `useMessage.confirm` 래퍼로 관문화해서 해결 |

**해법의 공통 형태는 "관문 하나"다.** 호출부를 N곳 고치는 대신, 반드시 지나가는 지점 한 곳에서 강제한다.
`useMessage.confirm`이 그렇고, `FormSelect`/`FilterSelect`가 그렇다.

### 전역 CSS는 컴포넌트 안에 두지 않는다

`index.css`는 전역 CSS의 단일 진입점이며, cascade 순서를 고정한 `styles/global/*.css`를 한 번씩 import한다.
`.reserve-form-select`는 `components-and-forms.css`, `.reserve-filter-select`는 `interactions.css`에 있다.
컴포넌트 파일 안의 `<style>` 태그에 전역 규칙을 넣으면 **그 컴포넌트를 안 쓰는 화면에는
규칙이 아예 존재하지 않는다.** 이 함정에 두 번 빠졌다(위 표의 1·2번).

- **전역 정책**(색·높이·상태별 톤) → `index.css`가 import하는 `styles/global/*.css`
- **컴포넌트 지역 스타일**(그 인스턴스에만 적용되는 폭·간격) → 인라인 `style`

2026-09-02 기준 프로젝트 JSX가 직접 렌더하는 `<style>` 태그는 0개다. App·Home·StoreList·StoreDetail·
QrScannerTab의 정적 규칙과 키프레임은 모두 전역 CSS 모듈에 있다. AntD의 CSS-in-JS 및 Vite 개발 서버가
문서 `<head>`에 만드는 스타일 태그는 라이브러리 동작이므로 이 수치와 별개다.

---

## 폼 검증 에러 메시지 (2026-08-04 등재)

에러를 그리는 경로가 두 개라 화면마다 크기·거리가 달랐다. 아래 규격으로 통일했다.

| 항목 | 값 |
|---|---|
| 위치 | 컨트롤 **바로 아래**, 간격 `6px` |
| 크기 | `12px` / `line-height 1.5` (본문보다 작게 — 보조 설명의 위계) |
| 색 | `colors.error.main` (라이트 `#f04452` / 다크 `#ff6b76`) |
| 접근성 | `role="alert"` — 스크린리더가 즉시 읽는다 |
| 사라짐 | **재검증 성공 시에만.** 타이머로 지우지 않는다 |

구현 위치 — 둘 다 같은 규격을 내야 한다.

1. **AntD `Form.Item`** (가게 등록·광고 신청·제재 모달 등) → `styles/global/components-and-forms.css`의
   `.ant-form-item-explain` 전역 규칙이 크기·간격을 맞추고, 색은
   `App.jsx`의 `ConfigProvider token.colorError`가 맡는다.
2. **`FormField`** (`components/common/FormModal.jsx`, 문의 모달 등) → 컴포넌트가 직접 렌더.

> ⚠️ AntD 기본 에러색은 `#ff4d4f`로 이 프로젝트 색(`#f04452`)과 다르다.
> `ConfigProvider`에서 `colorError`를 맞추지 않으면 **두 종류의 빨강이 섞인다.**
> 이 토큰 값은 AntD가 JS로 파생색을 계산하므로 `var(--c-error)`를 넣을 수 없다 — 리터럴이어야 하고,
> 그래서 `theme.css`와 값이 중복된다. 한쪽을 고치면 반드시 다른 쪽도 고쳐야 한다.

### 왜 자동으로 사라지게 하지 않는가

검증 에러는 **"지금 이 값이 잘못됐다"는 지속 상태**다. 값이 그대로인데 메시지만 사라지면
사용자는 이유를 잃고 제출을 다시 눌러야 원인을 다시 본다.
**WCAG 3.3.1(오류 식별)** 은 에러를 텍스트로 식별 가능하게 유지하도록 요구한다.

타이머로 사라지는 것은 **토스트**의 역할이다 — 결과 통보(`저장되었습니다`)처럼 지나가는 사건.
반대로 "제목을 입력해주세요"를 토스트로 띄우면, 사라진 뒤에 어느 칸이 문제였는지 알 수 없다
(문의 모달이 실제로 그랬고, 그래서 인라인으로 옮겼다).

### ★ 2026-08-17 — 이 규칙을 lint 로 강제한다

위 규격을 2026-08-04에 등재해뒀는데, **실제로 지켜진 파일이 `InquiryModal` 하나뿐이었다.**
`FormField`는 진작에 `error` prop을 받고 있었는데도 나머지 폼 8개는 전부
`message.warning`을 이어 붙이고 있었다. 필터 Select 색·카드 hover 그림자와 같은 실패 방식이다 —
**규칙이 문서와 주석에만 있으면 반드시 샌다.** 그래서 두 가지를 넣었다.

**① 관문 훅 `useFormErrors`** (`hooks/useFormErrors.js`)

`errors` state + `clearError` + "틀린 칸을 전부 모으는 `validate`"를 매번 손으로 쓰게 두면
그게 귀찮아서 `message.warning` 한 줄로 돌아간다. 훅 하나를 import 하면 끝나게 만들었다.

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

**② `no-restricted-syntax` lint 규칙** (`eslint.config.js`)

`message.warning`/`error`의 인자가 "○○을 **입력/선택/업로드/동의**해주세요" 또는 "…**필수입니다**"
꼴이면 CI가 실패한다. 이 코드베이스의 검증 문구가 실제로 쓰는 어미만 보므로,
`로그인이 필요한 서비스입니다`·`위치를 가져올 수 없어요` 같은 **필드에 귀속되지 않는**
정당한 토스트는 걸리지 않는다. 변수로 조립한 문구는 못 잡는다 — 의도적이다.
넓게 잡으면 정당한 토스트까지 막아서 결국 `eslint-disable` 주석이 늘어난다.

### 어느 기계를 쓸지 — 판단 기준은 하나다

> **이 입력칸이 AntD `<Form>` 안에 있는가?**

| 상황 | 쓸 것 |
|---|---|
| `<Form>` 안의 칸 | `Form.Item` 의 `rules` |
| `<Form>` 안이지만 Form 필드가 아닌 값(업로드 파일, 지도 좌표 등) | `form.setFields([{ name, errors: ['...'] }])` |
| `<Form>` 밖의 폼(`FormModal`·`FormField`) | `useFormErrors` + `<FormField error={...}>` |
| `FormField`로 감쌀 자리가 없는 곳(별점, 약관 체크박스 묶음) | `<span className="reserve-field-error" role="alert">` 직접 |

⚠️ **두 기계를 한 칸에 섞지 말 것.** `Form.Item rules`와 `FormField error`를 같이 주면
같은 칸 아래에 에러가 두 번 렌더된다.

### 검증 로직을 두 군데 두지 말 것

전환하면서 **도달할 수 없는 검사 3곳**을 발견해 지웠다 —
제출 버튼이 `disabled`로 이미 막고 있거나(`Signup`의 `isVerified`, `SocialAgreement`의 `allRequired`),
AntD `onFinish`가 검증 통과 후에만 불리는데 핸들러에서 같은 검사를 반복하고 있었다(`MyPage` 사업자 폼).
**죽은 검사는 없는 것보다 나쁘다** — 읽는 사람이 "검증이 여기 있다"고 믿어 진짜 관문을 못 찾는다.

---

## 목록을 넘기는 방법 — 페이지네이션과 연속 탐색 (2026-09-13 갱신)

PC·모바일을 서로 다른 목록 방식으로 나누지 않는다. 공개 가게 목록도 사용자가 다시 찾고
공유할 수 있는 페이지 좌표를 제공한다. 홈 추천 행은 짧은 탐색 미리보기이고 전체 결과는 `/stores`에서 넘긴다.

| 성격 | 화면 | 방식 | 구현 |
|------|------|------|------|
| **탐색 결과** — 조건·페이지를 보존해 다시 찾는다 | 가게 목록(`/stores`) | 서버 페이지네이션, 기본 12건 | `useStoreList.js` (`useQuery`) + 기존 AntD `Pagination` |
| **관리** — 특정 건을 찾아 처리하고, 어디까지 봤는지 기억해야 한다 | 관리자 패널 전 탭 | 서버 페이지네이션 | `DataTable` + `total` |
| **관리** — 예약을 검색·처리한다 | 사장님 예약 관리 | 서버 페이지네이션 | 기존 `ReservationCard` + AntD `Pagination`, 기본 15건 |

### 구현 상태 (2026-09-07 로컬 프리뷰 기준, 배포 전)

사장님 예약 관리는 카드 모양을 유지하면서 서버 검색·필터·전체 건수와 페이지 이동을 연결했다.
`useManageReservations`의 query key에 `page`, `size`, `search`, `status`, `storeId`를 포함한다.
검색·필터 변경은 첫 페이지로 돌아가고, 요청사항도 서버 검색에 포함된다.
동일 생성 시각은 id 보조 정렬로 구분한다. 101건·201건 경계, 다른 사업자 가게 제외, count 일치 회귀 테스트가 있다.
정상 0건과 조회 실패는 다른 화면 상태다. 이 결과는 로컬/mock/H2 검증이며 운영 반영 증거가 아니다.

| 화면 | 지금 상태 | 문제 |
|------|-----------|------|
| 사장님 광고 관리 (`AdManageTab`) | `pagination={false}` | 서버(`getMyAds`)가 `List` 를 통째로 주는 구조라 페이지 개념이 없다. 사장 한 명의 광고 수는 적어서 당장 문제는 아니지만, 규칙상 관리 화면이므로 예외로 남는다 |

광고 관리는 전건 List이므로 예약의 첫 100건 누락과는 다른 문제다. 광고 수가 늘 때 서버 페이지네이션으로 별도 전환한다.

### 왜 이렇게 나누나

2026-09-13 사용자 요청에 따라 공개 가게 목록의 무한 스크롤 규칙을 교체했다. 결과를 제한된
카드 묶음으로 보여주면 원래 카드 크기와 법적 고지 푸터를 유지하면서 다음 결과로 이동할 수 있다.
다만 offset 페이지는 중간 데이터 추가·삭제 때 결과 위치가 바뀔 수 있으며 고정 스냅샷은 아니다.

- URL은 `page=2`처럼 1부터, 서버 요청은 `page=1`처럼 0부터 시작한다. `size=12`를 명시한다.
- 키워드·분야·정렬·좌표 변경은 첫 페이지로 돌아가고, 페이지 이동은 다른 조건을 보존한다.
- 페이지별 query key와 캐시를 분리하고 이전 페이지의 늦은 응답은 현재 결과를 덮지 않는다.
- Spring Boot 3.5의 `page.totalElements`/`page.totalPages`와 이전 평탄 응답을 모두 읽는다.
- 삭제로 결과가 줄거나 잘못된 공유 URL이면 유효 페이지로 replace 보정한다. 조회 실패는 정상 0건과 구분한다.
- 페이지 클릭은 맨 위로 이동한다. 무한 스크롤 sentinel·추가 로딩·"모두 불러왔습니다" 문구는 두지 않는다.
- 기존 회색 선택 면의 AntD `Pagination`을 재사용한다. 번호 면은 PC 32px·모바일 30px 라운드 사각형이다. 모바일은 `showLessItems`와 `size="small"`이며 페이지 크기 선택은 숨긴다.

관리 화면도 모바일에서 같은 서버 페이지네이션을 유지한다. 서버 전체 건수는 현재 페이지 행 수로 대체하지 않는다.

### 새 목록을 만들 때

- 공개 가게 검색·분야·전체 목록인가 → 기존 카드 + 서버 페이지네이션. 홈 추천 미리보기와 구분한다.
- 연속 피드인가 → 무한 스크롤 여부를 별도로 결정한다. 아직 준비 중인 피드를 구현 완료로 표현하지 않는다.
- 운영자가 **처리하는** 목록인가 → `DataTable`. 서버 페이지네이션이면 `total` 을 반드시 넘긴다
  (안 넘기면 AntD 가 현재 페이지의 행 수로 페이지 수를 계산해 실제보다 적게 나온다).
- 애매하면 페이지네이션을 고른다. 되돌리기 쉬운 쪽이다.
- **인자 없이 목록 API 를 부르지 말 것.** 서버 기본 `size` 가 조용히 상한이 되어
  그 뒤 데이터가 화면에서 사라진다(위 사장님 예약 관리가 그 사례다).

---

## 규칙

- UI에 텍스트 이모지 사용 금지 — 동작·상태 아이콘은 Ant Design 아이콘 사용
- 홈·검색 분야 바로가기는 오리지널 투명 WebP 물체 이미지 사용. 배경 판·테두리를 붙이지 않고 분야별 광학 크기는 `constants/discovery.js`, 홈 전용 바로가기는 `Home/index.jsx`에서 관리한다
- 색상/크기는 반드시 토큰 사용 (하드코딩 금지)
- 사진 중심 반응형 홈의 패턴 치수는 `feature-surfaces.css`의 `--reserve-home-*` 변수에서 관리한다. 기존 헤더와 같은 최대 폭 1248px 안에서 유동적으로 확장하고, 여백은 모바일 20px(아주 좁으면 16px)·태블릿/PC 24px이다. 바로가기는 모바일/태블릿 5열, PC는 서비스 6개와 빠른 메뉴 4개의 두 영역이다. 배너는 모바일/태블릿에서 원본 960×640의 3:2 비율을 유지하며, PC(900px 이상)는 전용 1600×640 사진을 한 장씩 2.5:1 가로형으로 보여준다. `picture`로 사진을 선택하고 모바일 사진을 늘리거나 긴 가로형으로 잘라 쓰지 않는다. PC 다음 버튼과 표시 번호는 현재 한 장의 프레임 안에 둔다. 페이지 선택은 프로필 메뉴를 사용하고 고정 하단 메뉴·보정용 공백은 두지 않는다. 다른 업무 화면의 폭 정책은 바꾸지 않는다
- 모바일 주요 화면의 공통 헤더는 `R 로고 — 검색창 — 둥근 프로필 사진`, 하위 화면은 `뒤로가기 — 검색창 — 둥근 프로필 사진`이다. PC는 하위 화면에서도 전체 RESERVE 워드마크를 유지하고 뒤로가기를 숨긴다. 모든 공통 헤더의 높이는 `heights.header` 64px이고 동일한 최대 폭·반투명 배경·반응형 여백을 사용한다. 홈만 높이·간격·배경을 덮어쓰지 않는다. 검색창은 44px 높이/100px 반경의 `/search` 진입 링크이며 남은 너비에 맞춰 줄어든다. 검색 결과에서는 현재 검색어를 보여주고 검색 화면에 다시 넘긴다. 별도 검색·찜 아이콘은 두지 않는다. 모바일 로고/뒤로가기·프로필의 44px 동작 영역, 테마 토큰, 중립 hover·키보드 포커스 링을 유지한다
- 상단 탭은 `홈 · 탐색 · 혜택 · 웨이팅 · 피드`이며 높이는 44px다. 공통 `DiscoveryNav`를 주요 화면에 한 번 렌더하며 활성 탭은 경로로 판정한다. 분야·검색 결과 목록과 가게 상세·계정 화면에는 탭을 숨기고 모바일에서만 헤더 뒤로가기를 제공한다. 분류 기준은 `constants/discovery.js` 한 곳에 둔다. 혜택·웨이팅·피드는 현재 디자인용 준비 중 화면이며 실제 할인·대기 접수·피드 기능을 구현했다고 표현하지 않는다
- 홈 추천 가게는 테두리 카드/가로 사진 레일이 아니라 작은 둥근 썸네일과 설명이 나란한 목록 행이다. 썸네일은 모바일 64px·태블릿/PC 80px, 반경 14px이며 오른쪽은 `가게 이름 → 소개 → 평점·리뷰 수·분류/주소` 순서다. 서버가 준 값만 표시하고 리뷰가 없으면 평점을 꾸미지 않는다. 모바일/태블릿은 1열, 900px 이상은 동일한 행을 2열로 배치한다. 로딩도 같은 행 치수의 `Bone`으로 맞추고 정상 0건과 조회 실패는 구분한다
- 일반 가게 목록의 StoreCard는 원래 공통 카드(각진 모서리·기존 그리드)다. Card.Cover는 `width: 100%; height: auto`로 원본 비율을 유지하며 홈 추천 행의 정사각 썸네일 규칙을 적용하지 않는다. 페이지별 190px/220px 이미지 크롭은 두지 않는다
- 가게 상세의 `StoreIdentity`는 PC·모바일에 동일하게 사용한다. 가게명(모바일 22px·PC 24px) 옆에 작은 `문의` 보조 액션을 두고 평점·리뷰 수·소개를 아래로 배치한다. 문의 클릭 영역은 최소 56×44px이며 기존 로그인/가게 채팅 진입을 유지한다. 소개를 좁은 정보 표의 한 행에 중복하지 않는다
- 인라인 스타일로 토큰 적용 (`style={{ color: colors.text.primary }}`)
- 업로드 이미지 URL은 `getImageUrl()`/`getThumbnailUrl()` 유틸 사용 (CloudFront URL 처리). 프로젝트의 정적 자산은 `/images/…` 경로를 사용한다
- 홈 이미지 자산·레이아웃 참고 범위·최종 생성 프롬프트: [home-visual-assets.md](home-visual-assets.md)
- 실제 검색 입력은 `/search` 전용 화면으로 분리하며 필드 높이 44px/반경 100px·입력 글꼴 16px·버튼 동작 영역 44px다. 검색 아이콘은 장식이며 별도 실행 버튼 없이 Enter/키보드 검색 동작으로 제출한다. 로그인/역할에 따른 기존 계정 메뉴 경계는 유지한다. 상세: [search-ui.md](search-ui.md)
- 공개 화면의 후속 실측·참고 사이트 DOM/CSS 확인 범위: [design-measurements-2026-09-13.md](design-measurements-2026-09-13.md). 비로그인 실측을 인증 화면·운영 배포의 증거로 재사용하지 않는다
