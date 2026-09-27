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

모든 `Button`은 `.reserve-btn:focus-visible` 공통 링(본문 보조색 2px — 2026-09-23 파랑에서 중립으로 통일)을 사용한다. 호출부에서 `outline: none`을 추가하거나
키보드 포커스 스타일을 덮지 않는다. 로딩 중에는 네이티브 `disabled`와 `aria-busy`가 함께 적용된다.

### CopyableText

```jsx
import CopyableText from '../components/common/CopyableText';

<CopyableText value={merchantUid} label="주문번호" />
```

주문번호·예약번호·이메일처럼 값을 직접 복사해야 하는 표시는 이 컴포넌트만 쓴다. 값이 없으면 복사 버튼을
그리지 않고, 값이 있으면 같은 Ant Design 아이콘·40px 클릭 면·완료 안내를 제공한다. `Typography`의
`copyable`과 화면별 복사 버튼은 금지한다. 이 컴포넌트는 지연 화면의 공통 바렐 의존을 늘리지 않도록
직접 import한다.

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

입력칸 포커스는 `components-and-forms.css`의 포커스 규칙 한 곳(공통 입력 `.reserve-form-field`·선택칸 `.reserve-form-select`·시간 선택·날짜 선택 버튼)에서 **1px 중립 테두리**(안쪽 그림자, `--c-text-secondary`)로 표시한다. filled + `border: none` 칸이라 AntD 기본 파란 포커스 테두리는 보이지 않으므로, 호출부에서 포커스 색을 따로 칠하지 않는다(예전 주소 검색의 파란 테두리·halo 가 그 예외였다). 오류 상태의 빨간 링은 덮지 않는다.

입력창 옆의 실행 버튼은 **용도별 두 패턴**이다. 인증코드 발송처럼 문구가 필요한 폼 실행은 `FormInput.WithButton`의 필드 높이 전체에 붙은 버튼을 쓰고, 메시지 전송처럼 아이콘만 필요한 실행은 채팅 입력 껍데기 안쪽의 44×44px·10px 모서리 버튼을 쓴다. 두 패턴의 모양을 억지로 같게 만들지 않는다. 고객·관리자 채팅 전송 버튼의 크기·반경·상태색과 키보드 포커스는 `.reserve-chat-send` 한 관문에서 관리하고, 화면별 인라인 크기나 별도 hover 색을 두지 않는다. 입력 껍데기 포커스는 검색 필드처럼 중립색 테두리이며 마우스 클릭 시 파란 halo를 만들지 않는다. 아이콘 버튼에는 접근 가능한 이름을 붙이고 비활성·전송 중 상태를 유지한다.

등록·수정 공통 `StoreForm`은 RESERVE 작업 패턴 예외다. 768px 미만에서만 기존 토큰의
44px 액션 높이·10px 모서리, 필드12/라벨 아래8px, 라벨 최소22px를 쓴다. 짧은 정책 필드만 두 칸으로
묶으며 textarea·달력 포털·다른 Core 폼은 축소하지 않는다. AntD 6 Select는 높이와24px 글자 줄 높이
변수를 함께 맞춘다. 768–899px은 주요 한 열, 900px 이상은 두 열이며900–1023px 시간 범위 행만 세로다.
실측과 보존 계약은 [모바일 폼 보정 기록](history/2026-09-preview/layout-regressions-2026-09-14.md)을 참고한다.

#### 날짜 선택 표면

날짜 필드는 AntD의 값 계약(dayjs, `value/onChange`, `disabledDate`)을 유지하지만 달력 표면은
`FormDatePicker`가 직접 그린다. 가게 등록·수정의 운영 기간, 임시 휴무일, 광고 기간이 모두 이 관문을
지나므로 화면마다 다른 원시 DatePicker 팝업을 만들지 않는다.

- 한 날짜는 선택 즉시 닫고, 여러 날짜·기간은 하단 완료 버튼으로 확정한다.
- 기간 선택은 시작/종료 칸과 범위 강조를 함께 보여준다. 한쪽만 허용하는 `allowEmpty`도 보존한다.
- 시작/종료 중 편집할 칸은 입력 포커스와 같은 중립 테두리로 표시한다. 선택 날짜는 회색 면(gray-200)+진한 글자, 기간 사이는 옅은 회색(gray-100)이다 — 예약 달력·시간 칩과 같은 무채색 규칙(2026-09-23, primary 로 바뀌었던 것을 되돌림).
  사용한다. 오늘은 외곽선을 하나 더 만들지 않고 작은 중립 점으로 표시해 상태 외곽선이 섞이지 않게 한다.
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

"작성해서 제출" 계열 모달(문의하기, 메일 작성 등)의 공용 뼈대 — 기본 너비(520px) · 타이틀 스타일 · 취소/제출 버튼 스타일 · 필드 세로 간격을 한 곳에서 관리해 모달마다 제각각 달라지는 것을 막는다.

다단계 폼은 `Modal`에 `key`를 주지 않는다. 언마운트로 닫힘 애니메이션이 사라지기 때문이다. 대신
`scrollResetKey`에 현재 단계를 넘겨 같은 `.ant-modal-body`가 재사용돼도 다음 단계가 항상 맨 위에서 시작하게 한다.
AntD popup의 기준 레이어는 `spacing.js`의 `zIndex.modal`(1100)이며 헤더와 메신저 실행 버튼보다 위다.
결제·폼 모달 위에 고정 UI가 올라와 버튼을 가리지 않도록 이 값은 `App.jsx`의 `zIndexPopupBase` 한 곳에서 적용한다.

광고 작성은 `추천 문구 → 제목 → 내용` 순서다. 추천을 선택하면 두 입력을 채우지만 사용자가 다시 수정할 수 있고,
최종 단계는 운영 `AdBannerSurface`를 그대로 사용한다. 신청 정보는 행마다 상자를 두른 청구서가 아니라 얇은 구분선과
단일 결제 금액만 사용한다. 모션 재생도 별도 outline 버튼을 만들지 않고 `RefreshButton label="효과 다시 보기"`를 재사용한다.
노출형(`BADGE`)은 별도 배지 이미지가 아니라 목록의 실제 `StoreCard`·`StoreListRow`에 작은 `광고` 텍스트를 붙인다.
미리보기에서는 두 컴포넌트를 읽기 전용으로 재사용하고 링크·찜·노출 집계를 만들지 않는다. 두 단계의 구분은
공통 모달 제목과 하단 동작으로 충분하므로 `1 / 2` 같은 별도 파란 진행 문구를 두지 않는다.

