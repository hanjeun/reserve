import React, { useState, useEffect, useCallback } from 'react';
import { Card, Col, Row, Statistic, Typography } from 'antd';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    ShopOutlined, CalendarOutlined,
    DeleteOutlined, AuditOutlined,
} from '@ant-design/icons';
import { FilterToolbar } from '../common';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontWeight } from '../../styles/tokens';

const { Text } = Typography;

// 차트 팔레트 — 브랜드 토큰 우선, 토큰에 없는 보조색만 별도 지정 (2026-07 대시보드 Toss 리디자인)
const PIE_COLORS = [
    colors.primary.main,   // #3182f6
    colors.success.main,   // #00c73c
    colors.warning.main,   // #ffb800
    colors.error.main,     // #f04452
    '#8b5cf6',             // 보조색 (토큰에 없는 purple)
    '#06b6d4',             // 보조색 (토큰에 없는 cyan)
];
const CHART_COLORS = { warning: colors.warning.main };

const ChartCard = ({ title, children, height = 260 }) => (
    <Card size="small" title={title} style={{ flex: 1, minWidth: 260 }}>
        <div style={{ height }}>
            {children}
        </div>
    </Card>
);

const DashboardTab = () => {
    const { message } = useMessage();
    const [loading, setLoading] = useState(false);
    const [stats, setStats]     = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
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

            setStats({
                totalBiz:  bizAll.status === 'fulfilled' ? (bizAll.value?.totalElements ?? 0) : '-',
                totalRes:  resList.length,
                trashCount: trashList.length,
                logCount:  auditLogs.status === 'fulfilled' ? (auditLogs.value?.totalElements ?? 0) : '-',
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 툴바 — 다른 탭과 동일한 FilterToolbar */}
            <FilterToolbar onReload={load} loading={loading} />

            {/* 요약 카드 — Ant Design Statistic */}
            <Row gutter={[16, 16]}>
                <Col xs={12} sm={12} md={6}>
                    <Card loading={loading} size="small">
                        <Statistic
                            title="사업자 신청"
                            value={stats?.totalBiz ?? '-'}
                            prefix={<ShopOutlined style={{ color: colors.text.secondary }} />}
                            suffix={<Text type="secondary" style={{ fontSize: 12 }}>전체 누적</Text>}
                            styles={{ content: { fontWeight: fontWeight.bold } }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={12} md={6}>
                    <Card loading={loading} size="small">
                        <Statistic
                            title="조회된 예약"
                            value={stats?.totalRes ?? '-'}
                            prefix={<CalendarOutlined style={{ color: colors.text.secondary }} />}
                            suffix={<Text type="secondary" style={{ fontSize: 12 }}>최근 100건</Text>}
                            styles={{ content: { fontWeight: fontWeight.bold } }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={12} md={6}>
                    <Card loading={loading} size="small">
                        <Statistic
                            title="휴지통"
                            value={stats?.trashCount ?? '-'}
                            prefix={<DeleteOutlined style={{ color: colors.text.secondary }} />}
                            suffix={<Text type="secondary" style={{ fontSize: 12 }}>복구 가능</Text>}
                            styles={{ content: { fontWeight: fontWeight.bold } }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={12} md={6}>
                    <Card loading={loading} size="small">
                        <Statistic
                            title="감사 로그"
                            value={stats?.logCount ?? '-'}
                            prefix={<AuditOutlined style={{ color: colors.text.secondary }} />}
                            suffix={<Text type="secondary" style={{ fontSize: 12 }}>전체 누적</Text>}
                            styles={{ content: { fontWeight: fontWeight.bold } }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 차트 */}
            {!loading && stats && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <ChartCard title="예약 상태 분포" height={240}>
                        {stats.reservationPieData?.length ? (
                            <ResponsiveContainer width="100%" height={240}>
                                <PieChart>
                                    <Pie
                                        data={stats.reservationPieData}
                                        cx="50%" cy="50%"
                                        innerRadius={55} outerRadius={90}
                                        paddingAngle={3} dataKey="value"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        labelLine={false}
                                    >
                                        {stats.reservationPieData.map((entry, i) => (
                                            <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v) => `${v}건`} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Text type="secondary">데이터가 없습니다.</Text>
                            </div>
                        )}
                    </ChartCard>

                    <ChartCard title="휴지통 유형별 현황" height={240}>
                        {stats.trashBarData?.length ? (
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={stats.trashBarData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip formatter={(v) => [`${v}건`, '항목 수']} />
                                    <Bar dataKey="count" fill={CHART_COLORS.warning} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Text type="secondary">휴지통이 비어있습니다.</Text>
                            </div>
                        )}
                    </ChartCard>
                </div>
            )}

            {/* 감사 로그 요약 */}
            {!loading && stats?.actionCount && Object.keys(stats.actionCount).length > 0 && (
                <Card size="small" title="최근 감사 로그 요약">
                    <Row gutter={[24, 8]}>
                        {[
                            { key: 'SOFT_DELETE', label: '소프트 삭제', color: colors.warning.main },
                            { key: 'RESTORE',     label: '복구',        color: colors.success.main },
                            { key: 'HARD_DELETE', label: '영구 삭제',   color: colors.error.main },
                        ].map(({ key, label, color }) => (
                            <Col key={key} xs={8}>
                                <Statistic
                                    title={<span style={{ color }}>{label}</span>}
                                    value={stats.actionCount[key] || 0}
                                    suffix="건"
                                    styles={{ content: { fontSize: 20, fontWeight: fontWeight.bold, color } }}
                                />
                            </Col>
                        ))}
                    </Row>
                </Card>
            )}

            {/* 스켈레톤 대체 */}
            {loading && !stats && (
                <Row gutter={[16, 16]}>
                    {(['chart-pie', 'chart-bar']).map((key) => (
                        <Col key={key} xs={24} md={12}>
                            <Card loading size="small" style={{ height: 280 }} />
                        </Col>
                    ))}
                </Row>
            )}
        </div>
    );
};

export default DashboardTab;
