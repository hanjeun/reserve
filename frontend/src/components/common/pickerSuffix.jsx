/**
 * RESERVE Design System — 날짜·시간 선택기의 접미 아이콘 색 규칙 (관문)
 *
 * ★ 왜 이 파일이 따로 있나 (2026-08-06)
 *   "값이 채워지면 아이콘이 우리 파란색으로 바뀐다"는 규칙이 그동안
 *   `store/StoreForm/AddressSearch.jsx` **한 곳에만** 인라인으로 있었다.
 *
 *     <EnvironmentOutlined style={{ color: selected ? primary.main : text.tertiary }} />
 *
 *   FormDatePicker·FormTimePicker 는 suffixIcon 을 아예 지정하지 않아 AntD 기본을 썼고,
 *   그래서 같은 폼 안에서 주소 아이콘만 파랗게 변하고 날짜·시간 아이콘은 회색으로 남았다.
 *   규칙을 컴포넌트 밖(주석·복붙)에 두면 반드시 새는 사례라, 함수 하나를 지나가게 만든다.
 *   → 새 선택기를 추가하는 사람은 이 함수를 쓰기만 하면 색 규칙을 기억할 필요가 없다.
 *
 * 색 규칙
 *   disabled : gray[400]        — 조작 불가라는 신호가 우선한다
 *   값 있음  : primary.main     — 주소 필드와 같은 언어
 *   값 없음  : text.tertiary    — 플레이스홀더와 같은 위계
 *   에러     : 여기서 처리하지 않는다. `index.css` 의 `.ant-picker-status-error` 규칙이
 *             인라인 색을 덮는다 — 에러 여부는 AntD Form 이 클래스로만 알려주고
 *             prop 으로는 내려주지 않기 때문이다(FormItemInputContext 경유).
 */

import React from 'react';
import { colors, field } from '../../styles/tokens';

/**
 * 선택기에 값이 들어있는지. RangePicker 는 배열([시작, 끝])이라 한쪽만 채워진
 * 중간 상태가 있는데, 그때도 "채워지는 중"으로 보는 게 자연스러워 some 을 쓴다.
 */
export const hasPickerValue = (value) => {
    if (value == null) return false;
    if (Array.isArray(value)) return value.some((v) => v != null);
    return true;
};

export const pickerSuffix = (Icon, hasValue, disabled) => {
    let color = colors.text.tertiary;
    if (disabled) color = colors.gray[400];
    else if (hasValue) color = colors.primary.main;

    // ★ fontSize 를 반드시 명시한다 — 안 주면 AntD 기본 크기가 적용되는데,
    //   그 값이 커스텀 자리표시자(StoreDetail 의 TimePlaceholder, 16px)와 미묘하게 달라
    //   같은 폼에서 "날짜 아이콘과 시간 아이콘이 조금 다르게 생긴" 것으로 보였다.
    //   두 칸이 나란히 놓이므로 1~2px 차이도 눈에 띈다.
    return <Icon style={{ color, fontSize: field.iconSize, transition: 'color 0.2s' }} />;
};
