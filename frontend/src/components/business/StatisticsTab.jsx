import React from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
    AreaChart, Area, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { StarFilled, WalletOutlined, CommentOutlined, NotificationOutlined } from '@ant-design/icons';
import { DataState, StatCard, ChartCard, SegmentedControl, PieLegend, FilterToolbar } from '../common';
import { Bone } from '../common/Skeletons';
import { useMyStores, useQueryParamsState } from '../../hooks';
import { storeKeys } from '../../hooks/queryKeys';
import storeService from '../../services/storeService';
import { AD_TYPE_LABELS, RESERVATION_STATUS_LABELS } from '../../constants';
import { colors, fontSize, chartPalette, chartGridProps, chartAxisTick, chartTooltipStyle, chartPieCornerRadius, chartAreaGradient, chartMargin, chartYAxisWidth } from '../../styles/tokens';

const { Text } = Typography;

const RANGE_OPTIONS = [
    { value: '7d', label: '7일' },
    { value: '30d', label: '30일' },
    { value: '90d', label: '90일' },
];

const STATISTICS_QUERY_DEFAULTS = Object.freeze({
    statisticsStore: '',
    statisticsRange: '30d',
});

const DATE_COUNT_COLUMNS = [
    { key: 'date', label: '날짜' },
    { key: 'value', label: '예약', render: (value) => `${value}건` },
];

const STATUS_COUNT_COLUMNS = [
    { key: 'name', label: '상태' },
    { key: 'value', label: '예약', render: (value) => `${value}건` },
];

const DATE_REVENUE_COLUMNS = [
    { key: 'date', label: '결제 완료일' },
    { key: 'value', label: '순결제액', render: (value) => `${Number(value).toLocaleString()}원` },
];

const summarizeDaily = (rows, unit) => {
    if (!rows?.length) return undefined;
    const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
    if (total === 0) return `선택한 기간의 합계는 0${unit}입니다.`;
    const peak = rows.reduce((best, row) => (row.value > best.value ? row : best), rows[0]);
    return `기간 합계 ${total.toLocaleString()}${unit}, 가장 높은 날은 ${peak.date}의 ${Number(peak.value).toLocaleString()}${unit}입니다.`;
};

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
    const minPct = value > 0 ? 2 : 0;
    const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, minPct) : 0;
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

// 기간 값 → 요약 카드 문구용 일수. 7d/90d 외에는 기본값 30일로 표시한다.
const rangeDays = (range) => {
    if (range === '7d') return '7';
    if (range === '90d') return '90';
    return '30';
};

// 날짜 라벨 축약 — YYYY-MM-DD → M/D (차트 X축용)
const shortDate = (d) => {
    const [, m, day] = d.split('-');
    return `${Number(m)}/${Number(day)}`;
};

const useStoreStatistics = (storeId, range) => {
    return useQuery({
        queryKey: storeKeys.statistics(storeId, range),
        queryFn: () => storeService.getStatistics(storeId, range),
        enabled: !!storeId,
    });
};

/**
 * 사업자 "통계 · 분석" 탭.
 * 관리자 DashboardTab과 동일한 StatCard/ChartCard + chart 토큰을 재사용 — 처음부터 새로 만든 화면.
 * (2026-07-10: 백엔드 GET /api/stores/{id}/statistics 신규 추가, 예약 추이/상태 분포/매출 추이를
 * DB에서 GROUP BY로 집계해서 내려받음)
 */
