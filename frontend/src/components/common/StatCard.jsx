import React from 'react';
import PropTypes from 'prop-types';
import { colors, radius, shadows, fontSize, fontWeight, withAlpha } from '../../styles/tokens';
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
/**
 * ★ 2026-08-06 — 아이콘 배지가 4장 중 1장만 그려지던 버그
 *   배경을 `${color}18`(hex 뒤에 알파 두 자리를 붙이는 관용구)로 만들고 있었는데,
 *   2026-07-30 에 색 토큰이 hex 리터럴에서 `var(--c-primary, #3182f6)` 문자열로 바뀌면서
 *   이 연결이 `var(--c-primary, #3182f6)18` 이라는 **무효 CSS** 가 됐다.
 *   무효 선언은 브라우저가 조용히 버리므로 배경이 아예 안 그려진다.
 *   관리자 대시보드에서 감사 로그(color="#8b5cf6" 리터럴)만 배지가 보이고
 *   나머지 셋은 아이콘만 떠 있던 이유가 이것이다. 사업자 통계 탭도 같은 상태였다.
 *
 *   → color-mix() 로 바꾼다. var() 를 그대로 받아 알파를 섞을 수 있는 유일한 방법이고,
 *     다크 모드에서 변수가 바뀌어도 배지 톤이 자동으로 따라온다.
 *     (문자열 연결은 토큰이 hex 일 때만 동작하는, 값의 표현 형식에 의존하는 코드였다.)
 *   같은 사고가 5곳 더 있어서 헬퍼를 `styles/tokens/colors.js` 의 withAlpha 로 올렸다.
 *
 * ★ 2026-08-06 — 아이콘 색을 primary 하나로 통일했다
 *   예전엔 카드마다 파랑·초록·주황·보라를 따로 줬다. 배지 배경 버그(위)가 고쳐지면서
 *   네 색이 전부 드러나자 화면이 산만해졌고, 무엇보다 **색이 의미를 갖는 것처럼 읽혔다** —
 *   실제로는 "사업자 신청"이 파랑이고 "휴지통"이 주황인 데 아무 규칙이 없다.
 *   지표 카드에서 정보는 숫자지 색이 아니다. 색을 뺀 만큼 숫자에 위계를 몰아준다.
 *   (토스·리니어의 지표 카드가 같은 선택을 한다.)
 *   `color` prop 은 호출부 호환을 위해 받기만 하고 쓰지 않는다 — 나중에 "경고 지표만
 *   빨강" 같은 규칙이 필요해지면 그때 의미 기반으로 되살린다.
 */
const StatCard = ({ icon, label, value, suffix, trend, loading = false }) => (
    <div style={styles.card}>
        <div style={styles.iconBadge}>
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
    /* 2026-08-06 — 원형 배지(파란 면 + 파란 아이콘)를 걷어내고 아이콘만 남겼다.
       면과 색을 동시에 주면 지표 4개가 나란히 놓였을 때 아이콘이 값보다 먼저 눈에 들어온다.
       카드에서 읽혀야 하는 건 숫자고, 아이콘은 그 숫자가 무엇인지 알려주는 표식일 뿐이다.
       배지를 없앤 만큼 아이콘을 조금 키우고(18 → 20) 본문 색으로 내렸다. */
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
    color: PropTypes.string,
    trend: PropTypes.number,
    loading: PropTypes.bool,
};

export default StatCard;
