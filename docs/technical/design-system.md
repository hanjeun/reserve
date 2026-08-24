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
| `radius.xl` (16px) | **Button, Card** | 손으로 만지는 표준 크기 |
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
3. **한 화면 안에서 인접한 요소는 같은 단계이거나 한 단계 차이여야 한다.** 카드(16) 안의 썸네일(10)은
   자연스럽지만, 카드(16) 안의 배지(24)는 어색하다 — 안쪽이 바깥쪽보다 더 둥글면 안 된다.

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

## 꺾쇠·화살표 회전 규칙 (2026-08-05 확정)

**규칙: 왕복 180°.** 펼치면 시계방향으로 180°, 접으면 같은 길을 반시계로 되돌아온다.

| 대상 | 구현 위치 | 회전 대상 |
|---|---|---|
| 드롭다운 꺾쇠 (Select) | `index.css` → `.ant-select-open .ant-select-suffix` | `span.ant-select-suffix` |
| 아코디언 화살표 (FAQ) | `FaqSection.jsx` 안 `faqCollapseStyles` → `.ant-collapse-item-active .ant-collapse-arrow` | `span.ant-collapse-arrow` |

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

## Select는 두 종류다 — 컴포넌트로 강제한다 (2026-08-04 등재)

| 컴포넌트 | 모양 | 언제 쓰나 |
|---|---|---|
| **`FormSelect`** | 채움형 회색 (`gray[50]` / 다크 `#23262b`), 높이 54px | **값을 적어 넣는 칸.** 가게 등록 카테고리, 마이페이지 글꼴, 광고 등록 |
| **`FilterSelect`** | 흰 면 + 옅은 테두리 (다크 `#1e2126`), `size="large"` | **목록을 조작하는 도구.** 별점순, 예약관리·광고관리 필터, 통계 가게 선택 |

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

`.reserve-form-select` / `.reserve-filter-select` 규칙은 **`index.css`에 있다.**
컴포넌트 파일 안의 `<style>` 태그에 전역 규칙을 넣으면 **그 컴포넌트를 안 쓰는 화면에는
규칙이 아예 존재하지 않는다.** 이 함정에 두 번 빠졌다(위 표의 1·2번).

- **전역 정책**(색·높이·상태별 톤) → `index.css`
- **컴포넌트 지역 스타일**(그 인스턴스에만 적용되는 폭·간격) → 인라인 `style`

> 아직 파일 안 `<style>`을 쓰는 곳이 남아 있다 — `Button`, `Card`, `AdBanner`, `Loading`,
> `Footer`, `QrScannerTab`, `MyFavorites`, `FilterToolbar`. 전역 규칙이 섞여 있으면 옮기는 게 맞다.

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

1. **AntD `Form.Item`** (가게 등록·광고 신청·제재 모달 등) → `index.css`의
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

## 규칙

- UI에 텍스트 이모지 사용 금지 — Ant Design 아이콘만 사용
- 색상/크기는 반드시 토큰 사용 (하드코딩 금지)
- 인라인 스타일로 토큰 적용 (`style={{ color: colors.text.primary }}`)
- 이미지 URL은 항상 `getImageUrl()` 유틸 사용 (CloudFront URL 처리)
