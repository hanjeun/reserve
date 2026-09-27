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
        // 2026-07-30: AntD Tag의 blue 프리셋 값을 그대로 베껴 하드코딩했던 자리.
        // 다크에서 밝은 하늘색 판이 그대로 남아 유일하게 튀었다 → primary 토큰으로 교체.
        // 라이트 값(#e8f3ff / #3182f6)은 기존(#e6f4ff / #1677ff)과 육안상 차이가 없고,
        // 오히려 우리 브랜드 파랑과 정확히 맞는다.
        background: colors.primary.light,
        color: colors.primary.main,
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
    // "우리동네" 배지 — 내 위치(저장된 주소 또는 거리순 정렬 중 라이브 위치) 기준 근접 거리 이내일 때만 표시.
    // category(파랑)·keyword(회색)·ad(주황)와 겹치지 않도록 녹색계로 분리
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
    // 광고 배지 — 주황계(warning 톤). category(파랑)·keyword(회색)·nearby(녹색)와 안 겹치도록 분리.
    // "파트너"라는 단어는 이미 BUSINESS 역할 표시에 쓰이고 있어서(roles.js) 혼동 방지차 "광고"로만 표기.
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
 * @param {'category' | 'keyword' | 'nearby' | 'ad'} variant
 * @param {React.CSSProperties} style - 추가 오버라이드 스타일
 */
const Badge = ({ variant = 'category', style, children }) => (
    <span style={{ ...STYLES[variant], ...style }}>{children}</span>
);

Badge.propTypes = {
    variant: PropTypes.oneOf(['category', 'keyword', 'nearby', 'ad']),
    style: PropTypes.object,
    children: PropTypes.node,
};

export default Badge;
