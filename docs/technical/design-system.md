# 디자인 시스템

Ant Design 기반 디자인 토큰 시스템입니다.

---

## 디자인 토큰 (`frontend/src/styles/tokens/`)

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

fontSize.xs     // 12px
fontSize.sm     // 13px
fontSize.md     // 14px
fontSize.base   // 15px
fontSize.lg     // 16px
fontSize.xl     // 17px
fontSize['2xl'] // 18px
fontSize['3xl'] // 20px
fontSize['4xl'] // 24px
fontSize['5xl'] // 32px
```

### Spacing / Radius / Heights

```js
import { radius, heights, maxWidth, shadows } from '../styles/tokens';

radius.sm     // 4px
radius.md     // 10px
radius.lg     // 14px   — Input
radius.xl     // 16px   — Button, Card
radius['2xl'] // 20px
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

### Form 컴포넌트

```jsx
import { FormInput, FormTextArea, FormSelect, FormDatePicker, FormTimePicker } from '../components/common';

<FormInput placeholder="이메일" />
<FormInput type="password" />
<FormInput.WithButton buttonText="인증코드 전송" onButtonClick={fn} />
<FormTextArea rows={4} maxLength={1000} showCount />
<FormSelect options={STORE_CATEGORIES} />
<FormDatePicker />
<FormTimePicker />
<FormTimePicker.RangePicker />   // 영업시간 설정용
```

모든 입력 필드: `variant="filled"`, `border: none`, `backgroundColor: colors.gray[50]`, `borderRadius: radius.lg`, `height: heights.input`, `fontSize: 16px`(호출부 `size` prop과 무관하게 항상 동일 — `.reserve-form-field` CSS 클래스로 전역 강제)

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

<Card hoverable onClick={fn}>
    <Card.Cover src={imageUrl} />
    내용
</Card>
<Card.Add onClick={fn}>새 가게 등록</Card.Add>
```

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

사용 가능한 Skeleton: `StoreCardSkeleton`, `ReservationCardSkeleton`, `MyReservationCardSkeleton`, `ReviewCardSkeleton`, `StoreDetailSkeleton`, `FavoriteCardSkeleton`, `AdminTableSkeleton`

### FavoriteButton

```jsx
<FavoriteButton storeId={id} />
<FavoriteButton storeId={id} initialStatus={true} />
```

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

## 규칙

- UI에 텍스트 이모지 사용 금지 — Ant Design 아이콘만 사용
- 색상/크기는 반드시 토큰 사용 (하드코딩 금지)
- 인라인 스타일로 토큰 적용 (`style={{ color: colors.text.primary }}`)
- 이미지 URL은 항상 `getImageUrl()` 유틸 사용 (CloudFront URL 처리)
