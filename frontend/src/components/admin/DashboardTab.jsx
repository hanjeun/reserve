import React from 'react';
import { Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
    BarChart, Bar, PieChart, Pie,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    ShopOutlined, CalendarOutlined,
    DeleteOutlined, AuditOutlined,
} from '../common/icons';
import { DataState, FilterToolbar, StatCard, ChartCard, PieLegend } from '../common';
import { Bone } from '../common/Skeletons';
import { adminKeys } from '../../hooks/queryKeys';
import { colors, fontSize, chartPalette, chartGridProps, chartAxisTick, chartTooltipStyle, chartBarRadius, chartPieCornerRadius, chartMargin, chartYAxisWidth } from '../../styles/tokens';
import { fetchDashboardStats } from './dashboardStats';

const { Text } = Typography;

const COUNT_TABLE_COLUMNS = [
    { key: 'name', label: '구분' },
    { key: 'value', label: '건수', render: (value) => `${value}건` },
];

const TRASH_TABLE_COLUMNS = [
    { key: 'name', label: '유형' },
    { key: 'count', label: '건수', render: (value) => `${value}건` },
];

const useDashboardStats = () => {
    return useQuery({
        queryKey: adminKeys.dashboardStats(),
        queryFn: fetchDashboardStats,
    });
};