확인 계열은 `useMessage.confirm`의 `reserve-confirm-root` 관문을 사용한다. AntD 6 포털 패널은
좌우16px·safe-area·`100svh` 안에 들어가고, 긴 본문만 스크롤하며 버튼 행은 최소44px로 분리한다.
옵션·콜백·disabled·문장 줄 나눔은 유지한다. 원시 modal 전체나 `FormModal`에 같은 규칙을 전파하지 않는다.

### PageContainer

```jsx
import { PageContainer } from '../components/common';

<PageContainer size="sm" />   // 420px — 폼 페이지
<PageContainer size="md" />   // 700px — 상세 페이지
<PageContainer size="lg" />   // 1000px — 관리 페이지
<PageContainer size="xl" />   // 1200px — 목록 페이지
```

기본 `boxSizing: 'border-box'`로 좌우 패딩을 `width: 100%` 및 최대 너비 안에 포함한다.
호출부마다 모바일 overflow를 숨기는 보정 대신 이 공통 관문에서 너비를 관리한다.

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

`DataState`는 **읽기·목록 조회**의 표시 관문이다. 빈 결과는 회색의 도메인 아이콘과 안내만,
조회 실패는 상태에 맞는 회색 Ant Design 아이콘과 사용자 안전 문구, 같은 회색 `다시 불러오기`를 보인다.
서버의 원문 오류·스택·권한 세부 내용은 화면에 직접 표시하지 않는다. `listErrorMessage`가 HTTP 상태를
사용자 문구와 아이콘 의미(`offline`, `forbidden`, `missing`, `rateLimited`, `retry`, `unavailable`)로 정규화한다.

- 같은 화면에서 독립 조회가 모두 실패하면 상위 영역의 `DataState` 하나로 합친다. 가게 필터와 예약 목록이
  동시에 실패해 색 경고가 두 줄로 쌓이던 경우가 이 규칙의 대상이다.
- 목록·차트·테이블의 **결과가 나올 자리**에 둔다. 페이지 제목·소개 바로 아래나 탭 헤더와 툴바 사이에
  오류 띠를 끼우지 않는다. 첫 조회 실패는 `제목 → 필터/새로고침 → DataState` 순서이며, 이전 결과가
  남아 있는 재조회 실패만 그 결과 바로 위에 `compact` 상태로 둔다.
- 일부 조회만 실패해 이미 표시할 데이터가 있으면, 성공한 데이터를 지우지 않고 해당 영역에 `compact` 상태만 둔다.
- 상세 페이지도 같은 관문을 쓴다. 존재하지 않는 항목은 빈 상태 아이콘으로, 조회 실패는 상태별 오류 아이콘과
  재시도로 구분한다.
- 데이터 조회 재시도는 항상 `DataState`의 중립 `다시 불러오기`를 쓴다. 요청 중에는 같은 자리에
  Ant Design `SyncOutlined` 회전 아이콘을 보이며 일반 로딩 링으로 바꾸지 않는다. 툴바의 전체 목록 갱신은
  `RefreshButton`의 `새로고침`을 유지하고, 그 화살표도 요청 중 회전한다. 같은 화면 상태를 다시 재생하는 동작은
  `label`만 구체적으로 바꿔 같은 버튼 언어를 쓴다. 등록·결제·삭제처럼 사용자의 새 작업을 보내는 버튼에는 적용하지 않는다.
- 폼 필드 검증, 제출/결제 mutation 실패, 카메라·위치 같은 장치 제어 실패에는 `DataState`를 쓰지 않는다.
  해당 입력 또는 동작의 실패 경계를 유지한다.

새 화면에서 이 규칙을 우회하지 못하도록 프런트 ESLint는 Ant Design `Alert`와 `Empty`의 직접 import를
막는다. 조회 결과는 `DataState`를 쓰고, 결제 결과처럼 거래의 확정·미확정 상태를 보여 주는 화면은 해당
도메인의 전용 상태 화면을 쓴다. 이 제한은 테스트의 AntD mock이나 이미 저장된 데이터의 부분 갱신 안내를
대체하지 않는다.

오류는 백엔드 HTTP 응답 → `axios`의 안전한 오류 객체 → React Query/훅의 `error` → `DataState` 순으로
전달한다. 따라서 전역 토스트로 같은 조회 실패를 한 번 더 띄우지 않는다.

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

정상 0건과 조회 실패는 다르다. 실패한 데이터로 빈 차트를 만들지 말고, 부분 실패면 `compact` `DataState`로
실패한 source만 표시하며 성공한 source는 유지한다.

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

PC·모바일 공통 헤더는 같은 전체 RESERVE 워드마크와 오른쪽 검색 아이콘·프로필을 사용한다. 워드마크는 Pretendard·22px·850 굵기·-0.8px 자간을 공유하며, 탐색 루트 밖의 화면은 PC와 모바일 모두 왼쪽 뒤로가기를 함께 둔다. 검색어가 있는 `/stores` 결과에서만 검색어를 보여주는 pill 링크를 두고 모바일(768px 미만)은 R로 줄여 폭을 확보한다. 높이 64px·검색/프로필 동작 영역 44px·기존 상호작용은 유지한다. 실제 입력은 전용 `/search`에만 둔다. 주요 화면의 탐색 탭은 44px 높이다.

**일반 탐색을 hover했다고 브랜드 파란색으로 바꾸지 않는다.** 브랜드 액션의 기존 색,
선택·오류·즐겨찾기 상태와 키보드 포커스 링은 별개다. `primary.dark` 토큰의 설명에
hover가 있다고 모든 링크를 파란색으로 바꾸라는 뜻은 아니다.

