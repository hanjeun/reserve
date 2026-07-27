import React, { useEffect } from 'react';
import { Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    ShopOutlined, CalendarOutlined,
    DeleteOutlined, AuditOutlined,
} from '@ant-design/icons';
import { FilterToolbar, StatCard, ChartCard, PieLegend } from '../common';
import { Bone } from '../common/Skeletons';
import { useMessage } from '../../hooks';
import { adminKeys } from '../../hooks/queryKeys';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, chartPalette, chartGridProps, chartAxisTick, chartTooltipStyle, chartBarRadius, chartPieCornerRadius } from '../../styles/tokens';

const { Text } = Typography;

/**
 * 2026-07-09: TanStack Query로 전환 (adminKeys.dashboardStats()) — 4개 병렬 조회 +
 * 집계 로직을 queryFn 안에 그대로 옮김. 새로고침 버튼은 그대로 refetch()에 연결.
 *
 * 2026-07-10: 비주얼을 StatCard/ChartCard + chart 토큰 기반으로 리디자인 (기본 AntD
 * Card+Statistic, CartesianGrid 격자선 노출 등 각진 느낌 → 둥근 카드 + 컬러 아이콘 배지 +
 * 부드러운 차트). 5월에 한 번 이런 방향으로 만들었다가 "최대한 AntD 쓰는 방향으로"
 * 되돌린 이력이 있음 — 이번엔 피그마 레퍼런스 + 통계 탭 재사용 목적으로 다시 진행.
 * 데이터/집계 로직은 그대로 두고 비주얼만 교체 — 리스크를 낮추기 위해 이 화면에서 먼저 검증.
 */
const useDashboardStats = () => {
    const { message } = useMessage();

    const query = useQuery({
        queryKey: adminKeys.dashboardStats(),
        queryFn: async () => {
            const [bizAll, reservations, trash, auditLogs] = await Promise.allSettled([
                api.get(API_ENDPOINTS.BUSINESS.ADMIN_LIST,           { params: { page: 0, size: 1 } }),
                api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATIONS,{ params: { page: 0, size: 100 } }),
                api.get(API_ENDPOINTS.TRASH.LIST,                    { params: { page: 0, size: 50 } }),
                api.get(API_ENDPOINTS.AUDIT_LOG.LIST,                { params: { page: 0, size: 50 } }),
            ]);

            const resList  = reservations.status === 'fulfilled' ? (reservations.value?.content ?? []) : [];
            const trashList = trash.status === 'fulfilled'  ? (trash.value?.content ?? [])   : [];
            const logList  = auditLogs.status === 'fulfilled'  ? (auditLogs.value?.content ?? []) : [];

            const statusCount = resList.reduce((acc, r) => {
                acc[r.status] = (acc[r.status] || 0) + 1;
                return acc;
            }, {});

            const reservationPieData = Object.entries({
                PENDING:   '대기 중',
                CONFIRMED: '승인됨',
                COMPLETED: '이용완료',
                CANCELLED: '취소됨',
                REJECTED:  '거절됨',
                NO_SHOW:   '노쇼',
            })
                .map(([k, label]) => ({ name: label, value: statusCount[k] || 0 }))
                .filter(d => d.value > 0);

            const entityCount = trashList.reduce((acc, r) => {
                const label = {
                    MAIL: '수신메일', SENT_MAIL: '발송메일',
                    MEMBER: '회원', STORE: '가게',
                    RESERVATION: '예약', REVIEW: '리뷰',
                }[r.entityType] || r.entityType;
                acc[label] = (acc[label] || 0) + 1;
                return acc;
            }, {});
            const trashBarData = Object.entries(entityCount).map(([name, count]) => ({ name, count }));

            const actionCount = logList.reduce((acc, l) => {
                acc[l.action] = (acc[l.action] || 0) + 1;
                return acc;
            }, {});

            // Spring Boot 3.5부터 Page 응답의 totalElements가 page:{} 하위로 이동해서(2026-07 버그 수정),
            // 아래 두 값이 항상 0으로 보였음 — 신버전(page.totalElements)을 우선 읽고 구버전도 폴백으로 허용.
            return {
                totalBiz:  bizAll.status === 'fulfilled' ? (bizAll.value?.page?.totalElements ?? bizAll.value?.totalElements ?? 0) : '-',
                totalRes:  resList.length,
                trashCount: trashList.length,
                logCount:  auditLogs.status === 'fulfilled' ? (auditLogs.value?.page?.totalElements ?? auditLogs.value?.totalElements ?? 0) : '-',
                reservationPieData,
                trashBarData,
                actionCount,
            };
        },
    });

    useEffect(() => {
        if (query.error) message.error('대시보드 데이터를 불러오지 못했습니다.');
    }, [query.error, message]);

    return query;
};

