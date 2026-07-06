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
    // "우리동네" 배지 — 내 위치(저장된 주소 또는 거리순 정렬 중 라이브 위치) 기준 근접 거리(3km) 이내일 때만 표시.
    // category(파랑)·keyword(회색)와 겹치지 않도록 녹색계로 분리 (광고 배지는 나중에 warning 톤으로 예정)
    nearby: {
        display: 'inline-block',
        background: colors.success.light,
        color: colors.success.main,
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
 * @param {'category' | 'keyword' | 'nearby'} variant
 * @param {React.CSSProperties} style - 추가 오버라이드 스타일
 */
const Badge = ({ variant = 'category', style, children }) => (
    <span style={{ ...STYLES[variant], ...style }}>{children}</span>
);

Badge.propTypes = {
    variant: PropTypes.oneOf(['category', 'keyword', 'nearby']),
    style: PropTypes.object,
    children: PropTypes.node,
};

export default Badge;
