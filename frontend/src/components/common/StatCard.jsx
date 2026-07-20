import React from 'react';
import PropTypes from 'prop-types';
import { colors, radius, shadows, fontSize, fontWeight } from '../../styles/tokens';
import { Bone } from './Skeletons';

/**
 * RESERVE Design System - StatCard
 *
 * 대시보드/통계 화면의 요약 지표 카드 — 컬러 아이콘 배지 + 값 + 선택적 트렌드 pill.
 * 관리자 DashboardTab, 사업자 통계 탭이 공유해서 쓰는 걸 목적으로 함.
 *
 * <StatCard icon={<ShopOutlined />} label="사업자 신청" value={12} color={colors.primary.main} />
 * <StatCard icon={<CalendarOutlined />} label="이번 주 예약" value={34} trend={12} suffix="건" />
 * <StatCard icon={<CalendarOutlined />} label="이번 주 예약" value={34} trend={-8} loading />
 *
 * trend: 지난 기간 대비 증감률(%). 양수=상승(초록 ▲), 음수=하락(빨강 ▼). 안 주면 pill 자체를 안 그림
 * (예: 관리자 대시보드의 누적 총계처럼 "지난 기간 대비"라는 개념이 없는 지표).
 */
const StatCard = ({ icon, label, value, suffix, color = colors.primary.main, trend, loading = false }) => (
    <div style={styles.card}>
        <div style={{ ...styles.iconBadge, background: `${color}18`, color }}>
            {icon}
        </div>
        <div style={{ minWidth: 0 }}>
            <span style={styles.label}>{label}</span>
            {loading ? (
                <Bone width={64} height={26} style={{ marginTop: 4 }} />
            ) : (
                <div style={styles.valueRow}>
                    <span style={styles.value}>{value}</span>
                    {suffix && <span style={styles.suffix}>{suffix}</span>}
                </div>
            )}
            {trend != null && !loading && (
                <div style={{
                    ...styles.trendPill,
                    background: trend >= 0 ? `${colors.success.main}18` : `${colors.error.main}18`,
                    color: trend >= 0 ? colors.success.main : colors.error.main,
                }}>
                    {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
                </div>
            )}
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
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minWidth: 0,
        height: '100%',
        boxSizing: 'border-box',
    },
    iconBadge: {
        width: 40,
        height: 40,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        flexShrink: 0,
    },
    label: {
        fontSize: fontSize.xs,
        color: colors.text.tertiary,
        display: 'block',
        marginBottom: 4,
    },
    valueRow: { display: 'flex', alignItems: 'baseline', gap: 6 },
    value: { fontSize: 24, fontWeight: fontWeight.extrabold, color: colors.text.primary, lineHeight: 1.2 },
    suffix: { fontSize: fontSize.xs, color: colors.text.tertiary },
    trendPill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        marginTop: 2,
        padding: '2px 8px',
        borderRadius: radius.pill,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        width: 'fit-content',
    },
};

StatCard.propTypes = {
    icon: PropTypes.node.isRequired,
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    suffix: PropTypes.string,
    color: PropTypes.string,
    trend: PropTypes.number,
    loading: PropTypes.bool,
};

export default StatCard;
