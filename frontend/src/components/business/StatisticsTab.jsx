import React from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
    AreaChart, Area, PieChart, Pie,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { StarFilled, WalletOutlined, CommentOutlined, NotificationOutlined } from '../common/icons';
import { DataState, StatCard, ChartCard, SegmentedControl, PieLegend, FilterToolbar } from '../common';
import StatisticsCsvAction from './StatisticsCsvAction';
import { Bone } from '../common/Skeletons';
import { SegmentedControlSkeleton } from '../layout/routeSkeletonParts';
import { useMyStores, useQueryParamsState } from '../../hooks';
import { storeKeys } from '../../hooks/queryKeys';
import storeService from '../../services/storeService';
import useAuthStore from '../../store/useAuthStore';
import { downloadCsv } from '../../utils/csv';
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
    if (total === 0) return `선택한 기간의 합계는 0${unit}이에요.`;
    const peak = rows.reduce((best, row) => (row.value > best.value ? row : best), rows[0]);
    return `기간 합계 ${total.toLocaleString()}${unit}, 가장 높은 날은 ${peak.date}의 ${Number(peak.value).toLocaleString()}${unit}이에요.`;
};

// 광고 성과 지표 하나를 보여주는 작은 박스 — DashboardTab의 "최근 감사 로그 요약"과 동일한 인라인 패턴
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

// 노출 대비 클릭·전환의 비율을 함께 표시한다.

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

const resolveStoreId = (myStores, statisticsStore) => {
    const requestedStoreId = Number(statisticsStore);
    return myStores.some(store => store.id === requestedStoreId)
        ? requestedStoreId
        : myStores[0]?.id;
};

const resolveRange = (statisticsRange) => (
    RANGE_OPTIONS.some(option => option.value === statisticsRange) ? statisticsRange : '30d'
);

const buildStatusPieData = (statusBreakdown) => (
    statusBreakdown
        ? Object.entries(statusBreakdown)
            // 라벨은 constants/status.js 한 곳에서만 온다. 여기서 사본을 두면
            // UNCONFIRMED 처럼 나중에 늘어난 상태가 빠져 사용자에게 영어 enum 이 그대로 보인다.
            // 모르는 상태가 둘 이상이면 이름이 '기타'로 겹치므로, 조각/범례의 React key 는
            // 이름이 아니라 원래 enum(k)으로 만든다.
            .map(([k, v]) => ({ key: k, name: RESERVATION_STATUS_LABELS[k] ?? '기타', value: v }))
            .filter((d) => d.value > 0)
        : []
);

const statusPieSummary = (loading, stats, statusPieData) => (
    !loading && stats
        ? `선택한 기간의 예약 ${statusPieData.reduce((sum, row) => sum + row.value, 0)}건을 상태별로 나눴어요.`
        : undefined
);

const revenueSummary = (loading, stats) => (
    !loading && stats?.revenueTrend?.length
        ? `확정 환불을 차감한 결제 완료일 기준이에요. ${summarizeDaily(stats.revenueTrend, '원')}`
        : undefined
);

// 차트 본문 — 카드 껍데기는 항상 그리고, 본문만 로딩/데이터있음/데이터없음 3단으로 분기한다.
const renderReservationTrend = (loading, stats, reservationGradient) => {
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
        <DataState state="empty" kind="reservation" title="해당 기간 예약이 없어요." style={{ height: '100%' }} />
    );
};

const renderStatusPie = (loading, statusPieData) => {
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
                                data={statusPieData.map((entry, i) => ({
                                    ...entry,
                                    fill: chartPalette[i % chartPalette.length],
                                    stroke: 'none',
                                }))}
                                cx="50%" cy="50%"
                                innerRadius={40} outerRadius={65}
                                paddingAngle={3} dataKey="value"
                                cornerRadius={chartPieCornerRadius}
                            />
                            <Tooltip formatter={(v) => `${v}건`} {...chartTooltipStyle} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <PieLegend data={statusPieData} palette={chartPalette} />
            </div>
        );
    }
    return (
        <DataState state="empty" kind="reservation" title="해당 기간 예약이 없어요." style={{ height: '100%' }} />
    );
};

const renderRevenueTrend = (loading, stats, revenueGradient) => {
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
        <DataState state="empty" kind="payment" title="해당 기간 순결제액이 없어요." style={{ height: '100%' }} />
    );
};

// 요약 카드 4장
const renderSummaryCards = (stats, loading, range) => (
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
);

