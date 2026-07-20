import React from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { colors, radius, shadows, fontSize, fontWeight } from '../../styles/tokens';

const { Text } = Typography;

/**
 * RESERVE Design System - ChartCard
 *
 * 차트를 감싸는 둥근 카드 — StatCard와 동일한 radius/shadow 톤으로 통일.
 * 관리자 DashboardTab, 사업자 통계 탭이 공유해서 쓰는 걸 목적으로 함.
 *
 * <ChartCard title="예약 상태 분포">
 *   <ResponsiveContainer width="100%" height="100%"><PieChart>...</PieChart></ResponsiveContainer>
 * </ChartCard>
 */
const ChartCard = ({ title, extra, children, height = 260, minWidth = 300 }) => (
    <div style={{ ...styles.card, minWidth }}>
        <div style={styles.header}>
            <Text strong style={styles.title}>{title}</Text>
            {extra}
        </div>
        <div style={{ height }}>
            {children}
        </div>
    </div>
);

const styles = {
    card: {
        background: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius['2xl'],
        boxShadow: shadows.card,
        padding: '20px 22px',
        flex: '1 1 320px',
        boxSizing: 'border-box',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: { fontSize: fontSize.base, color: colors.text.primary, fontWeight: fontWeight.bold },
};

ChartCard.propTypes = {
    title: PropTypes.node.isRequired,
    extra: PropTypes.node,
    children: PropTypes.node,
    height: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    minWidth: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

export default ChartCard;
