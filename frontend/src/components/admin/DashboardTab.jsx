import React, { useState, useEffect, useCallback } from 'react';
import { Card, Col, Row, Statistic, Typography, Alert, Divider } from 'antd';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    SyncOutlined, ShopOutlined, CalendarOutlined,
    DeleteOutlined, AuditOutlined,
} from '@ant-design/icons';
import { Button } from '../common';
import { FilterToolbar } from '../common';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontWeight } from '../../styles/tokens';

const { Text } = Typography;

const PIE_COLORS = ['#3182f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const CHART_COLORS = { warning: '#f59e0b' };

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

    const s = stats;

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
                            value={s?.totalBiz ?? '-'}
                            prefix={<ShopOutlined style={{ color: colors.text.secondary }} />}
                            suffix={<Text type="secondary" style={{ fontSize: 12 }}>전체 누적</Text>}
                            valueStyle={{ fontWeight: fontWeight.bold }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={12} md={6}>
                    <Card loading={loading} size="small">
                        <Statistic
                            title="조회된 예약"
                            value={s?.totalRes ?? '-'}
                            prefix={<CalendarOutlined style={{ color: colors.text.secondary }} />}
                            suffix={<Text type="secondary" style={{ fontSize: 12 }}>최근 100건</Text>}
                            valueStyle={{ fontWeight: fontWeight.bold }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={12} md={6}>
                    <Card loading={loading} size="small">
                        <Statistic
                            title="휴지통"
                            value={s?.trashCount ?? '-'}
                            prefix={<DeleteOutlined style={{ color: colors.text.secondary }} />}
                            suffix={<Text type="secondary" style={{ fontSize: 12 }}>복구 가능</Text>}
                            valueStyle={{ fontWeight: fontWeight.bold }}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={12} md={6}>
                    <Card loading={loading} size="small">
                        <Statistic
                            title="감사 로그"
                            value={s?.logCount ?? '-'}
                            prefix={<AuditOutlined style={{ color: colors.text.secondary }} />}
                            suffix={<Text type="secondary" style={{ fontSize: 12 }}>전체 누적</Text>}
                            valueStyle={{ fontWeight: fontWeight.bold }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 차트 */}
            {!loading && s && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <ChartCard title="예약 상태 분포" height={240}>
                        {!s.reservationPieData?.length ? (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Text type="secondary">데이터가 없습니다.</Text>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={s.reservationPieData}
                                        cx="50%" cy="50%"
                                        innerRadius={55} outerRadius={90}
                                        paddingAngle={3} dataKey="value"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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

                    <ChartCard title="휴지통 유형별 현황" height={240}>
                        {!s.trashBarData?.length ? (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Text type="secondary">휴지통이 비어있습니다.</Text>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={s.trashBarData} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip formatter={(v) => [`${v}건`, '항목 수']} />
                                    <Bar dataKey="count" fill={CHART_COLORS.warning} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>
                </div>
            )}

            {/* 감사 로그 요약 */}
            {!loading && s?.actionCount && Object.keys(s.actionCount).length > 0 && (
                <Card size="small" title="최근 감사 로그 요약">
                    <Row gutter={[24, 8]}>
                        {[
                            { key: 'SOFT_DELETE', label: '소프트 삭제', color: '#f59e0b' },
                            { key: 'RESTORE',     label: '복구',        color: '#22c55e' },
                            { key: 'HARD_DELETE', label: '영구 삭제',   color: '#ef4444' },
                        ].map(({ key, label, color }) => (
                            <Col key={key} xs={8}>
                                <Statistic
                                    title={<span style={{ color }}>{label}</span>}
                                    value={s.actionCount[key] || 0}
                                    suffix="건"
                                    valueStyle={{ fontSize: 20, fontWeight: fontWeight.bold, color }}
                                />
                            </Col>
                        ))}
                    </Row>
                </Card>
            )}

            {/* 스켈레톤 대체 */}
            {loading && !s && (
                <Row gutter={[16, 16]}>
                    {[...Array(2)].map((_, i) => (
                        <Col key={i} xs={24} md={12}>
                            <Card loading size="small" style={{ height: 280 }} />
                        </Col>
                    ))}
                </Row>
            )}
        </div>
    );
};

export default DashboardTab;