| 대상 | Hover | 누르는 동안 (`:active`) | 누른 뒤의 상태 |
|---|---|---|---|
| 공통 primary / secondary / outline 버튼 | 기존 색 유지, 투명도 또는 중립 테두리·면 변화 | `scale(0.96)` + 투명도; 메신저 홈 문의 CTA는 `scale(0.98)` | 동작 결과/로딩은 기존 컴포넌트가 관리 |
| ghost / link 버튼 | 기존 글자색 유지, 투명도 변화 | `scale(0.94–0.96)` + 투명도 | 링크·액션 의미 유지 |
| 헤더 검색 아이콘 / 뒤로가기 / RESERVE 워드마크 | 중립 면 또는 투명도 변화 | 뒤로가기는 왼쪽 180ms 피드백 후 이동. 워드마크는 움직이지 않고 즉시 이동하며, 탐색 탭 밖에서 오면 도착한 홈이 왼쪽에서 들어온다 | 기존 전용 검색 진입·PC/모바일 뒤로가기 |
| 프로필 사진 / 홈 3D 바로가기 / 추천 사진 카드 | 중립색 유지; 홈 이미지·추천 카드만 2px 상승 | 기존 `scale(0.94–0.97)` | 사진/물체의 눌림만 보존 |
| 메신저 footer의 홈·대화·설정 | 배경은 투명, 비활성 아이콘만 중립색으로 강조 | 이동·축소 없이 명암만 변화 | 활성 화면은 primary 아이콘·라벨, `aria-current=page` |
| 메신저 X·뒤로가기·새로고침 | 투명한 44×44 영역에 옅은 회색 면·중립 전경 | 이동·축소 없이 명암만 변화; 조회 중 새로고침은 무반응 | 화면 닫기·돌아가기·목록 다시 조회 |
| 메신저 문의 질문 | 중립 글자·테두리와 옅은 회색 면 | 축소 없이 명암만 변화 | 선택 문구는 입력 초안에 추가 |
| 홈 탭·지역·현재 위치·전체 보기·공지 텍스트 | 중립색 또는 투명도 | 크기·위치 변화 없이 명암 | 탭은 진한 글자 + 밑줄; 위치는 명시적 클릭에서만 요청 |
| 홈 scroll-snap 메인 배너 | 투명도만 변화 | 크기·위치 변화 없이 투명도 | 배너·트랙 scale 금지, 옆 배너와 snap 좌표 보존; 작은 3D/사진과 구분 |
| 전용 검색 화면 | 기존 중립색·회색 면 | 기존 소형 컨트롤 정책 | 헤더 일반 UI 변경을 검색 폼·Core 전체에 전파하지 않음 |
| 입력 없는 종류·정렬 메뉴 (`FilterMenu`) | 흰 면(다크 paper) 또는 투명 면, 중립 테두리/면 강조 | 크기 변화 없이 중립 면 변화 | 중립 선택 면 + 체크; 열림은 꺾쇠로 표시 |
| 일반 가게 카드 | 원래 중립 그림자 + 사진 `1.05` 줌, 글자색 유지; 공개 탐색의 hoverable 카드만 2px 상승 | 내부 이동 링크 `scale(0.98)` | 카드 크기·사진 원본 비율 유지 |
| 즐겨찾기 | 사진 위 오버레이는 흰 면·그림자 유지; `StoreCard`·`StoreListRow`의 정보 영역은 면 없는 하트만 유지 | `scale(0.94)` | `aria-pressed`와 빨간 하트가 선택을 표현 |
| pill tabs / SegmentedControl / 페이지네이션 | 회색 면 + 진한 글자 | 기존 소형 컨트롤의 눌림 규칙 | 회색 선택 면 / 진한 글자; 일반 AntD tabs의 선택색과 구분 |
| 날짜·시간 선택 | 회색 hover | 선택 셀의 기존 표현 | 선택 날짜·시간은 회색 면(gray-200)+진한 글자. primary 를 쓰지 않는다 |

공통 헤더·탐색 탭·홈·전용 검색·메신저의 X/뒤로가기/새로고침/전송/문의 질문·입력 없는 `FilterMenu`와 AntD 모달의 닫기 X의 키보드 `:focus-visible` 링은 본문 보조색 2px이다. 공통 버튼·카드 링크·즐겨찾기·달력 칸·차트까지 **모든 키보드 포커스 링이 같은 본문 보조색 2px**이다(2026-09-23 통일 — 파란 링이 18곳 섞여 있었다). 마우스 클릭·hover와 혼동하지 않는다. 메뉴를 터치해도 링을 붙이지 않는다.
텍스트 입력은 클릭만으로도 `:focus-visible`이 될 수 있으므로 이를 목록 메뉴의 판정에 쓰지 않는다.
검색 입력의 포커스는 중립색 테두리로 표시하며, 폼 오류·브랜드 액션의 기존 상태색은 바꾸지 않는다.
모션 감소 설정에서는 확대·축소/이동과 해당 전환을 끄되 상태색·포커스는 유지한다.
2px 상승은 hover 가능한 fine pointer와 모션 감소가 꺼진 환경에만 적용한다. 헤더·탭·필터 트리거와 열린 메뉴는 움직이지 않는다.
비활성·응답 대기 중에는 실제 클릭과 눌림 효과를 차단한다. 공통 버튼의 평상시 인라인
`opacity: 1`은 넣지 않는다. 전역 hover/active 투명도를 덮어 피드백을 죽이기 때문이다.

### 집중형 작업 화면의 여백·아이콘 규칙 (2026-09-21)

사업자·관리자·메시지처럼 한 작업에 집중하는 화면은 다음을 따른다. 공개 탐색·예약 화면에 별도 앱 사이드바를 추가하는 규칙은 아니다.

