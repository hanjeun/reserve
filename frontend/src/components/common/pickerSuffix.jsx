/**
 * 날짜·시간 선택기의 접미 아이콘 크기와 상태색을 공유한다.
 * 비활성은 회색, 값이 있으면 포인트 색, 빈 값은 보조 텍스트 색을 사용한다.
 * Form의 오류 상태색은 전역 CSS가 인라인 색보다 우선 적용한다.
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

    // fontSize 를 반드시 명시한다 — 안 주면 AntD 기본 크기가 적용되는데,
    //   그 값이 커스텀 자리표시자(StoreDetail 의 TimePlaceholder, 16px)와 미묘하게 달라
    //   같은 폼에서 "날짜 아이콘과 시간 아이콘이 조금 다르게 생긴" 것으로 보였다.
    //   두 칸이 나란히 놓이므로 1~2px 차이도 눈에 띈다.
    return <Icon style={{ color, fontSize: field.iconSize, transition: 'color 0.2s' }} />;
};
