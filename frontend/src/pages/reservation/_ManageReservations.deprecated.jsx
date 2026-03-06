// @deprecated — BusinessPanel.jsx로 이전됨 (/business 라우트)
import React, { useState } from 'react';
import { Empty, Select, Typography } from 'antd';
import {
    CalendarOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    TrophyOutlined,
    StopOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { PageContainer, Loading } from '../../components/common';
import ReservationCard from '../../components/reservation/ReservationCard';
import useManageReservations from '../../hooks/useManageReservations';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

const { Title, Text } = Typography;

/* ─── 상태 옵션 (아이콘 + 라벨 + 개수) ──────────────── */
const STATUS_OPTIONS = [
    { value: 'ALL',       icon: <CalendarOutlined />,     label: '전체' },
    { value: 'PENDING',   icon: <ClockCircleOutlined />,  label: '승인 대기' },
    { value: 'CONFIRMED', icon: <CheckCircleOutlined />,  label: '확정' },
    { value: 'COMPLETED', icon: <TrophyOutlined />,       label: '완료' },
    { value: 'REJECTED',  icon: <CloseCircleOutlined />,  label: '거절' },
    { value: 'CANCELLED', icon: <StopOutlined />,         label: '취소' },
    { value: 'NO_SHOW',   icon: <WarningOutlined />,      label: '노쇼' },
];

const ManageReservations = () => {
    const [statusFilter, setStatusFilter] = useState('ALL');
    const { reservations, loading, actionLoading, approve, reject, complete, noShow } = useManageReservations();

    const filtered = statusFilter === 'ALL'
        ? reservations
        : reservations.filter(r => r.status === statusFilter);

    /* 각 상태별 개수 계산 */
    const countByStatus = (key) =>
        key === 'ALL' ? reservations.length : reservations.filter(r => r.status === key).length;

    /* 드롭다운 옵션 */
    const selectOptions = STATUS_OPTIONS.map(opt => ({
        value: opt.value,
        label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: statusFilter === opt.value ? colors.primary.main : colors.text.tertiary }}>
                    {opt.icon}
                </span>
                {opt.label}
                <span style={{
                    marginLeft: 2,
                    fontSize: fontSize.xs,
                    fontWeight: fontWeight.semibold,
                    color: statusFilter === opt.value ? colors.primary.main : colors.text.tertiary,
                }}>
                    {countByStatus(opt.value)}
                </span>
            </span>
        ),
    }));

    if (loading) return <Loading message="예약 현황을 불러오는 중..." />;

    /* 현재 선택된 상태 라벨 */
    const currentLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label || '전체';
    const pendingCount = countByStatus('PENDING');

    return (
        <PageContainer size="xl" paddingTop="40px">

            {/* ─── 헤더 ─── */}
            <div style={{ marginBottom: 28 }}>
                <Title level={2} style={styles.title}>
                    <CalendarOutlined style={{ marginRight: 10, color: colors.primary.main }} />
                    예약 관리
                </Title>
                <Text type="secondary" style={{ fontSize: fontSize.lg }}>
                    매장의 예약 현황을 실시간으로 확인하고 승인·거절하세요.
                </Text>
            </div>

            {/* ─── 필터 바 ─── */}
            <div style={styles.filterBar}>
                <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={selectOptions}
                    style={{ width: 180 }}
                    size="large"
                    popupMatchSelectWidth={false}
                />

                {/* 총 건수 + 대기 중 배지 */}
                <div style={styles.countWrap}>
                    <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>
                        {currentLabel} <strong style={{ color: colors.text.primary }}>{filtered.length}건</strong>
                    </Text>
                    {pendingCount > 0 && statusFilter !== 'PENDING' && (
                        <span style={styles.pendingBadge}>
                            <ClockCircleOutlined style={{ fontSize: 11 }} />
                            {' '}승인 대기 {pendingCount}건
                        </span>
                    )}
                </div>
            </div>

            {/* ─── 목록 ─── */}
            {filtered.length === 0 ? (
                <div style={{ marginTop: 100 }}>
                    <Empty description={
                        <span style={{ color: colors.text.tertiary }}>
                            {statusFilter === 'ALL'
                                ? '예약 내역이 없습니다.'
                                : `${currentLabel} 예약이 없습니다.`}
                        </span>
                    } />
                </div>
            ) : (
                <div style={styles.list}>
                    {filtered.map((res, i) => (
                        <React.Fragment key={res.id}>
                            <ReservationCard
                                reservation={res}
                                actionLoading={actionLoading}
                                onApprove={approve}
                                onReject={reject}
                                onComplete={complete}
                                onNoShow={noShow}
                            />
                            {i < filtered.length - 1 && <div style={styles.divider} />}
                        </React.Fragment>
                    ))}
                </div>
            )}
        </PageContainer>
    );
};

const styles = {
    title: {
        fontWeight: fontWeight.extrabold,
        margin: '0 0 8px',
        color: colors.text.primary,
        display: 'flex',
        alignItems: 'center',
    },
    filterBar: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
    },
    countWrap: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },
    pendingBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: colors.warning?.light || '#fff7e6',
        color: colors.warning?.main || '#fa8c16',
        borderRadius: 20,
        padding: '3px 10px',
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
    },
    list:    { display: 'flex', flexDirection: 'column', paddingBottom: 40 },
    divider: { height: 1, background: colors.border?.light || '#f0f0f0' },
};

export default ManageReservations;