- 데스크톱 작업 내비게이션은 고정 폭 264–280px 안에서 제목·아이콘·짧은 라벨만 보인다. 활성 항목은 브랜드 파랑이 아닌 옅은 회색 면과 진한 글자로 표시하고, 한 화면에서 활성 면은 하나만 둔다.
- 기능 아이콘은 Ant Design의 같은 선형 계열만 사용한다. 기본 크기는 20px, 텍스트가 있는 버튼의 아이콘은 장식으로 숨기고 버튼 라벨만 접근 가능한 이름이 된다. 이모지·서로 다른 아이콘 세트를 섞지 않는다.
- 본문은 한 화면에 한 가지 주 동작만 둔다. 비어 있는 작업 면에는 설명을 길게 쌓지 않고, 한 줄 안내와 하나의 다음 행동만 둔다.
- 입력·작성 면은 큰 둥근 중립 테두리, 그림자는 아주 약하게, 포커스는 검색창·채팅 입력과 같은 1px 중립 테두리로 통일한다(`.reserve-form-field:focus-within`). 브랜드 파랑은 제출·선택 완료·현재 위치처럼 결과를 바꾸는 행동에만 쓴다.
- 화면 이동 피드백은 120–180ms 안에서 끝낸다. 공통 라우트는 헤더·탭을 멈춘 채 도착한 콘텐츠만 이동하며, 일반 진입·앞으로가기는 오른쪽, 뒤로가기·직접 진입 fallback은 왼쪽에서 들어온다. 홈 이동(RESERVE 워드마크)은 로고를 움직이지 않고, 도착한 홈 화면만 왼쪽 슬라이드로 들어온다. 같은 pathname의 필터·정렬·보기 전환에는 새 페이지 모션을 넣지 않는다. 모션 감소 설정에서는 즉시 이동한다.

이 표는 정책과 확인된 구현을 정리한 것이며 모든 업무 화면의 브라우저 실행 증거는 아니다.
기존 예외·미정리 규칙, 수정 전 전체 선택자 목록과 확인 범위는
[interaction-audit-2026-09-13.md](history/2026-09-preview/interaction-audit-2026-09-13.md)를 참고한다.

1차 화면 모션은 검색 내용만 PC 8px·모바일 24px을 220ms 동안 위로 들이고, 취소·Escape는 반대 방향으로 닫는다. 입력창·헤더는 고정하고 즉시 포커스를 유지한다. 홈 배너는 기존 scroll-snap으로 **슬라이드 전체**를 이동시키고, 사진·문구를 따로 재등장시키지 않는다. 전용 검색을 제외한 pathname 전환은 공통 라우트 진입 모션을 쓰며, 최상위 탐색 탭은 그 안에서 탭 순서로 방향을 정한다. 배너 목적지의 필터·결과와 목록의 이전·다음 페이지 결과 이동은 별도 국소 패턴이다. 데이터 로딩 스켈레톤과 카드↔가로 행 보기 전환에는 새 애니메이션을 넣지 않는다. 모션 감소에서는 즉시 표시한다. 두 라우트를 동시에 이동시키는 View Transition은 현재 `BrowserRouter` 셸에서 구현하지 않는다.

검증 하네스의 첫 단계는 코드·문서 규칙을 실제 화면에서 되풀이해 확인하는 것이다.
`npm run test:run -- src/components/chat/MessengerInteractionPolicy.test.js`는 메신저 상태 규칙을,
`npm run test:e2e -- e2e/interaction-patterns.spec.js e2e/search-motion.spec.js`는 PC·모바일 모의 Chromium의 hover·눌림·키보드 포커스·모션 감소를 검사한다.
`npm run build`의 postbuild 번들 예산은 앱 셸의 정적 의존성 증가를 차단한다.
기존 `test:policy`는 아직 이 새 브라우저 검사까지 실행하지 않는다. CI 관문 연결과 남은 업무 화면·실제 Safari 검증은 후속 범위다.

### RESERVE 홈 간격과 메신저 footer 패턴 (2026-09-13)

- 홈은 국소 변수 `--reserve-home-section-spacing: 20px`, `--reserve-home-content-spacing: 16px`,
  `--reserve-home-divider-size: 4px`를 사용한다. 같은 레벨의 섹션·내용·회색 구분선을 각각 구분한다.
  공통 폼/테이블/로딩 면까지 모든 회색 영역을 4px로 바꾸는 규칙은 아니다.
- 메신저의 `MessengerFooter`는 홈·대화·설정 네이티브 버튼, `aria-current=page`, 54px 버튼과
  약 63px 바닥 면이다. 스크롤되는 본문과 분리하며 메시지 입력 중에는 패널/모바일 footer를 숨긴다.
  2026-09-14 후속에서 hover 박스를 제거했다. 비활성 버튼은 라벨 색을 유지하고 아이콘만 중립색으로 반응한다. primary는 활성 탭에만 쓴다.
  `MessengerSettings`는 실제 계정·내 정보 관리·기존 알림 설정만 보여준다. 없는 번역/알림음 스위치를 만들지 않는다.
- PC 메신저 패널은 모든 내부 화면에서 420px, 모바일은 공통 64px 헤더 아래 화면이다.
  홈은 사진 커버·관리자 안내 카드·문의 CTA 하나만 둔다. 실제 상대 목록은 대화 탭의
  `MessengerConversationRow` 관문으로 모으며 소개 문구는 실제 메시지 말풍선으로 위장하지 않는다.
- 기존 Core와 동결 ZIP은 유지한다. [범위·실측·검사 경계](history/2026-09-preview/messenger-home-refinement-2026-09-13.md).

2026-09-14 후속 보정에서는 홈 메인 배너를 사진 눌림 예외에서 분리하고 모바일 등록·수정 폼의
밀도·공통 너비·확인 모달 높이를 안정화했다. [후속 실측](history/2026-09-preview/layout-regressions-2026-09-14.md).

### RESERVE 공개 탐색·메신저 패턴 (2026-09-14)

