/**
 * RESERVE Design System - Badge Component
 *
 * 가게 카드(StoreCard)와 가게 상세(StoreDetail) 양쪽에서 동일한 태그 스타일을 보장합니다.
 *
 * 사용법:
 *   <Badge variant="category">한식</Badge>
 *   <Badge variant="keyword">주차 가능</Badge>
 */

import React from 'react';
import PropTypes from 'prop-types';
import { colors, radius, fontSize, fontWeight } from '../../styles/tokens';

const STYLES = {
    // 카테고리 태그 — Ant Design <Tag color="blue">와 동일한 시각적 결과 (border 없는 버전)
    category: {
        display: 'inline-block',
        background: '#e6f4ff',
        color: '#1677ff',
        fontSize: fontSize.xs,
        fontWeight: fontWeight.medium,
        padding: '2px 8px',
        borderRadius: radius.sm,
        lineHeight: '20px',
        marginRight: 6,
        marginBottom: 4,
        whiteSpace: 'nowrap',
    },
    // 키워드 태그 — 중립적인 회색
    keyword: {
        display: 'inline-block',
        background: colors.gray[100],
        color: colors.text.secondary,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.medium,
        padding: '2px 8px',
        borderRadius: radius.sm,
        lineHeight: '20px',
        marginRight: 6,
        marginBottom: 4,
        whiteSpace: 'nowrap',
    },
    // 광고 배지 — 주황계(warning 톤). category(파랑)·keyword(회색)와 안 겹치도록 분리.
    // "파트너"라는 단어는 이미 BUSINESS 역할 표시에 쓰이고 있어서(roles.js) 혜동 방지차 "광고"로만 표기.
    ad: {
        display: 'inline-block',
        background: colors.warning?.light || '#fff8e6',
        color: colors.warning?.main || '#ffb800',
        fontSize: fontSize.xs,
        fontWeight: fontWeight.medium,
        padding: '2px 8px',
        borderRadius: radius.sm,
        lineHeight: '20px',
        marginRight: 6,
        marginBottom: 4,
        whiteSpace: 'nowrap',
    },
};

/**
 * @param {'category' | 'keyword' | 'ad'} variant
 * @param {React.CSSProperties} style - 추가 오버라이드 스타일
 */
const Badge = ({ variant = 'category', style, children }) => (
    <span style={{ ...STYLES[variant], ...style }}>{children}</span>
);

Badge.propTypes = {
    variant: PropTypes.oneOf(['category', 'keyword', 'ad']),
    style: PropTypes.object,
    children: PropTypes.node,
};

export default Badge;