// 광고 성과 카드 본문 — 로딩 중엔 지표 자리 스켈레톤
const renderAdPerformance = (loading, adSummary) => {
    if (loading) {
        return (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {[1, 2, 3].map((i) => (
                    <div key={i} style={{ flex: '1 1 120px' }}>
                        <Bone width={64} height={13} style={{ marginBottom: 8 }} />
                        <Bone width={40} height={26} />
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <AdStatItem
                    label={`${AD_TYPE_LABELS[adSummary.adType] || adSummary.adType} 노출수`}
                    value={adSummary.impressionCount ?? 0}
                    suffix="회"
                    color={colors.primary.main}
                />
                {/* 노출형은 클릭 개념이 애매해서(카드 자체 클릭과 구별 불가) 클릭/전환 지표는 배너형만 표시 */}
                {adSummary.adType === 'BANNER' && (
                    <>
                        <AdStatItem label="클릭수" value={adSummary.clickCount ?? 0} suffix="회" color={colors.success.main} />
                        <AdStatItem
                            label="클릭율(CTR)"
                            value={adSummary.clickThroughRate != null ? `${adSummary.clickThroughRate}%` : '-'}
                            color="#8b5cf6"
                        />
                        <AdStatItem label="전환수" value={adSummary.conversionCount ?? 0} suffix="건" color={colors.warning.main} />
                        <AdStatItem
                            label="전환율"
                            value={adSummary.conversionRate != null ? `${adSummary.conversionRate}%` : '-'}
                            color={colors.error.main}
                        />
                    </>
                )}
            </div>

            {/* 노출 → 클릭 → 전환 퍼널 — 배너형만(노출형은 클릭/전환 개념 자체가 없으므로 생략) */}
            {adSummary.adType === 'BANNER' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
                    <AdFunnelBar
                        label="노출"
                        value={adSummary.impressionCount ?? 0}
                        maxValue={adSummary.impressionCount ?? 0}
                        color={colors.primary.main}
                    />
                    <AdFunnelBar
                        label="클릭"
                        value={adSummary.clickCount ?? 0}
                        maxValue={adSummary.impressionCount ?? 0}
                        color={colors.success.main}
                    />
                    <AdFunnelBar
                        label="전환"
                        value={adSummary.conversionCount ?? 0}
                        maxValue={adSummary.impressionCount ?? 0}
                        color={colors.warning.main}
                    />
                </div>
            )}
        </div>
    );
};

/*
 * 서버의 예약·매출 집계를 공통 통계 카드와 차트 토큰으로 표시한다.
 */
const StatisticsTab = () => {
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const { stores: myStores, loading: storesLoading, error: storesError, refetch: refetchStores } = useMyStores();
    const [{ statisticsStore, statisticsRange }, setStatisticsParams] = useQueryParamsState(STATISTICS_QUERY_DEFAULTS);
    const storeId = resolveStoreId(myStores, statisticsStore);
    const range = resolveRange(statisticsRange);

    const { data: stats, isLoading: statsLoading, isFetching, error: statsError, refetch } = useStoreStatistics(storeId, range);
    const loading = storesLoading || statsLoading;
    const toolbarLoading = loading || isFetching;
    const selectedStore = myStores.find(store => store.id === storeId);
    const csvDisabled = toolbarLoading || Boolean(storesError || statsError) || !stats || !selectedStore;
    const csvButton = (name, title, columns, rows) => <StatisticsCsvAction loading={loading} disabled={csvDisabled}
        aria-label={`${title} CSV 다운로드`} onClick={() => {
            if (csvDisabled || useAuthStore.getState().sessionRevision !== sessionRevision) return;
            const metadata = [
                { key: 'storeId', label: '가게 ID' }, { key: 'storeName', label: '가게' }, { key: 'rangeDays', label: '기간(일)' },
            ];
            downloadCsv(`reserve-store-${storeId}-${range}-${name}.csv`, [...metadata, ...columns],
                rows.map(row => ({ ...row, storeId, storeName: selectedStore.name, rangeDays: Number(rangeDays(range)) })));
        }} />;
    // 처음 가게 목록을 받는 동안에도 툴바의 자리를 유지한다. storeId가 생긴 뒤에는
    // 통계만 다시 조회하고, 그 전에는 가게 목록 조회 함수를 넘겨 RefreshButton이 사라지지 않게 한다.
    const handleReload = storeId ? refetch : refetchStores;

    const toolbar = (
        <FilterToolbar
            selects={[{
                key: 'store',
                ariaLabel: '통계 가게 필터',
                value: storeId,
                onChange: value => setStatisticsParams({ statisticsStore: String(value) }),
                disabled: storesLoading || Boolean(storesError) && !myStores.length,
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
            extraSkeleton={<SegmentedControlSkeleton options={RANGE_OPTIONS} value={range} />}
            onReload={handleReload}
            loading={toolbarLoading}
            initialLoading={loading}
            style={{ marginBottom: 0 }}
        />
    );

    if (storesError && !myStores.length) {
        return (
            <div className="reserve-statistics-tab" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {toolbar}
                <DataState state="error" kind="store" subject="가게 목록" error={storesError}
                    onRetry={refetchStores} retrying={storesLoading} style={{ marginTop: 80 }} />
            </div>
        );
    }

    if (!storesLoading && myStores.length === 0) {
        return <DataState state="empty" kind="store" title="등록된 가게가 없어요." style={{ marginTop: 80 }} />;
    }

    const areaGradientId = 'stats-reservation-gradient';
    const revenueGradientId = 'stats-revenue-gradient';
    const reservationGradient = chartAreaGradient(areaGradientId, colors.primary.main);
    const revenueGradient = chartAreaGradient(revenueGradientId, colors.success.main);

    const statusPieData = buildStatusPieData(stats?.statusBreakdown);

    return (
        <div className="reserve-statistics-tab" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {toolbar}
            {storesError && myStores.length > 0 && <DataState state="error" kind="store" subject="가게 목록" error={storesError}
                onRetry={refetchStores} retrying={storesLoading} compact />}
            {statsError && (
                <DataState state="error" subject="통계" error={statsError}
                    title={stats
                        ? '통계를 갱신하지 못했어요. 이전 조회 결과를 표시하고 있어요.'
                        : '통계를 불러오지 못했어요.'}
                    onRetry={refetch} retrying={isFetching} compact={Boolean(stats)} />
            )}
            {(!statsError || stats) && <>
            {/*
             * 좁은 화면에서도 요약 카드 두 열을 유지한다.
             */}
            {renderSummaryCards(stats, loading, range)}

            {/*
             * 차트 제목·틀은 유지하고 본문만 골격·데이터·빈 상태로 나눈다.
             */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <ChartCard
                    title="예약 추이"
                    extra={csvButton('reservations', '예약 추이', DATE_COUNT_COLUMNS, stats?.reservationTrend ?? [])}
                    loading={loading}
                    height={260}
                    minWidth={340}
                    summary={!loading ? summarizeDaily(stats?.reservationTrend, '건') : undefined}
                    tableColumns={DATE_COUNT_COLUMNS}
                    tableRows={!loading ? (stats?.reservationTrend ?? []) : []}
                >
                    {renderReservationTrend(loading, stats, reservationGradient)}
                </ChartCard>

                <ChartCard
                    title="상태별 분포"
                    extra={csvButton('statuses', '상태별 분포', STATUS_COUNT_COLUMNS, statusPieData)}
                    loading={loading}
                    height={260}
                    minWidth={280}
                    summary={statusPieSummary(loading, stats, statusPieData)}
                    tableColumns={STATUS_COUNT_COLUMNS}
                    tableRows={!loading ? statusPieData : []}
                >
                    {renderStatusPie(loading, statusPieData)}
                </ChartCard>

                <ChartCard
                    title="예약금 순결제액 추이"
                    extra={csvButton('revenue', '예약금 순결제액 추이', DATE_REVENUE_COLUMNS, stats?.revenueTrend ?? [])}
                    loading={loading}
                    height={260}
                    minWidth={340}
                    summary={revenueSummary(loading, stats)}
                    tableColumns={DATE_REVENUE_COLUMNS}
                    tableRows={!loading ? (stats?.revenueTrend ?? []) : []}
                >
                    {renderRevenueTrend(loading, stats, revenueGradient)}
                </ChartCard>
            </div>

            {/*
             * 활성 광고의 유형에 따라 노출·클릭·전환 누적 집계를 구분한다.
             */}
            {(loading || stats?.adSummary) && (
                <ChartCard title="광고 성과" loading={loading} height="auto">
                    {renderAdPerformance(loading, stats?.adSummary)}
                </ChartCard>
            )}
            </>}
        </div>
    );
};

export default StatisticsTab;