- 혜택은 후속 사용자 사진에 따라 **가게 사진 배경 → 짧은 실제 본문 → 큰 가게명 → 실제 소식 제목의 티켓**인 가로 배너 목록으로 전환했다. 작은 메뉴3개·중복 제목/설명/건수·일반 가게 탐색 mount는 제거했다. 일반 가게 필터·페이지는 `/stores`에서 유지하며 해당 독립 컴포넌트 소스는 보존했다. 혜택은 실제 공개 소식의12건 페이지 번호·조회 상태·AbortSignal·무관한 URL 값을 유지한다
- 톡 내부 커버는 `MessengerBrandCover`에서 기존 RESERVE `/og-image.png`를 기본으로 쓰고 `coverImageSrc` prop으로 교체할 수 있다. 런처 사진과 별도이며 설정/업로드 UI는 아직 없다. `MessengerAvatar`는 위험 프로토콜·자격증명 URL을 거부하고 사진 실패/부재 때 브랜드 이미지→아이콘으로 fallback한다. SUPPORT 홈·목록·헤더·ADMIN 말풍선은 담당자 개인 계정과 무관하게 `RESERVE 고객지원`과 브랜드 아바타로 고정한다. 회원이 보는 STORE 문의는 가게 이름, 사장님이 보는 받은 문의는 고객 이름이다. 지원 담당자의 이름·사진을 API에 포함하지 않으며 회원 ID/이메일도 표시하지 않는다
- 커버 사진 위의 중복 RESERVE 워드마크는 표시하지 않는다. `MessengerBrandCover`의 접근성 제목 ‘메시지’는 sr-only로 유지한다. `MessengerListHeading`은 72px 높이에서 제목·44px 새로고침을 가운데 정렬하고, PC 닫기의 44px 영역도 같은 헤더 높이 변수로 계산한다. 새로고침 hover는 아이콘 전경을 중립색으로 강조하고 옅은 회색 면을 보이며 박스 크기·축소 효과를 넣지 않는다. [실측과 조회 오류 경계](history/2026-09-preview/messenger-header-and-runtime-routing-2026-09-14.md)
- 대화·설정의 제목은 같은 72px 바, 왼쪽 여백(PC 20px·모바일 16px), 글자 크기와 하단 경계선을 공유한다. 홈은 사진 커버가 첫 위계라 별도 표면으로 유지한다. 대화 목록의 제목 아래 임의 8px 공백은 두지 않는다. 대화 행은 역할별 상대 이름과 마지막 실제 메시지 한 줄만 시각적으로 표시하며 중간 역할 설명은 넣지 않는다. 이전 방의 저장된 미리보기가 비어 있으면 권한 확인된 현재 페이지의 마지막 실제 메시지를 읽기 전용으로 조회한다. 진짜 빈 방에서만 ‘아직 메시지가 없습니다.’를 표시한다
- 메시지 설정 사진은 **현재 로그인 사용자의 `profileImageUrl`/`profileImage`**다. 관리자 사진 계약과 별개이며 안전한 URL을 검사하고 부재/로드 실패는 본인의 이니셜→사용자 아이콘이다. 계정/사진 변경 시 실패 상태를 초기화한다. 실제 알림 컨트롤이 있을 때만 환경 섹션과 구분선을 렌더하고 모바일 PC 안내·초안 설명은 표시하지 않는다
- 최신 범위·검사·반쪽 PC 실측은 [benefit-banners-and-account-avatar-2026-09-14.md](history/2026-09-preview/benefit-banners-and-account-avatar-2026-09-14.md)를 참고한다. 기존 Core·동결 스냅샷은 변경하지 않는다


- `/benefits`는 실제 소식만 배너로 보여준다. `page`는12건·서버 메타를 사용한다.
  아직 없는 혜택 종류·지역·유효기간·쿠폰·인기 집계·일반 가게의 혜택 제공 여부를 추정하지 않는다.
- 최대1248px, 모바일20px(360 미만16px)·태블릿/PC24px gutter를 사용한다. 국소
  `--reserve-benefit-section-spacing/content-spacing/divider-size`는20/16/4px다.
  데이터 면과 회색 구분선의 의미를 구분하며 Core 폼/테이블을 일괄 축소하지 않는다.
- 배너는900px 미만1열·이상2열이다. `--reserve-benefit-banner-ratio`의3.2:1 골격과
  `--reserve-benefit-banner-min-height`의120/164/156px 최소 높이를 grid로 겹쳐 긴 제목이면 자연스럽게 커진다.
  사진은 absolute·cover이며 왼쪽 그라데이션이 글자 대비를 확보한다. 전체 배너의 크기·위치는 hover/active에 바꾸지 않는다.
  실제 사진만 fine pointer·모션 감소OFF에서1.02 줌한다. 스켈레톤도 같은 너비·그리드·일반 배너 치수다.
  허용되지 않은/없는/실패한 사진은64px 로고이며 사진 URL 변경 시 placeholder 상태를 초기화한다.
- `--reserve-benefit-photo-backdrop/photo-fg/ticket-bg`는 사진 위 대비를 유지하는 고정 브랜드 패턴 토큰이다.
  나머지 크기·여백은 국소 `--reserve-benefit-banner-padding/store-size/description-size/ticket-size`로 관리한다.
  Core·사용자 강조색·StoreCard의 원본 비율/각진 모서리를 바꾸지 않는다. 키보드 포커스는 기존 보조색2px 링이다.
- [사진 배너·내 설정 검증과 실제/예시 데이터 경계](history/2026-09-preview/benefit-banners-and-account-avatar-2026-09-14.md).
  조건별 혜택 기획전·전체 페이지 전환·운영 반영 완료가 아니다.

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
| **관리** — 광고를 검색·처리한다 | 사장님 광고 관리 | 서버 검색·가게 필터·페이지네이션 | `DataTable` + Spring Page, 기본 20건·최대 100건 |

### 구현 상태 (2026-09-23 로컬 프리뷰 기준, 배포 전)

사장님 예약 관리는 카드 모양을 유지하면서 서버 검색·필터·전체 건수와 페이지 이동을 연결했다.
`useManageReservations`의 query key에 `page`, `size`, `search`, `status`, `storeId`를 포함한다.
검색·필터 변경은 첫 페이지로 돌아가고, 요청사항도 서버 검색에 포함된다.
동일 생성 시각은 id 보조 정렬로 구분한다. 101건·201건 경계, 다른 사업자 가게 제외, count 일치 회귀 테스트가 있다.
정상 0건과 조회 실패는 다른 화면 상태다. 이 결과는 로컬/mock/H2 검증이며 운영 반영 증거가 아니다.
사장님 광고 관리도 `page`·`size`·검색어·가게 필터를 서버에 보내고 Spring Boot 3.5의
`page.totalElements`를 전체 건수로 쓴다. 이전의 전건 `List` 예외는 제거됐다.

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

