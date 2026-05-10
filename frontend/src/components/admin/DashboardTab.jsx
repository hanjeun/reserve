import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Skeleton } from 'antd';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ReloadOutlined, ShopOutlined, CalendarOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';
import { Button } from '../common';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';

const { Text, Title } = Typography;

// 색상 팔레트 — 디자인 시스템 기반
const CHART_COLORS = {
    primary:  '#3182f6',
    success:  '#22c55e',
    warning:  '#f59e0b',
    danger:   '#ef4444',
    purple:   '#8b5cf6',
    cyan:     '#06b6d4',
};

const PIE_COLORS = [
    CHART_COLORS.primary,
    CHART_COLORS.success,
    CHART_COLORS.warning,
    CHART_COLORS.danger,
    CHART_COLORS.purple,
    CHART_COLORS.cyan,
];

// ── 요약 카드 ──────────────────────────────────────────────
const StatCard = ({ icon, title, value, sub, color }) => (
    <div style={{
        background: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius.lg,
        padding: '20px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
        flex: 1, minWidth: 160,
    }}>
        <div style={{
            width: 48, height: 48, borderRadius: radius.lg,
            background: `${color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color,
        }}>
            {icon}
        </div>
        <div>
            <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary, display: 'block', marginBottom: 2 }}>
                {title}
            </Text>
            <Text style={{ fontSize: 24, fontWeight: fontWeight.bold, color: colors.text.primary, display: 'block', lineHeight: 1.2 }}>
                {value ?? '-'}
            </Text>
            {sub && (
                <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                    {sub}
                </Text>
            )}
        </div>
    </div>
);

const ChartCard = ({ title, children, height = 260 }) => (
    <div style={{
        background: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius.lg,
        padding: '20px 20px 12px',
        flex: 1, minWidth: 280,
    }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, display: 'block', marginBottom: 16 }}>
            {title}
        </Text>
        <div style={{ height }}>
            {children}
        </div>
    </div>
);

const DashboardTab = () => {
    const { message } = useMessage();
    const [loading, setLoading]   = useState(false);
    const [stats, setStats]       = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            // 여러 API를 병렬로 호출해 통계 구성
            const [bizAll, reservations, trash, auditLogs] = await Promise.allSettled([
                api.get(API_ENDPOINTS.BUSINESS.ADMIN_LIST,      { params: { page: 0, size: 1 } }),
                api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATIONS, { params: { page: 0, size: 100 } }),
                api.get(API_ENDPOINTS.TRASH.LIST,               { params: { page: 0, size: 50 } }),
                api.get(API_ENDPOINTS.AUDIT_LOG.LIST,           { params: { page: 0, size: 50 } }),
            ]);

            const resList  = reservations.status === 'fulfilled' ? (reservations.value?.content ?? []) : [];
            const trashList  = trash.status === 'fulfilled'  ? (trash.value?.content ?? [])   : [];
            const logList  = auditLogs.status === 'fulfilled'  ? (auditLogs.value?.content ?? []) : [];

            // 예약 상태별 분포
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

            // 삭제 통계 — 엔티티 유형별
            const entityCount = trashList.reduce((acc, r) => {
                const label = {
                    MAIL: '수신 메일', SENT_MAIL: '발송 메일',
                    MEMBER: '회원', STORE: '가게',
                    RESERVATION: '예약', REVIEW: '리뷰',
                }[r.entityType] || r.entityType;
                acc[label] = (acc[label] || 0) + 1;
                return acc;
            }, {});
            const trashBarData = Object.entries(entityCount).map(([name, count]) => ({ name, count }));

            // 최근 감사 로그 행위별
            const actionCount = logList.reduce((acc, l) => {
                acc[l.action] = (acc[l.action] || 0) + 1;
                return acc;
            }, {});

            setStats({
                totalBiz:     bizAll.status === 'fulfilled' ? (bizAll.value?.totalElements ?? 0) : '-',
                totalRes:     resList.length,
                trashCount:   trashList.length,
                logCount:     auditLogs.status === 'fulfilled' ? (auditLogs.value?.totalElements ?? 0) : '-',
                reservationPieData,
                trashBarData,
                actionCount,
            });
        } catch {
            message.error('대시보드 데이터를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <Skeleton active paragraph={{ rows: 10 }} />;

    const s = stats;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 툴바 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="ghost-sm" size="md" loading={loading} onClick={load}>
                    <ReloadOutlined /> 새로고침
                </Button>
            </div>

            {/* 요약 카드 */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <StatCard
                    icon={<ShopOutlined />}
                    title="사업자 인증 신청"
                    value={s?.totalBiz}
                    sub="전체 누적"
                    color={CHART_COLORS.primary}
                />
                <StatCard
                    icon={<CalendarOutlined />}
                    title="조회된 예약"
                    value={s?.totalRes}
                    sub="최근 100건 기준"
                    color={CHART_COLORS.success}
                />
                <StatCard
                    icon={<DeleteOutlined />}
                    title="휴지통 항목"
                    value={s?.trashCount}
                    sub="복구 가능"
                    color={CHART_COLORS.warning}
                />
                <StatCard
                    icon={<TeamOutlined />}
                    title="시스템 로그"
                    value={s?.logCount}
                    sub="전체 감사 기록"
                    color={CHART_COLORS.purple}
                />
            </div>

            {/* 차트 영역 */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {/* 예약 상태 분포 — Pie */}
                <ChartCard title="예약 상태 분포" height={240}>
                    {!s?.reservationPieData?.length ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: colors.text.tertiary }}>데이터가 없습니다.</Text>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={s.reservationPieData}
                                    cx="50%" cy="50%"
                                    innerRadius={55} outerRadius={90}
                                    paddingAngle={3}
                                    dataKey="value"
                                    label={({ name, percent }) =>
                                        `${name} ${(percent * 100).toFixed(0)}%`
                                    }
                                    labelLine={false}
                                >
                                    {s.reservationPieData.map((_, i) => (
                                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v) => `${v}건`} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>

                {/* 휴지통 항목 유형별 — Bar */}
                <ChartCard title="휴지통 유형별 현황" height={240}>
                    {!s?.trashBarData?.length ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: colors.text.tertiary }}>휴지통이 비어있습니다.</Text>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={s.trashBarData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: colors.text.tertiary }} />
                                <YAxis tick={{ fontSize: 11, fill: colors.text.tertiary }} allowDecimals={false} />
                                <Tooltip formatter={(v) => [`${v}건`, '항목 수']} />
                                <Bar dataKey="count" fill={CHART_COLORS.warning} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </ChartCard>
            </div>

            {/* 감사 로그 행위별 요약 */}
            {s?.actionCount && Object.keys(s.actionCount).length > 0 && (
                <div style={{
                    background: colors.background.paper,
                    border: `1px solid ${colors.border.light}`,
                    borderRadius: radius.lg,
                    padding: '20px 24px',
                }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, display: 'block', marginBottom: 14 }}>
                        최근 감사 로그 요약
                    </Text>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        {Object.entries({
                            SOFT_DELETE: { label: '소프트 삭제', color: CHART_COLORS.warning },
                            RESTORE:     { label: '복구',        color: CHART_COLORS.success },
                            HARD_DELETE: { label: '영구 삭제',   color: CHART_COLORS.danger  },
                        }).map(([key, cfg]) => (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: cfg.color, display: 'inline-block',
                                }} />
                                <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary }}>
                                    {cfg.label}
                                </Text>
                                <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.text.primary }}>
                                    {s.actionCount[key] || 0}건
                                </Text>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardTab;
