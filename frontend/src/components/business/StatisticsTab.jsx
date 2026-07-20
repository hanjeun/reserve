import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Typography, Empty, Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
    AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { StarFilled, WalletOutlined, CommentOutlined, NotificationOutlined } from '@ant-design/icons';
import { StatCard, ChartCard, SegmentedControl, PieLegend } from '../common';
import { Bone } from '../common/Skeletons';
import { useMessage, useMyStores, useWindowWidth } from '../../hooks';
import storeService from '../../services/storeService';
import { colors, fontSize, chartPalette, chartGridProps, chartAxisTick, chartTooltipStyle, chartPieCornerRadius, chartAreaGradient } from '../../styles/tokens';

const { Text } = Typography;

const RANGE_OPTIONS = [
    { value: '7d', label: '7일' },
    { value: '30d', label: '30일' },
    { value: '90d', label: '90일' },
];

const STATUS_LABELS = {
    PENDING: '대기 중', CONFIRMED: '승인됨', COMPLETED: '이용완료',
    REJECTED: '거절됨', CANCELLED: '취소됨', NO_SHOW: '노쇼',
};

const AD_TYPE_LABELS = { BADGE: '배지형', BANNER: '배너형' };

// 광고 성과 지표 하나를 보여주는 작은 박스 — DashboardTab의 "최근 감사 로그 요약"과 동일한 인라인 패턴(2026-07 추가)
const AdStatItem = ({ label, value, suffix, color }) => (
    <div style={{ flex: '1 1 120px' }}>
        <Text style={{ color, fontSize: fontSize.sm, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</Text>
        <span style={{ fontSize: 22, fontWeight: 800, color }}>{value}</span>
        {suffix && <span style={{ fontSize: fontSize.sm, color: colors.text.tertiary, marginLeft: 4 }}>{suffix}</span>}
    </div>
);

AdStatItem.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    suffix: PropTypes.string,
    color: PropTypes.string,
};

// 2026-07 추가 — 광고 성과가 숫자만 나열되어 허전해 보이던 것을 개선: 노출 대비 클릭/전환이 얼마나
// 줄어드는지를 한눈에 보여주는 가로 막대 퍼널. 노출을 100%로 놓고 클릭/전환을 그 대비 비율로 그린다
// (값이 0보다 크면 눈에 안 보일 수 있는 아주 작은 폭도 최소 2%로 보장).
const AdFunnelBar = ({ label, value, maxValue, color }) => {
    const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 2 : 0) : 0;
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>{label}</Text>
                <Text style={{ fontSize: fontSize.xs, fontWeight: 700, color: colors.text.primary }}>{value.toLocaleString()}</Text>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: colors.gray[100], overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
            </div>
        </div>
    );
};

AdFunnelBar.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.number.isRequired,
    maxValue: PropTypes.number.isRequired,
    color: PropTypes.string.isRequired,
};

// 날짜 라벨 축약 — YYYY-MM-DD → M/D (차트 X축용)
const shortDate = (d) => {
    const [, m, day] = d.split('-');
    return `${Number(m)}/${Number(day)}`;
};

const useStoreStatistics = (storeId, range) => {
    const { message } = useMessage();
    const query = useQuery({
        queryKey: ['stores', 'statistics', storeId, range],
        queryFn: () => storeService.getStatistics(storeId, range),
        enabled: !!storeId,
    });
    useEffect(() => {
        if (query.error) message.error('통계를 불러오지 못했습니다.');
    }, [query.error, message]);
    return query;
};

/**
 * 사업자 "통계 · 분석" 탭.
 * 관리자 DashboardTab과 동일한 StatCard/ChartCard + chart 토큰을 재사용 — 처음부터 새로 만든 화면.
 * (2026-07-10: 백엔드 GET /api/stores/{id}/statistics 신규 추가, 예약 추이/상태 분포/매출 추이를
 * DB에서 GROUP BY로 집계해서 내려받음)
 */