### 목록 상태 보존

목록 결과를 바꾸거나 다시 찾는 데 필요한 상태는 URL에 둔다. `page`, 검색어, 가게·상태·정렬 필터,
사업자 통계의 가게·기간, 광고 목록의 가게·검색어가 대상이다. 같은 화면 안의 여러 목록은
`reservation*`, `statistics*`, `advertisement*`처럼 이름을 나눠 서로 덮어쓰지 않는다.

카드/목록 보기는 결과 표현만 바꾸므로 URL의 `view`가 우선이다. 주소에 값이 없는 재진입에서는
`useViewModeParam`이 경로별 `sessionStorage`의 마지막 보기를 복원한 뒤 URL을 보정한다. 새 광고 신청,
수정 폼, 모달 열림, QR 스캔, 비밀번호·파일·위치 권한처럼 진행 중인 작업이나 민감한 값은 저장하지 않는다.

### 새 목록을 만들 때

- 공개 가게 검색·분야·전체 목록인가 → 기본 사진형 카드 또는 사용자 선택 목록형 + 서버 페이지네이션. 홈 추천 미리보기와 구분한다.
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
- 사진 중심 반응형 홈의 패턴 치수는 `feature-surfaces.css`의 `--reserve-home-*` 변수에서 관리한다. 기존 헤더와 같은 최대 폭 1248px 안에서 유동적으로 확장하고, 여백은 모바일 20px(아주 좁으면 16px)·태블릿/PC 24px이다. 바로가기는 모바일/태블릿 5열, PC는 서비스 6개와 빠른 메뉴 4개의 두 영역이다. 메인 캐러셀은 모바일/태블릿에서 원본 960×640의 3:2 비율, PC(900px 이상)에서 전용 1600×640의 2.5:1 사진을 쓴다. `picture`로 사진을 선택하고 모바일 사진을 늘리거나 긴 가로형으로 잘라 쓰지 않는다. 운영 안내는 공지 API를 다시 조회하지 않고, 같은 `picture` 원칙의 클릭 가능한 사진 링크(`/operation-guide`)를 모바일 3:2·PC 2.5:1로 보인다. PC 다음 버튼과 표시 번호는 현재 한 장의 프레임 안에 둔다. 페이지 선택은 프로필 메뉴를 사용하고 고정 하단 메뉴·보정용 공백은 두지 않는다. 다른 업무 화면의 폭 정책은 바꾸지 않는다
- PC·모바일 공통 헤더는 `뒤로가기(탐색 루트 밖) — 전체 RESERVE 워드마크 — 오른쪽 검색 아이콘·둥근 프로필 사진`이다. 검색어가 있는 `/stores` 결과에서는 아이콘 대신 현재 검색어를 보여주는 pill 링크를 두며 모바일(768px 미만) 로고만 R로 줄인다. 다른 화면과 PC는 전체 워드마크를 유지한다. 모든 공통 헤더의 높이는 `heights.header` 64px이고 동일한 최대 폭·반투명 배경·반응형 여백을 사용한다. 홈만 높이·간격·배경을 덮어쓰지 않는다. 일반 검색 아이콘은 44×44px `/search` 진입 링크이며 입력칸·실행 버튼이 아니다. 결과 필드도 기존 검색 화면으로 이동하는 링크이며 검색어를 복원한다. 추가 예약/찜/알림/메뉴 아이콘은 아직 두지 않는다. 뒤로가기는 실제 이동 직전 180ms 왼쪽 피드백을 보이되, 워드마크는 눌림·축소·대기 없이 즉시 이동하거나 홈 최상단으로 스크롤한다. 도착 페이지는 공통 라우트 진입 모션으로 이어받는다. 모션 감소 설정에서는 지연 없이 이동한다. 모바일 로고/뒤로가기·프로필의 44px 높이 동작 영역, 테마 토큰, 중립 hover·키보드 포커스 링을 유지한다
- 상단 탭은 `홈 · 탐색 · 혜택 · 웨이팅 · 피드`이며 높이는 44px다. 공통 `DiscoveryNav`를 주요 화면에 한 번 렌더하며 활성 탭은 경로로 판정한다. 헤더와 같은 `--c-header-bg`·20px 블러를 쓰고, 헤더와 탭의 배경은 모두 뷰포트 전체 폭, 내용은 같은 최대 1248px에 맞춘다. 탭이 있는 화면에서는 중간 경계선 없이 탭 하단에만 선 하나를 둔다. 분야·검색 결과 목록과 가게/소식 상세·계정 화면에는 탭을 숨기고 PC·모바일 공통 Header 뒤로가기를 제공한다. 분류 기준은 `constants/discovery.js` 한 곳에 둔다. 혜택은 실제 가게 소식·안내 목록/상세이며 쿠폰 발급/사용이 아니다. 웨이팅·피드는 준비 중 화면이다
- 홈 추천은 2026-09-14 최신 사용자 참고 화면에 따라 작은 정사각 사진 왼쪽·정보 오른쪽의 가로 행으로 전환했다. 900px 미만은 1열, 그 이상은 2열이며 3/4열로 압축하지 않는다. 사진은 모바일 64px·768px 이상 80px의 1:1 면에 `object-fit: cover`로 표시하고 정보와 12px 간격을 둔다. `가게 이름 → 한 줄 소개 → 실제 평점(리뷰 수)·분류/주소` 순서이며 긴 이름·소개·주소는 말줄임한다. 최신 피드백에 따라 0리뷰도 별 아이콘·`0.0 (0)`으로 통일한다. 기존 GET 4건·상세 링크·로딩/0건/실패/재시도를 보존하고 `Bone`도 같은 가로 골격을 사용한다. [입력창·홈 추천·이미지 로딩 점검](history/2026-09-preview/compact-messenger-and-home-store-rows-2026-09-14.md)
- 일반 가게 목록의 기본 StoreCard는 원래 공통 카드(각진 모서리·기존 그리드)다. Card.Cover는 `width: 100%; height: auto`로 원본 비율을 유지하며 홈 추천 행의 작은 정사각 미디어 면을 적용하지 않는다. 페이지별 190px/220px 이미지 크롭은 두지 않는다. 선택형 목록 보기는 형제 패턴 `StoreListRow`로 분리하며 공통 카드의 기본 스타일을 바꾸지 않는다
- `/stores` 보기 전환은 분야·정렬 오른쪽 끝의 투명한 44×44px 아이콘 버튼이다. 다음 보기 동작을 `UnorderedListOutlined`/`AppstoreOutlined`와 접근성 라벨로 표시하고, 중립 전경색 hover·키보드 포커스 링·Enter/Space를 유지한다. 목록형은 PC·모바일 모두 1열이며 사진은 768px 미만 80px, 그 이상 96px의 1:1 면·14px 반경·`object-fit: cover`, 정보 간격은 12px다. 이름 → 실제 한 줄 설명 → 유효 평점(리뷰 수) → 종류·AD·우리동네 일반 텍스트(광고 표시는 공용 AdMark — 화면엔 옅은 AD, 화면 낭독기엔 '광고') 순서이며 긴 텍스트는 말줄임한다. 종류·광고·우리동네는 칩 면을 쓰지 않고 `.reserve-store-identity-text`에서 간격과 줄바꿈을 공유한다. 광고는 문구를 유지하고 중립 대비·굵기로 구별한다. 목록형 배치는 이 후속에서 바꾸지 않는다. [구현·검증 기록](history/2026-09-preview/store-list-view-modes-2026-09-14.md)
- 사진형 `StoreCard`는 원본 사진 비율을 유지한다. 정보 영역은 이름과 별도 44px 하트를 같은 줄에 두고, 그 아래 종류·AD·우리동네 일반 텍스트(광고 표시는 공용 AdMark — 화면엔 옅은 AD, 화면 낭독기엔 '광고'), 그 아래 별점을 둔다. 정보 여백은 위아래 12px, 이름·종류·평점 사이 2px이며 하트의 44px 클릭 영역은 줄이지 않는다. 카드 전체의 상세 링크와 하트 버튼은 별도 키보드 대상이다. 로딩 스켈레톤도 제목·하트 자리 → 종류 정보 → 별점 순서로 맞춘다. 보기 선택은 URL에 `?view=cards` 또는 `?view=list`로 명시한다. 값이 없거나 잘못된 기존 링크는 해당 화면의 기본 보기 또는 같은 탭의 마지막 보기를 URL에 보정한다. 보기 전환은 같은 조회 데이터를 재사용하므로 별도 API를 만들지 않는다. 데이터 스켈레톤 중에는 보기·지역·분야·정렬을 모두 잠근다. 필터·페이지·목록 조회와 기존 관심 가게·12건 페이지네이션을 바꾸지 않는다.
- 가게 상세의 `StoreIdentity`는 PC·모바일에 동일하게 사용한다. 갤러리 다음에 가게명(모바일 22px·PC 24px)과 `문의` 보조 액션 → 공통 `StoreIdentityText`의 종류·우리동네 일반 텍스트 → 평점·리뷰 수 → 소개 순으로 배치한다. 키워드 배지는 소개 뒤의 보조 정보다. 카드와 정보 순서는 맞추되 상세 갤러리 위의 저장 하트, 사진 미리보기·지도·예약 정보는 유지한다. 문의 클릭 영역은 최소 56×44px이며 기존 로그인/가게 채팅 진입을 유지한다. 소개를 좁은 정보 표의 한 행에 중복하지 않는다
- 지역 선택은 홈·공개 목록이 같은 `RegionSheet`를 사용한다. 전국 17개 시도는 항상 선택 가능하고, 시군구·상단 인기 바로가기·가게 수는 현재 공개 ACTIVE 가게 주소의 실제 앞 두 토큰에서만 만든다. 선택은 시도 → 시군구 한 곳이며 `초기화`는 초안을 전국으로 바꾸고 `적용`이 URL `region`과 결과를 변경한다. 0건 지역은 빈 결과로 안내한다. 대표 사진은 서버가 검증한 공공누리 제1유형 관광정보 API 프록시만 사용한다. 사진이 없거나 로드에 실패하면 핀 아이콘을 유지하며, 출처는 한 개의 공개 안내 페이지로 연결한다. PC는 높이 최대 700px의 중앙 대화상자와 짧은 등장/닫힘, 모바일은 최대 86svh의 아래에서 올라왔다 내려가는 시트다. 시트는 메신저 런처보다 앞에 놓고, 헤더·적용 영역을 유지하며 두 목록만 독립 스크롤한다. 네이티브 버튼의 Tab/Enter, Escape·바깥 클릭 닫기, 44px 이상 클릭 영역, 작은 중립 hover 면·중립 키보드 포커스 표시와 모션 감소 시 즉시 전환을 유지한다. 분류/거리/페이지 URL 조건은 지역을 바꿀 때 보존하되 결과 페이지는 1로 돌아간다.
- 인라인 스타일로 토큰 적용 (`style={{ color: colors.text.primary }}`)
- 업로드 이미지 URL은 `getImageUrl()`/`getThumbnailUrl()` 유틸 사용 (CloudFront URL 처리). 프로젝트의 정적 자산은 `/images/…` 경로를 사용한다
- 홈 이미지 자산·레이아웃 참고 범위·최종 생성 프롬프트: [home-visual-assets.md](home-visual-assets.md)
- 실제 검색 입력은 `/search` 전용 화면으로 분리하며 필드 높이 44px/반경 100px·입력 글꼴 16px·버튼 동작 영역 44px다. 검색 화면 왼쪽 아이콘은 form 제출 버튼이며 Enter/키보드 검색과 같은 처리로 제출한다. 한글 조합 Enter·빈 값·지우기·취소 정책을 유지한다. 결과 헤더의 pill은 편집 가능한 input이 아닌 검색어 복원 링크다. 로그인/역할에 따른 기존 계정 메뉴 경계는 유지한다. 상세: [search-ui.md](search-ui.md)
- 가게 평점 표시는 `normalizeStoreRating` 순수 유틸에서 정규화한다. 가게 카드(혜택/관심 목록 포함)·선택형 목록·홈·상세·내 가게·관리자 표는 별 아이콘·한 자리 소수 점수·괄호 리뷰 수를 사용하고, 리뷰가 없으면 모두 `0.0 (0)`이다. 정상 점수·리뷰 수는 보존하며 잘못된 값으로 NaN을 표시하지 않는다. 실제 리뷰 본문 빈 상태나 정렬/API 데이터를 바꾸지 않는다. [검색 결과·평점 통일 기록](history/2026-09-preview/search-results-and-rating-zero-2026-09-14.md)
- 공개 화면의 후속 실측·참고 사이트 DOM/CSS 확인 범위: [design-measurements-2026-09-13.md](history/2026-09-preview/design-measurements-2026-09-13.md). 비로그인 실측을 인증 화면·운영 배포의 증거로 재사용하지 않는다
- 변경 전 디자인 시스템 소스 스냅샷은 `docs/design-system/snapshots/2026-09-13-baseline/`에 보존한다. 일반 Core와 RESERVE 전용 Patterns를 점진적으로 구분하며 기존 토큰·상태 규칙의 일괄 교체는 하지 않는다. 최신 소식·로딩 배치 및 인기 검색어·실제 쿠폰·웨이팅·피드·다른 페이지 전환은 [디자인 전환 계획](history/2026-09-preview/design-evolution-plan-2026-09-13.md)에 구현/계획을 구분한다
- 메시지 런처는 흰 브랜드 타일을 라이트·다크에서 유지하는 국소 패턴이다. 전경은 `--c-messenger-launcher-fg` → `--c-primary-dark`, 배경은 `--c-messenger-launcher-bg` → 흰색으로 관리한다. 다른 공통 paper/버튼의 테마를 바꾸지 않는다. PC 56px/radius16px·모바일 48px/radius14px와 중립 hover 들림/active 눌림·키보드 focus-visible·reduced-motion을 유지한다. 앱 기본 닫힌 런처는 기존 `/icons/R_logo.png`를 이미지 prop으로 재사용하며 열린 PC 패널의 X·사진 실패 fallback·접근성 이름은 `MessengerLauncherVisual`/`MessengerShell`이 담당한다. 로고 교체는 지원방 아바타·상단 프로필에 전파하지 않는다. [실측 기록](../design-system/visuals/2026-09-13-messenger/README.md). 광고의 채널톡형 소개 카드는 [제안 단계](history/2026-09-preview/channel-style-advertising-and-storage-review-2026-09-13.md)이며 구현된 패턴으로 계산하지 않는다

