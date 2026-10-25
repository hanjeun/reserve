import React from 'react';
import PropTypes from 'prop-types';
import { colors, radius, shadows, fontSize, fontWeight, withAlpha } from '../../styles/tokens';
import { Bone } from './Skeletons';
import SkeletonText from './SkeletonText';

/*
 * 기간 대비 증감률이 없는 지표는 변화 표시를 생략한다.
 */
/*
 * 통계 아이콘은 중립 색을 사용하고 경고는 의미별 상태로 구분한다.
 */
const StatCard = ({ icon, label, value, suffix, trend, loading = false }) => (
    <div style={styles.card}>
        <div style={styles.iconBadge}>
            {loading ? <Bone width={20} height={20} /> : icon}
        </div>
        <div style={{ minWidth: 0 }}>
            <span style={styles.label}><SkeletonText loading={loading}>{label}</SkeletonText></span>
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
                    background: withAlpha(trend >= 0 ? colors.success.main : colors.error.main),
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
    /*
     * 아이콘은 수치보다 강조하지 않는다.
     */
    iconBadge: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        fontSize: 20,
        color: colors.text.primary,
        flexShrink: 0,
    },
    label: {
        fontSize: fontSize.xs,
        color: colors.text.tertiary,
        display: 'block',
        marginBottom: 4,
    },
    // 값과 suffix는 같은 flex 줄에 있는데, suffix가 길면(예: "진행 중인 광고 없음") 값 쪽이
    // 밀려서 글자 단위로 줄바꿈됐다 — "없음"이 "없 / 음"으로 쪼개지던 원인.
    // 값은 절대 줄이지도 쪼개지도 않게 고정하고(nowrap + flexShrink 0), 대신 자리가 모자라면
    // suffix가 통째로 아랫줄로 내려가게 한다(flexWrap). 짧을 땐 지금처럼 한 줄에 나란히 붙는다.
    valueRow: { display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
    /* 아이콘에서 색을 뺀 만큼 숫자로 위계를 옮긴다(24 → 28). 카드에서 눈이 가장 먼저
       닿아야 하는 것은 지표 값이고, 라벨·suffix 는 그 값을 설명하는 보조다. */
    value: { fontSize: 28, fontWeight: fontWeight.extrabold, color: colors.text.primary, lineHeight: 1.2, whiteSpace: 'nowrap', flexShrink: 0 },
    suffix: { fontSize: fontSize.xs, color: colors.text.tertiary, minWidth: 0 },
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
    trend: PropTypes.number,
    loading: PropTypes.bool,
};

export default StatCard;