const StatisticsTab = () => {
    const { stores: myStores, loading: storesLoading } = useMyStores();
    const [storeId, setStoreId] = useState(undefined);
    const [range, setRange] = useState('30d');
    // 2026-07 추가 — 모바일에서 가게 셀렉터와 기간 세그먼트가 각자 줄이 나뉘어 서로 따로 놀던 문제 —
    // 좁은 화면에서도 항상 한 줄에 놓이도록 nowrap + 가게 셀렉터 폭을 줄인다.
    const isMobile = useWindowWidth() < 768;

    // 가게 목록이 다 로드된 뒤 첫 번째 가게를 기본 선택하는 로직 — useEffect 대신 렌더 중 직접
    // 비교해서 조정(React 공식 권장 패턴), react-hooks/set-state-in-effect에 걸리지 않음
    if (!storeId && !storesLoading && myStores.length > 0) {
        setStoreId(myStores[0].id);
    }

    const { data: stats, isLoading: statsLoading } = useStoreStatistics(storeId, range);
    const loading = storesLoading || statsLoading;

    if (!storesLoading && myStores.length === 0) {
        return <Empty description="등록된 가게가 없습니다." style={{ marginTop: 80 }} />;
    }

    const areaGradientId = 'stats-reservation-gradient';
    const revenueGradientId = 'stats-revenue-gradient';
    const reservationGradient = chartAreaGradient(areaGradientId, colors.primary.main);
    const revenueGradient = chartAreaGradient(revenueGradientId, colors.success.main);

    const statusPieData = stats?.statusBreakdown
        ? Object.entries(stats.statusBreakdown)
            .map(([k, v]) => ({ name: STATUS_LABELS[k] || k, value: v }))
            .filter((d) => d.value > 0)
        : [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 가게 선택 + 기간 선택 */}
            <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                {/* 2026-07 수정 — FormSelect(폼 입력용, 회색 채움 배경)에서 순수 AntD Select(size=large)로 교체.
                    이 셀렉터는 사실 "폼 입력"이 아니라 예약관리/광고관리 탭의 가게 필터와 동일한 "필터" 역할이고,
                    그 탭들은 FilterToolbar가 내부적으로 순수 AntD Select를 쓰고 있어서(FormSelect가 아님) 둘이
                    시각적으로 달랐다 — 테두리/배경이 정확히 일치하도록 맞춘다.
                    2026-07 추가 — 모바일에서도 기간 세그먼트와 같은 줄에 남도록 flexShrink 허용 + 폭 축소. */}
                <Select
                    value={storeId}
                    onChange={setStoreId}
                    options={myStores.map((s) => ({ value: s.id, label: s.name }))}
                    size="large"
                    style={{ width: isMobile ? 138 : 180, minWidth: 0, flexShrink: 1 }}
                />
                <SegmentedControl value={range} onChange={setRange} options={RANGE_OPTIONS} block={false} />
            </div>
            {/* 요약 카드 - 최소폭을 200에서 150으로 줄여 좁은 모바일 화면에서도 2열이 유지되게 함
                (DashboardTab과 동일한 이유로 통일했다. 예전 최소폭이 넓어 모바일에서 카드들이 세로로 쌓였다) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
                <StatCard
                    icon={<StarFilled />}
                    label="평균 별점"
                    value={stats?.averageRating != null ? stats.averageRating.toFixed(1) : '0.0'}
                    color="#fadb14"
                    loading={loading}
                />
                <StatCard
                    icon={<CommentOutlined />}
                    label="리뷰 수"
                    value={stats?.reviewCount ?? 0}
                    suffix="전체 누적"
                    color={colors.primary.main}
                    loading={loading}
                />
                <StatCard
                    icon={<WalletOutlined />}
                    label="예약금 매출"
                    value={(stats?.totalDepositRevenue ?? 0).toLocaleString()}
                    suffix={`원 · 최근 ${range === '7d' ? '7' : range === '90d' ? '90' : '30'}일`}
                    color={colors.success.main}
                    loading={loading}
                />
                <StatCard
                    icon={<NotificationOutlined />}
                    label="광고 노출"
                    value={stats?.adSummary ? `${AD_TYPE_LABELS[stats.adSummary.adType] || stats.adSummary.adType}` : '없음'}
                    suffix={stats?.adSummary ? `${stats.adSummary.daysRemaining}일 남음` : '진행 중인 광고 없음'}
                    color="#8b5cf6"
                    loading={loading}
                />
            </div>

            {/* 차트 — DashboardTab과 동일한 패턴(2026-07 추가): 카드 껍데기(제목 포함)는 항상 그리고,
                본문만 loading/데이터있음/데이터없음 3단으로 분기해서 실제 차트 모양에 가까운 스켈레톤을 넣는다.
                (예전엔 {'{'}!loading && stats && (...){'}'}로 전체를 감싸서 로딩 중엔 이 아래 3장이 통째로
                안 보이다가 데이터 도착 순간 한꺼번에 나타났음 — DashboardTab에서 이미 고친 것과 동일한
                문제라 같은 패턴을 그대로 재사용) */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <ChartCard title="예약 추이" height={260} minWidth={340}>
                    {loading ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16, paddingBottom: 20 }}>
                            {[60, 100, 75, 130, 95, 150].map((h, i) => (
                                <Bone key={i} width={28} height={h} borderRadius={6} />
                            ))}
                        </div>
                    ) : stats?.reservationTrend?.some((d) => d.value > 0) ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <AreaChart data={stats.reservationTrend} margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
                                <defs>
                                    <linearGradient id={reservationGradient.id} x1="0" y1="0" x2="0" y2="1">
                                        {reservationGradient.stops.map((s) => (
                                            <stop key={s.offset} offset={s.offset} stopColor={s.stopColor} stopOpacity={s.stopOpacity} />
                                        ))}
                                    </linearGradient>
                                </defs>
                                <CartesianGrid {...chartGridProps} />
                                <XAxis dataKey="date" tickFormatter={shortDate} tick={chartAxisTick} axisLine={{ stroke: colors.gray[100] }} tickLine={false} minTickGap={20} />
                                <YAxis tick={chartAxisTick} allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip labelFormatter={shortDate} formatter={(v) => [`${v}건`, '예약']} {...chartTooltipStyle} />
                                <Area type="monotone" dataKey="value" stroke={colors.primary.main} strokeWidth={2} fill={`url(#${reservationGradient.id})`} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Text type="secondary">해당 기간 예약이 없습니다.</Text>
                        </div>
                    )}
                </ChartCard>

                <ChartCard title="상태별 분포" height={260} minWidth={280}>
                    {loading ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ position: 'relative', width: 180, height: 180 }}>
                                <Bone width={180} height={180} borderRadius="50%" />
                                <div style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: 110, height: 110, borderRadius: '50%',
                                    background: colors.background.paper,
                                }} />
                            </div>
                        </div>
                    ) : statusPieData.length > 0 ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ width: 130, height: 130, flexShrink: 0 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={statusPieData}
                                            cx="50%" cy="50%"
                                            innerRadius={40} outerRadius={65}
                                            paddingAngle={3} dataKey="value"
                                            cornerRadius={chartPieCornerRadius}
                                        >
                                            {statusPieData.map((entry, i) => (
                                                <Cell key={entry.name} fill={chartPalette[i % chartPalette.length]} stroke="none" />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v) => `${v}건`} {...chartTooltipStyle} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <PieLegend data={statusPieData} palette={chartPalette} />
                        </div>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Text type="secondary">해당 기간 예약이 없습니다.</Text>
                        </div>
                    )}
                </ChartCard>

                <ChartCard title="예약금 매출 추이" height={260} minWidth={340}>
                    {loading ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16, paddingBottom: 20 }}>
                            {[90, 60, 120, 80, 140, 100].map((h, i) => (
                                <Bone key={i} width={28} height={h} borderRadius={6} />
                            ))}
                        </div>
                    ) : stats?.revenueTrend?.some((d) => d.value > 0) ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <AreaChart data={stats.revenueTrend} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                                <defs>
                                    <linearGradient id={revenueGradient.id} x1="0" y1="0" x2="0" y2="1">
                                        {revenueGradient.stops.map((s) => (
                                            <stop key={s.offset} offset={s.offset} stopColor={s.stopColor} stopOpacity={s.stopOpacity} />
                                        ))}
                                    </linearGradient>
                                </defs>
                                <CartesianGrid {...chartGridProps} />
                                <XAxis dataKey="date" tickFormatter={shortDate} tick={chartAxisTick} axisLine={{ stroke: colors.gray[100] }} tickLine={false} minTickGap={20} />
                                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip labelFormatter={shortDate} formatter={(v) => [`${Number(v).toLocaleString()}원`, '매출']} {...chartTooltipStyle} />
                                <Area type="monotone" dataKey="value" stroke={colors.success.main} strokeWidth={2} fill={`url(#${revenueGradient.id})`} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Text type="secondary">해당 기간 매출이 없습니다.</Text>
                        </div>
                    )}
                </ChartCard>
            </div>

            {/* 광고 성과(2026-07 추가) — 현재 활성 광고가 있을 때만 보여줌(로딩 중엔 낙관적으로 보여주다가 데이터
                도착 후 정말 광고가 없으면 숨김 — DashboardTab의 "최근 감사 로그 요약"와 동일한 판단).
                누적 카운터만 있고 일별 추이는 아직 없음(Advertisement 엔티티에 카운터 컬럼만 있는 구조이라) —
                배지형은 클릭 개념이 없어서 노출수만, 배너형은 클릭/전환까지 함께 보여준다. */}
            {(loading || stats?.adSummary) && (
                <ChartCard title="광고 성과" height="auto">
                    {loading ? (
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            {[1, 2, 3].map((i) => (
                                <div key={i} style={{ flex: '1 1 120px' }}>
                                    <Bone width={64} height={13} style={{ marginBottom: 8 }} />
                                    <Bone width={40} height={26} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                <AdStatItem
                                    label={`${AD_TYPE_LABELS[stats.adSummary.adType] || stats.adSummary.adType} 노출수`}
                                    value={stats.adSummary.impressionCount ?? 0}
                                    suffix="회"
                                    color={colors.primary.main}
                                />
                                {/* 배지형은 클릭 개념이 애매해서(카드 자체 클릭과 구별 불가) 클릭/전환 지표는 배너형만 표시 */}
                                {stats.adSummary.adType === 'BANNER' && (
                                    <>
                                        <AdStatItem label="클릭수" value={stats.adSummary.clickCount ?? 0} suffix="회" color={colors.success.main} />
                                        <AdStatItem
                                            label="클릭율(CTR)"
                                            value={stats.adSummary.clickThroughRate != null ? `${stats.adSummary.clickThroughRate}%` : '-'}
                                            color="#8b5cf6"
                                        />
                                        <AdStatItem label="전환수" value={stats.adSummary.conversionCount ?? 0} suffix="건" color={colors.warning.main} />
                                        <AdStatItem
                                            label="전환율"
                                            value={stats.adSummary.conversionRate != null ? `${stats.adSummary.conversionRate}%` : '-'}
                                            color={colors.error.main}
                                        />
                                    </>
                                )}
                            </div>

                            {/* 노출 → 클릭 → 전환 퍼널 — 배너형만(배지형은 클릭/전환 개념 자체가 없으므로 생략) */}
                            {stats.adSummary.adType === 'BANNER' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
                                    <AdFunnelBar
                                        label="노출"
                                        value={stats.adSummary.impressionCount ?? 0}
                                        maxValue={stats.adSummary.impressionCount ?? 0}
                                        color={colors.primary.main}
                                    />
                                    <AdFunnelBar
                                        label="클릭"
                                        value={stats.adSummary.clickCount ?? 0}
                                        maxValue={stats.adSummary.impressionCount ?? 0}
                                        color={colors.success.main}
                                    />
                                    <AdFunnelBar
                                        label="전환"
                                        value={stats.adSummary.conversionCount ?? 0}
                                        maxValue={stats.adSummary.impressionCount ?? 0}
                                        color={colors.warning.main}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </ChartCard>
            )}
        </div>
    );
};

export default StatisticsTab;