### 광고 결제 전 미리보기 (2026-09-23)

- 광고가 보일 모습은 가게 목록과 **같은 컴포넌트**(`StoreCard`·`StoreListRow`·`AdBannerSurface`)를 `preview`로 그린다. 하트(`FavoriteButton preview` — 누를 수 없는 그림)와 `AD` 표시까지 실제 목록 그대로이고, 링크·즐겨찾기 동작·노출 집계만 끈다. 미리보기 전용 카드 틀을 덧씌우지 않는다.
- 결제 정보는 영수증 목록이다: 왼쪽 항목·오른쪽 값, 요금은 `하루 금액 × 일수`로 계산 근거를 보이고 합계만 크게 쓴다. 파란색은 결제 버튼 하나에만 둔다.
- 선택 상태(달력 날짜·시간 칩·등장 효과 카드·관리자 메일 목록·지역 시트)는 회색 면 또는 진한 중립 테두리다. primary 는 제출·결제 같은 실행 버튼과 현재 위치 표시에만 쓴다.

### 상태 테두리 굵기·색 (2026-09-23)

- 선택·편집 중 표시(등장 효과 카드, 지역 시트 인기 지역, 기간 선택의 시작/종료 칸)는 **얇은 회색 1px(`gray-400`) + 회색 면**이다. 검정·진한 회색 테두리를 쓰지 않는다.
- 입력칸 포커스(입력·선택·날짜·검색·채팅 입력)는 1px 중간 회색(`gray-500`)이다. 흰 면 대비 3:1을 넘겨 어느 칸이 입력 중인지 보인다.
- Tab 키로 이동할 때만 보이는 키보드 포커스 링은 2px 본문 보조색을 유지한다(접근성 — 키보드 사용자가 위치를 잃지 않게). 마우스 클릭에는 나타나지 않는다.