const DashboardTab = () => {
    const { data: stats, isLoading: loading, isFetching, error, refetch } = useDashboardStats();
    const sourceAvailable = (name) => stats?.sources?.[name] === true;
    const sourceFailed = (name) => Boolean(error || stats?.sources?.[name] === false);
    const reservationSummary = sourceAvailable('reservations')
        ? `전체 ${stats.totalRes}건의 상태 분포예요.`
        : undefined;
    const trashSummary = sourceAvailable('trash')
        ? `전체 ${stats.trashCount}개 중 최근 50개를 유형별로 집계했어요.`
        : undefined;

    const renderAuditSummary = () => {
        if (loading) {
            return <>{[1, 2, 3].map((i) => (
                <div key={i} style={{ flex: '1 1 120px' }}>
                    <Bone width={64} height={13} style={{ marginBottom: 8 }} />
                    <Bone width={40} height={26} />
                </div>
            ))}</>;
        }
        if (sourceFailed('audit')) {
            return (
                <DataState state="error" title="감사 로그를 불러오지 못했어요."
                    onRetry={refetch} retrying={isFetching} compact />
            );
        }
        return <>{[
            { key: 'SOFT_DELETE', label: '소프트 삭제', color: colors.warning.main },
            { key: 'RESTORE',     label: '복구',        color: colors.success.main },
            { key: 'HARD_DELETE', label: '영구 삭제',   color: colors.error.main },
        ].map(({ key, label, color }) => (
            <div key={key} style={{ flex: '1 1 120px' }}>
                <Text style={{ color, fontSize: fontSize.sm, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</Text>
                <span style={{ fontSize: 22, fontWeight: 800, color }}>{stats.actionCount[key] || 0}</span>
                <span style={{ fontSize: fontSize.sm, color: colors.text.tertiary, marginLeft: 4 }}>건</span>
            </div>
        ))}</>;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 툴바 — 다른 탭과 동일한 FilterToolbar */}
            <FilterToolbar onReload={refetch} loading={isFetching} initialLoading={loading} />

            {error && (
                <DataState state="error" subject="대시보드 데이터" error={error}
                    title="대시보드 데이터를 모두 불러오지 못했어요." onRetry={refetch} retrying={isFetching} compact={Boolean(stats)} />
            )}
            {!error && stats?.failedSources?.length > 0 && (
                <DataState state="error"
                    title={`${stats.failedSources.join(' · ')} 데이터만 불러오지 못했어요. 나머지 결과는 정상 표시 중이에요.`}
                    onRetry={refetch} retrying={isFetching} compact />
            )}

            {/*
             * 좁은 화면에서도 요약 카드 두 열을 유지한다.
             */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
                <StatCard
                    icon={<ShopOutlined />}
                    label="사업자 신청"
                    value={stats?.totalBiz ?? '-'}
                    suffix={sourceFailed('business') ? '조회 실패' : '전체 누적'}
                    loading={loading}
                />
                <StatCard
                    icon={<CalendarOutlined />}
                    label="전체 예약"
                    value={stats?.totalRes ?? '-'}
                    suffix={sourceFailed('reservations') ? '조회 실패' : '전체 누적'}
                    loading={loading}
                />
                <StatCard
                    icon={<DeleteOutlined />}
                    label="휴지통"
                    value={stats?.trashCount ?? '-'}
                    suffix={sourceFailed('trash') ? '조회 실패' : '복구 가능'}
                    loading={loading}
                />
                <StatCard
                    icon={<AuditOutlined />}
                    label="감사 로그"
                    value={stats?.logCount ?? '-'}
                    suffix={sourceFailed('audit') ? '조회 실패' : '전체 누적'}
                    loading={loading}
                />
            </div>

            {/*
             * 카드 제목·틀은 유지하고 본문만 차트 골격·데이터·빈 상태로 나눈다.
             */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <ChartCard
                    title="예약 상태 분포"
                    loading={loading}
                    height={240}
                    summary={reservationSummary}
                    tableColumns={COUNT_TABLE_COLUMNS}
                    tableRows={sourceAvailable('reservations') ? stats.reservationPieData : []}
                >
                    {loading && (
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
                    )}
                    {!loading && sourceAvailable('reservations') && stats?.reservationPieData?.length > 0 && (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ width: 130, height: 130, flexShrink: 0 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={stats.reservationPieData.map((entry, i) => ({
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
                            <PieLegend data={stats.reservationPieData} palette={chartPalette} />
                        </div>
                    )}
                    {!loading && sourceAvailable('reservations') && !stats?.reservationPieData?.length && (
                        <DataState state="empty" kind="reservation" title="데이터가 없어요." style={{ height: '100%' }} />
                    )}
                    {!loading && sourceFailed('reservations') && (
                        <DataState state="error" kind="reservation" title="예약 집계를 불러오지 못했어요."
                            onRetry={refetch} retrying={isFetching} compact style={{ height: '100%' }} />
                    )}
                </ChartCard>

                <ChartCard
                    title="최근 50개 휴지통 유형"
                    loading={loading}
                    height={240}
                    summary={trashSummary}
                    tableColumns={TRASH_TABLE_COLUMNS}
                    tableRows={sourceAvailable('trash') ? stats.trashBarData : []}
                >
                    {loading && (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 24, paddingBottom: 24 }}>
                            {[70, 110, 55, 90].map((h) => (
                                <Bone key={h} width={36} height={h} borderRadius={6} />
                            ))}
                        </div>
                    )}
                    {!loading && sourceAvailable('trash') && stats?.trashBarData?.length > 0 && (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={stats.trashBarData} margin={chartMargin}>
                                <CartesianGrid {...chartGridProps} />
                                <XAxis dataKey="name" tick={chartAxisTick} axisLine={{ stroke: colors.gray[100] }} tickLine={false} />
                                <YAxis width={chartYAxisWidth.count} tick={chartAxisTick} allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip formatter={(v) => [`${v}건`, '항목 수']} {...chartTooltipStyle} />
                                <Bar dataKey="count" fill={colors.warning.main} radius={chartBarRadius} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                    {!loading && sourceAvailable('trash') && !stats?.trashBarData?.length && (
                        <DataState state="empty" title="휴지통이 비어있어요." style={{ height: '100%' }} />
                    )}
                    {!loading && sourceFailed('trash') && (
                        <DataState state="error" title="휴지통 데이터를 불러오지 못했어요."
                            onRetry={refetch} retrying={isFetching} compact style={{ height: '100%' }} />
                    )}
                </ChartCard>
            </div>

            {/* 감사 로그 요약 — 로딩 중엔 낙관적으로 스켈레톤을 보여주고(대부분 로그가 있는 게
                일반적이므로), 데이터 도착 후 실제로 로그가 하나도 없으면 기존처럼 카드 자체를 숨김 */}
            {(loading || sourceFailed('audit') || (stats?.actionCount && Object.keys(stats.actionCount).length > 0)) && (
                <ChartCard title="최근 감사 로그 요약" loading={loading} height="auto">
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        {renderAuditSummary()}
                    </div>
                </ChartCard>
            )}
        </div>
    );
};

export default DashboardTab;
