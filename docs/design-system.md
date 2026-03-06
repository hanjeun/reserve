# 프론트엔드 디자인 시스템

RESERVE 프론트엔드는 Ant Design 기반의 통합 디자인 토큰 시스템을 사용합니다.

---

## 1. 디자인 토큰 (`frontend/src/styles/tokens/`)

### Colors

```js
import { colors } from '../styles/tokens';

colors.primary.main      // #3182f6  — 브랜드 블루
colors.primary.light     // #e8f3ff  — 연한 배경
colors.primary.dark      // #1b64da  — 호버
colors.gray[50]          // #f9fafb  — Input 배경
colors.gray[100]         // #f2f4f6  — 비활성 배경
colors.text.primary      // #191f28
colors.text.secondary    // #4e5968
colors.text.tertiary     // #8b95a1
colors.border.light      // #f2f4f6
colors.border.default    // #e5e8eb
colors.success.main      // #20c997
colors.error.main        // #f04452
colors.warning.main      // #f59f00
```

### Typography

```js
import { fontWeight, fontSize } from '../styles/tokens';

fontWeight.regular   // 400
fontWeight.medium    // 500
fontWeight.semibold  // 600
fontWeight.bold      // 700
fontWeight.extrabold // 800

fontSize.xs   // 12px
fontSize.sm   // 13px
fontSize.md   // 14px
fontSize.base // 15px
fontSize.lg   // 16px
fontSize.xl   // 17px
fontSize['2xl'] // 18px
fontSize['3xl'] // 20px
fontSize['4xl'] // 24px
fontSize['5xl'] // 32px
```

### Spacing / Radius / Heights

```js
import { radius, heights, maxWidth, shadows } from '../styles/tokens';

radius.sm   // 4px
radius.md   // 10px
radius.lg   // 14px   — Input
radius.xl   // 16px   — Button, Card
radius['2xl'] // 20px
radius.full   // 50%
radius.pill   // 100px

heights.input      // 54px
heights.buttonLg   // 56px
heights.buttonHero // 64px
heights.buttonSm   // 36px
heights.buttonMd   // 44px
heights.header     // 64px

maxWidth.sm  // 420px  — 로그인, 회원가입, 가게 등록
maxWidth.md  // 700px  — 상세 페이지
maxWidth.lg  // 1000px — 관리 페이지
maxWidth.xl  // 1200px — 목록 페이지

shadows.card      // 0 2px 12px rgba(0,0,0,0.04)
shadows.cardHover // 0 4px 20px rgba(0,0,0,0.08)
```

---

## 2. 공통 컴포넌트 (`frontend/src/components/common/`)

### Button

```jsx
import { Button } from '../components/common';

<Button variant="primary" block>로그인</Button>
<Button variant="secondary">취소</Button>
<Button variant="hero">시작하기</Button>
<Button variant="ghost">← 뒤로가기</Button>
<Button variant="link">회원가입</Button>
<Button variant="ghost-sm-danger" loading={false}>삭제</Button>
<Button variant="ghost-sm-primary">결제하기</Button>
```

### Form 컴포넌트

```jsx
import { FormInput, FormTextArea, FormSelect, FormDatePicker, FormTimePicker } from '../components/common';

<FormInput placeholder="이메일" />
<FormInput type="password" />
<FormInput.WithButton buttonText="인증코드 전송" onButtonClick={fn} />
<FormTextArea rows={4} maxLength={1000} showCount />
<FormSelect options={STORE_CATEGORIES} />
<FormDatePicker placeholder="날짜 선택" />
<FormTimePicker placeholder="시간 선택" />
<FormTimePicker.RangePicker />   // 영업시간 설정용
```

### PageContainer

```jsx
import { PageContainer } from '../components/common';

<PageContainer size="sm">폼 페이지 (420px)</PageContainer>
<PageContainer size="md">상세 페이지 (700px)</PageContainer>
<PageContainer size="lg">관리 페이지 (1000px)</PageContainer>
<PageContainer size="xl">목록 페이지 (1200px)</PageContainer>
```

### Card

```jsx
import { Card } from '../components/common';

<Card hoverable onClick={fn}>
    <Card.Cover src={imageUrl} />
    <div style={{ padding: '16px' }}>내용</div>
</Card>
<Card.Add onClick={fn}>새 가게 등록</Card.Add>
```

### Skeleton

```jsx
import {
    StoreCardSkeleton, ReservationCardSkeleton,
    MyReservationCardSkeleton, ReviewCardSkeleton,
    StoreDetailSkeleton, FavoriteCardSkeleton,
    AdminTableSkeleton
} from '../components/common';

// 로딩 상태에서 카드 구조와 1:1 대응
if (isLoading) return <StoreCardSkeleton count={6} />;
```

### FavoriteButton

```jsx
import { FavoriteButton } from '../components/common';

<FavoriteButton storeId={id} size="sm" />             // 초기 상태 자동 조회
<FavoriteButton storeId={id} initialStatus={true} />  // 초기 상태 명시
```

---

## 3. 스타일 규칙

### Input

```js
// 모든 입력 필드 통일 규칙
variant="filled"
border: 'none'
backgroundColor: colors.gray[50]
borderRadius: radius.lg   // 14px
height: heights.input     // 54px
```

### 카드

```js
// StoreCard, ReservationCard 등 공통
borderRadius: radius['2xl']          // 20px
border: `1px solid ${colors.border.light}`
boxShadow: shadows.card
```

### 버튼 애니메이션

```css
/* 각 variant의 :active 상태 */
.reserve-btn--primary:active:not(:disabled)   { transform: scale(0.97); }
.reserve-btn--secondary:active:not(:disabled) { transform: scale(0.97); }
.reserve-btn--hero:active:not(:disabled)      { transform: scale(0.98); }
```

---

## 4. Import 패턴

```js
// 컴포넌트
import { Button, FormInput, PageContainer, Card, Loading } from '../components/common';

// 훅
import { useMessage, useStoreData, useReservations } from '../hooks';

// 상수
import { API_ENDPOINTS, STORE_CATEGORIES, RESERVATION_STATUS_LABELS } from '../constants';

// 유틸
import { getThumbnailUrl, formatDate, formatCurrency } from '../utils';

// 토큰
import { colors, radius, fontWeight, fontSize, heights } from '../styles/tokens';
```