### 가게 카드·목록 재사용 (2026-09-23)

- 가게를 사진 카드로 보이는 곳은 전부 `StoreCard`, 한 줄로 보이는 곳은 전부 `StoreListRow`다: 가게 목록·관심·혜택 가게·광고 미리보기·**홈 추천**·**내 가게 관리**.
- 관리 화면은 같은 컴포넌트에 `actions`(수정·삭제 줄)를 넘기고, 찜이 의미 없는 곳은 `StoreCard showFavorite={false}`로 하트 자리를 비운다. 화면별 복사본 카드를 만들지 않는다.
- 홈 추천은 주소를 보이지 않는다(목록과 같은 정보·배치·하트).

### 버튼 sm 좌우 여백 (2026-09-23)

- `Button size="sm"`(36px)의 채움·테두리 변형은 좌우 여백을 공통 버튼 한 곳에서 준다: primary·danger 24px, outline·secondary 20px. 공통 폼 모달 푸터의 값과 같다.
- 패널 안의 저장·취소 한 쌍(예: 사업자·관리자 › 자동 응답)은 모달 푸터와 같은 `outline sm` + `primary sm`, 8px 간격, 오른쪽 정렬을 쓴다. 44px(`md`)·56px(`lg`)는 페이지 단위 폼(가게 등록 등)의 주 행동에 쓴다.