const StatisticsTab = () => {
    const { stores: myStores, loading: storesLoading, error: storesError, refetch: refetchStores } = useMyStores();
    const [{ statisticsStore, statisticsRange }, setStatisticsParams] = useQueryParamsState(STATISTICS_QUERY_DEFAULTS);
    const requestedStoreId = Number(statisticsStore);
    const storeId = myStores.some(store => store.id === requestedStoreId)
        ? requestedStoreId
        : myStores[0]?.id;
    const range = RANGE_OPTIONS.some(option => option.value === statisticsRange)
        ? statisticsRange
        : '30d';

    const { data: stats, isLoading: statsLoading, isFetching, error: statsError, refetch } = useStoreStatistics(storeId, range);
    const loading = storesLoading || statsLoading;
    const toolbarLoading = loading || isFetching;
    // 처음 가게 목록을 받는 동안에도 툴바의 자리를 유지한다. storeId가 생긴 뒤에는
    // 통계만 다시 조회하고, 그 전에는 가게 목록 조회 함수를 넘겨 RefreshButton이 사라지지 않게 한다.
    const handleReload = storeId ? refetch : refetchStores;

    // 가게 목록을 못 받아도 툴바(가게 선택·기간·새로고침)는 제자리에 두고, 오류는 통계가 나올 자리에 띄운다.
    // 예전엔 툴바째 사라지고 오류만 탭 바로 아래에 붙었다(오류 위치 규칙 위반, 2026-09-21).
    const toolbar = (
        <FilterToolbar
            selects={[{
                key: 'store',
                ariaLabel: '통계 가게 필터',
                value: storeId,
                onChange: value => setStatisticsParams({ statisticsStore: String(value) }),
                disabled: storesLoading || Boolean(storesError),
                loading: storesLoading,
                width: 148,
                mobileWidth: 112,
                options: myStores.map((store) => ({ value: store.id, label: store.name })),
            }]}
            extra={(
                <SegmentedControl
                    value={range}
                    onChange={nextRange => setStatisticsParams({ statisticsRange: nextRange })}
                    options={RANGE_OPTIONS}
                    block={false}
                    disabled={toolbarLoading}
                />
            )}
            onReload={handleReload}
            loading={toolbarLoading}
            style={{ marginBottom: 0 }}
        />
    );

    if (storesError) {
        return (
            <div className="reserve-statistics-tab" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {toolbar}
                <DataState state="error" kind="store" subject="가게 목록" error={storesError}
                    onRetry={refetchStores} retrying={storesLoading} style={{ marginTop: 80 }} />
            </div>
        );
    }

    if (!storesLoading && myStores.length === 0) {
        return <DataState state="empty" kind="store" title="등록된 가게가 없습니다." style={{ marginTop: 80 }} />;
    }

    const areaGradientId = 'stats-reservation-gradient';
    const revenueGradientId = 'stats-revenue-gradient';
    const reservationGradient = chartAreaGradient(areaGradientId, colors.primary.main);
    const revenueGradient = chartAreaGradient(revenueGradientId, colors.success.main);

    const statusPieData = stats?.statusBreakdown
        ? Object.entries(stats.statusBreakdown)
            // 라벨은 constants/status.js 한 곳에서만 온다. 여기서 사본을 두면
            // UNCONFIRMED 처럼 나중에 늘어난 상태가 빠져 사용자에게 영어 enum 이 그대로 보인다.
            // 모르는 상태가 둘 이상이면 이름이 '기타'로 겹치므로, 조각/범례의 React key 는
            // 이름이 아니라 원래 enum(k)으로 만든다.
            .map(([k, v]) => ({ key: k, name: RESERVATION_STATUS_LABELS[k] ?? '기타', value: v }))
            .filter((d) => d.value > 0)
        : [];

    // 차트 본문 — 카드 껍데기는 항상 그리고, 본문만 로딩/데이터있음/데이터없음 3단으로 분기한다.
    const renderReservationTrend = () => {
        if (loading) {
            return (
                <div style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16, paddingBottom: 20 }}>
                    {[60, 100, 75, 130, 95, 150].map((h, i) => (
                        <Bone key={i} width={28} height={h} borderRadius={6} />
                    ))}
                </div>
            );
        }
        if (stats?.reservationTrend?.some((d) => d.value > 0)) {
            return (
                <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={stats.reservationTrend} margin={chartMargin}>
                        <defs>
                            <linearGradient id={reservationGradient.id} x1="0" y1="0" x2="0" y2="1">
                                {reservationGradient.stops.map((s) => (
                                    <stop key={s.offset} offset={s.offset} stopColor={s.stopColor} stopOpacity={s.stopOpacity} />
                                ))}
                            </linearGradient>
                        </defs>
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="date" tickFormatter={shortDate} tick={chartAxisTick} axisLine={{ stroke: colors.gray[100] }} tickLine={false} minTickGap={20} />
                        <YAxis width={chartYAxisWidth.count} tick={chartAxisTick} allowDecimals={false} axisLine={false} tickLine={false} />
                        <Tooltip labelFormatter={shortDate} formatter={(v) => [`${v}건`, '예약']} {...chartTooltipStyle} />
                        <Area type="monotone" dataKey="value" stroke={colors.primary.main} strokeWidth={2} fill={`url(#${reservationGradient.id})`} />
                    </AreaChart>
                </ResponsiveContainer>
            );
        }
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text type="secondary">해당 기간 예약이 없습니다.</Text>
            </div>
        );
    };

    const renderStatusPie = () => {
        if (loading) {
            return (
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
            );
        }
        if (statusPieData.length > 0) {
            return (
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
                                        <Cell key={entry.key} fill={chartPalette[i % chartPalette.length]} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v) => `${v}건`} {...chartTooltipStyle} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <PieLegend data={statusPieData} palette={chartPalette} />
                </div>
            );
        }
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text type="secondary">해당 기간 예약이 없습니다.</Text>
            </div>
        );
    };

    const renderRevenueTrend = () => {
        if (loading) {
            return (
                <div style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16, paddingBottom: 20 }}>
                    {[90, 60, 120, 80, 140, 100].map((h, i) => (
                        <Bone key={i} width={28} height={h} borderRadius={6} />
                    ))}
                </div>
            );
        }
        if (stats?.revenueTrend?.some((d) => d.value > 0)) {
            return (
                <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={stats.revenueTrend} margin={chartMargin}>
                        <defs>
                            <linearGradient id={revenueGradient.id} x1="0" y1="0" x2="0" y2="1">
                                {revenueGradient.stops.map((s) => (
                                    <stop key={s.offset} offset={s.offset} stopColor={s.stopColor} stopOpacity={s.stopOpacity} />
                                ))}
                            </linearGradient>
                        </defs>
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="date" tickFormatter={shortDate} tick={chartAxisTick} axisLine={{ stroke: colors.gray[100] }} tickLine={false} minTickGap={20} />
                        <YAxis width={chartYAxisWidth.currency} tick={chartAxisTick} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip labelFormatter={shortDate} formatter={(v) => [`${Number(v).toLocaleString()}원`, '순결제액']} {...chartTooltipStyle} />
                        <Area type="monotone" dataKey="value" stroke={colors.success.main} strokeWidth={2} fill={`url(#${revenueGradient.id})`} />
                    </AreaChart>
                </ResponsiveContainer>
            );
        }
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text type="secondary">해당 기간 순결제액이 없습니다.</Text>
            </div>
        );
    };

    return (
        <div className="reserve-statistics-tab" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {toolbar}
            {statsError && (
                <DataState state="error" subject="통계" error={statsError}
                    title={stats
                        ? '통계를 갱신하지 못했습니다. 이전 조회 결과를 표시하고 있습니다.'
                        : '통계를 불러오지 못했습니다.'}
                    onRetry={refetch} retrying={isFetching} compact={Boolean(stats)} />
            )}
            {(!statsError || stats) && <>
            {/* 요약 카드 - 최소폭을 200에서 150으로 줄여 좁은 모바일 화면에서도 2열이 유지되게 함
                (DashboardTab과 동일한 이유로 통일했다. 예전 최소폭이 넓어 모바일에서 카드들이 세로로 쌓였다) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
                <StatCard
                    icon={<StarFilled />}
                    label="평균 별점"
                    value={stats?.averageRating != null ? stats.averageRating.toFixed(1) : '0.0'}
                    loading={loading}
                />
                <StatCard
                    icon={<CommentOutlined />}
                    label="리뷰 수"
                    value={stats?.reviewCount ?? 0}
                    suffix="전체 누적"
                    loading={loading}
                />
                <StatCard
                    icon={<WalletOutlined />}
                    label="예약금 순결제액"
                    value={(stats?.totalDepositRevenue ?? 0).toLocaleString()}
                    suffix={`원 · 최근 ${rangeDays(range)}일`}
                    loading={loading}
                />
                <StatCard
                    icon={<NotificationOutlined />}
                    label="광고 노출"
                    value={stats?.adSummary ? `${AD_TYPE_LABELS[stats.adSummary.adType] || stats.adSummary.adType}` : '없음'}
                    suffix={stats?.adSummary ? `${stats.adSummary.daysRemaining}일 남음` : '진행 중인 광고 없음'}
                    loading={loading}
                />
            </div>

            {/* 차트 — DashboardTab과 동일한 패턴(2026-07 추가): 카드 껍데기(제목 포함)는 항상 그리고,
                본문만 loading/데이터있음/데이터없음 3단으로 분기해서 실제 차트 모양에 가까운 스켈레톤을 넣는다.
                (예전엔 {'{'}!loading && stats && (...){'}'}로 전체를 감싸서 로딩 중엔 이 아래 3장이 통째로
                안 보이다가 데이터 도착 순간 한꺼번에 나타났음 — DashboardTab에서 이미 고친 것과 동일한
                문제라 같은 패턴을 그대로 재사용) */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <ChartCard
                    title="예약 추이"
                    height={260}
                    minWidth={340}
                    summary={!loading ? summarizeDaily(stats?.reservationTrend, '건') : undefined}
                    tableColumns={DATE_COUNT_COLUMNS}
                    tableRows={!loading ? (stats?.reservationTrend ?? []) : []}
                >
                    {renderReservationTrend()}
                </ChartCard>

                <ChartCard
                    title="상태별 분포"
                    height={260}
                    minWidth={280}
                    summary={!loading && stats
                        ? `선택한 기간의 예약 ${statusPieData.reduce((sum, row) => sum + row.value, 0)}건을 상태별로 나눴습니다.`
                        : undefined}
                    tableColumns={STATUS_COUNT_COLUMNS}
                    tableRows={!loading ? statusPieData : []}
                >
                    {renderStatusPie()}
                </ChartCard>

                <ChartCard
                    title="예약금 순결제액 추이"
                    height={260}
                    minWidth={340}
                    summary={!loading && stats?.revenueTrend?.length
                        ? `확정 환불을 차감한 결제 완료일 기준입니다. ${summarizeDaily(stats.revenueTrend, '원')}`
                        : undefined}
                    tableColumns={DATE_REVENUE_COLUMNS}
                    tableRows={!loading ? (stats?.revenueTrend ?? []) : []}
                >
                    {renderRevenueTrend()}
                </ChartCard>
            </div>

            {/* 광고 성과(2026-07 추가) — 현재 활성 광고가 있을 때만 보여줌(로딩 중엔 낙관적으로 보여주다가 데이터
                도착 후 정말 광고가 없으면 숨김 — DashboardTab의 "최근 감사 로그 요약"와 동일한 판단).
                누적 카운터만 있고 일별 추이는 아직 없음(Advertisement 엔티티에 카운터 컬럼만 있는 구조이라) —
                노출형은 클릭 개념이 없어서 노출수만, 배너형은 클릭/전환까지 함께 보여준다. */}
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
                                {/* 노출형은 클릭 개념이 애매해서(카드 자체 클릭과 구별 불가) 클릭/전환 지표는 배너형만 표시 */}
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

                            {/* 노출 → 클릭 → 전환 퍼널 — 배너형만(노출형은 클릭/전환 개념 자체가 없으므로 생략) */}
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
            </>}
        </div>
    );
};

export default StatisticsTab;
