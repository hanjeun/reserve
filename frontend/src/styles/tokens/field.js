import { radius, heights } from './spacing';
import { colors } from './colors';

/**
 * 폼 컨트롤 껍데기 토큰 — 입력칸처럼 보이는 모든 것의 단일 출처.
 *
 * ★ 왜 따로 두나 (2026-08-06)
 *   "예약 날짜"(AntD DatePicker)와 "예약 시간"(커스텀 div)이 나란히 놓이는데
 *   **렌더러가 서로 다르다.** 날짜 칸의 껍데기는 AntD 가 그리고, 시간 칸은 우리가 그린다.
 *   그래서 "공용 껍데기 컴포넌트를 만들어 둘 다 통과시킨다"가 구조적으로 불가능하다
 *   (AntD 를 borderless 로 만들어 우리 div 에 넣으면 포커스·에러·비활성을 전부 재구현해야 한다).
 *
 *   같아 보여야 하는 것들이 서로 다른 렌더러를 가질 때, **관문은 컴포넌트가 아니라 값이다.**
 *   렌더러는 둘로 두되 숫자가 코드에 두 번 나타나지 않게 한다.
 *
 *        field  ─┬─→ App.jsx ConfigProvider (AntD 가 그리는 쪽)
 *                ├─→ pickerSuffix.jsx       (아이콘 크기·색)
 *                ├─→ TimeSlotPicker         (커스텀 자리표시자)
 *                └─→ Skeletons.jsx          (Bone 높이·radius)
 *
 *   전에는 54 와 14 가 App.jsx·Skeletons·홈 목업에 **리터럴로 흩어져 있었다.**
 *   heights.input 을 55 로 바꾸면 그 셋만 54 로 남는 상태였다 —
 *   이 프로젝트의 반복 회귀가 전부 이 형태였다(CLAUDE.md "설계 원칙" 참고).
 *
 * ⚠️ 새 폼 컨트롤을 만들 때 높이·radius·아이콘 크기를 숫자로 적지 말 것. 여기서 가져온다.
 */
export const field = {
    /** 입력칸 높이. AntD size="large" 와 커스텀 자리표시자가 공유한다. */
    height: heights.input,          // '54px'
    /** 입력칸 모서리. AntD borderRadius 토큰과 같은 값이어야 한다. */
    radius: radius.lg,              // '14px'
    /** 채움형 배경. 비활성일 때는 한 단계 진하게. */
    bg: colors.gray[50],
    bgDisabled: colors.gray[100],
    /** 자리표시자 글자색 — AntD colorTextPlaceholder 와 같은 값. */
    placeholderColor: colors.text.placeholder,
    /**
     * 접미 아이콘 크기(px).
     * AntD 기본값을 그냥 두면 커스텀 자리표시자와 1~2px 어긋나는데,
     * 두 칸이 나란히 놓이므로 그 차이가 눈에 띈다("디자인이 미묘하게 다르다"의 정체).
     */
    iconSize: 16,
};

/** 숫자만 필요한 곳(Bone height 등)을 위한 px 제거 헬퍼. */
export const fieldPx = (v) => parseInt(v, 10);

export default field;