const DashboardTab = () => {
    const { data: stats, isLoading: loading, refetch } = useDashboardStats();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 툴바 — 다른 탭과 동일한 FilterToolbar */}
            <FilterToolbar onReload={refetch} loading={loading} />

            {/* 요약 카드 - 2026-07 수정: 최소폭을 200에서 150으로 줄여 좁은 모바일 화면에서도 2열이 유지되게 함
                (예전 최소폭이 넓어 모바일에서 카드 4장이 한 줄씩 세로로 쌓여 허전해 보였다) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
                <StatCard
                    icon={<ShopOutlined />}
                    label="사업자 신청"
                    value={stats?.totalBiz ?? '-'}
                    suffix="전체 누적"
                    color={colors.primary.main}
                    loading={loading}
                />
                <StatCard
                    icon={<CalendarOutlined />}
                    label="조회된 예약"
                    value={stats?.totalRes ?? '-'}
                    suffix="최근 100건"
                    color={colors.success.main}
                    loading={loading}
                />
                <StatCard
                    icon={<DeleteOutlined />}
                    label="휴지통"
                    value={stats?.trashCount ?? '-'}
                    suffix="복구 가능"
                    color={colors.warning.main}
                    loading={loading}
                />
                <StatCard
                    icon={<AuditOutlined />}
                    label="감사 로그"
                    value={stats?.logCount ?? '-'}
                    suffix="전체 누적"
                    color="#8b5cf6"
                    loading={loading}
                />
            </div>

            {/* 차트 — 코드리뷰 지적사항 반영(2026-07): 예전엔 {!loading && stats && (...)}로 통째로
                묶여있어서 로딩 중엔 카드 자체가 아예 안 그려졌음(StatCard는 자체 스켈레톤이 있는데
                이 아래 섹션들만 텅 빈 채로 있다가 데이터 도착 순간 툭 튀어나옴) — 카드 껍데기(제목
                포함)는 항상 그리고, 본문만 loading/데이터있음/데이터없음 3단으로 분기해서 실제
                차트 모양(도넛/막대)에 가까운 스켈레톤을 넣음 */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <ChartCard title="예약 상태 분포" height={240}>
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
                    {!loading && stats?.reservationPieData?.length > 0 && (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ width: 130, height: 130, flexShrink: 0 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={stats.reservationPieData}
                                            cx="50%" cy="50%"
                                            innerRadius={40} outerRadius={65}
                                            paddingAngle={3} dataKey="value"
                                            cornerRadius={chartPieCornerRadius}
                                        >
                                            {stats.reservationPieData.map((entry, i) => (
                                                <Cell key={entry.name} fill={chartPalette[i % chartPalette.length]} stroke="none" />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(v) => `${v}건`} {...chartTooltipStyle} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <PieLegend data={stats.reservationPieData} palette={chartPalette} />
                        </div>
                    )}
                    {!loading && !stats?.reservationPieData?.length && (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Text type="secondary">데이터가 없습니다.</Text>
                        </div>
                    )}
                </ChartCard>

                <ChartCard title="휴지통 유형별 현황" height={240}>
                    {loading && (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 24, paddingBottom: 24 }}>
                            {[70, 110, 55, 90].map((h) => (
                                <Bone key={h} width={36} height={h} borderRadius={6} />
                            ))}
                        </div>
                    )}
                    {!loading && stats?.trashBarData?.length > 0 && (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={stats.trashBarData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                                <CartesianGrid {...chartGridProps} />
                                <XAxis dataKey="name" tick={chartAxisTick} axisLine={{ stroke: colors.gray[100] }} tickLine={false} />
                                <YAxis tick={chartAxisTick} allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip formatter={(v) => [`${v}건`, '항목 수']} {...chartTooltipStyle} />
                                <Bar dataKey="count" fill={colors.warning.main} radius={chartBarRadius} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                    {!loading && !stats?.trashBarData?.length && (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Text type="secondary">휴지통이 비어있습니다.</Text>
                        </div>
                    )}
                </ChartCard>
            </div>

            {/* 감사 로그 요약 — 로딩 중엔 낙관적으로 스켈레톤을 보여주고(대부분 로그가 있는 게
                일반적이므로), 데이터 도착 후 실제로 로그가 하나도 없으면 기존처럼 카드 자체를 숨김 */}
            {(loading || (stats?.actionCount && Object.keys(stats.actionCount).length > 0)) && (
                <ChartCard title="최근 감사 로그 요약" height="auto">
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        {loading ? (
                            [1, 2, 3].map((i) => (
                                <div key={i} style={{ flex: '1 1 120px' }}>
                                    <Bone width={64} height={13} style={{ marginBottom: 8 }} />
                                    <Bone width={40} height={26} />
                                </div>
                            ))
                        ) : (
                            [
                                { key: 'SOFT_DELETE', label: '소프트 삭제', color: colors.warning.main },
                                { key: 'RESTORE',     label: '복구',        color: colors.success.main },
                                { key: 'HARD_DELETE', label: '영구 삭제',   color: colors.error.main },
                            ].map(({ key, label, color }) => (
                                <div key={key} style={{ flex: '1 1 120px' }}>
                                    <Text style={{ color, fontSize: fontSize.sm, fontWeight: 600, display: 'block', marginBottom: 4 }}>{label}</Text>
                                    <span style={{ fontSize: 22, fontWeight: 800, color }}>{stats.actionCount[key] || 0}</span>
                                    <span style={{ fontSize: fontSize.sm, color: colors.text.tertiary, marginLeft: 4 }}>건</span>
                                </div>
                            ))
                        )}
                    </div>
                </ChartCard>
            )}
        </div>
    );
};

export default DashboardTab;
