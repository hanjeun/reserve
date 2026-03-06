import React, { useState, useMemo, useEffect } from 'react';
import { Empty, Select, Tabs, Typography, Input } from 'antd';
import {
    CalendarOutlined,
    ClockCircleOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    TrophyOutlined,
    StopOutlined,
    WarningOutlined,
    PartitionOutlined,
    ShopOutlined,
} from '@ant-design/icons';
import { PageContainer, ReservationCardSkeleton } from '../../components/common';
import ReservationCard from '../../components/reservation/ReservationCard';
import useManageReservations from '../../hooks/useManageReservations';
import storeService from '../../services/storeService';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

const { Title, Text } = Typography;
const { Search } = Input;

const STATUS_OPTIONS = [
    { value: 'ALL',       icon: <CalendarOutlined />,    label: '전체' },
    { value: 'PENDING',   icon: <ClockCircleOutlined />, label: '승인 대기' },
    { value: 'CONFIRMED', icon: <CheckCircleOutlined />, label: '확정' },
    { value: 'COMPLETED', icon: <TrophyOutlined />,      label: '완료' },
    { value: 'REJECTED',  icon: <CloseCircleOutlined />, label: '거절' },
    { value: 'CANCELLED', icon: <StopOutlined />,        label: '취소' },
    { value: 'NO_SHOW',   icon: <WarningOutlined />,     label: '노쇼' },
];

const ReservationTab = () => {
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [keyword, setKeyword]           = useState('');
    const [storeFilter, setStoreFilter]   = useState('ALL');
    const [myStores, setMyStores]         = useState([]);
    const { reservations, loading, actionLoading, approve, reject, complete, noShow } = useManageReservations();

    useEffect(() => {
        storeService.getMyStores()
            .then(list => setMyStores(Array.isArray(list) ? list : []))
            .catch(() => {});
    }, []);

    const countOf = (key) => key === 'ALL'
        ? reservations.length
        : reservations.filter(r => r.status === key).length;

    const filtered = useMemo(() => {
        let list = storeFilter !== 'ALL'
            ? reservations.filter(r => r.storeId === Number(storeFilter))
            : reservations;
        if (statusFilter !== 'ALL') list = list.filter(r => r.status === statusFilter);
        if (keyword.trim()) {
            const kw = keyword.toLowerCase();
            list = list.filter(r =>
                r.storeName?.toLowerCase().includes(kw) ||
                r.memberName?.toLowerCase().includes(kw) ||
                r.specialRequest?.toLowerCase().includes(kw)
            );
        }
        return list;
    }, [reservations, statusFilter, storeFilter, keyword]);

    const selectOptions = STATUS_OPTIONS.map(opt => ({
        value: opt.value,
        label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: statusFilter === opt.value ? colors.primary.main : colors.text.tertiary }}>
                    {opt.icon}
                </span>
                {opt.label}
                {/* 로딩 중엔 카운트 숨김 */}
                {!loading && (
                    <span style={{
                        fontSize: fontSize.xs,
                        fontWeight: fontWeight.semibold,
                        color: statusFilter === opt.value ? colors.primary.main : colors.text.tertiary,
                    }}>
                        {countOf(opt.value)}
                    </span>
                )}
            </span>
        ),
    }));

    const pendingCount = !loading ? countOf('PENDING') : 0;
    const currentLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label || '전체';

    return (
        <>
            {/* 필터 바 — 항상 표시 */}
            <div style={styles.filterBar}>
                {myStores.length > 1 && (
                    <Select
                        value={storeFilter}
                        onChange={setStoreFilter}
                        style={{ minWidth: 160 }}
                        size="large"
                        disabled={loading}
                        options={[
                            { value: 'ALL', label: <span><ShopOutlined /> 전체 가게</span> },
                            ...myStores.map(s => ({ value: String(s.id), label: s.name }))
                        ]}
                    />
                )}
                <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={selectOptions}
                    style={{ width: 180 }}
                    size="large"
                    popupMatchSelectWidth={false}
                    disabled={loading}
                />
                <Search
                    placeholder="가게명, 예약자로 검색"
                    allowClear
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    style={{ maxWidth: 240 }}
                    size="large"
                    disabled={loading}
                />
                <div style={styles.countWrap}>
                    {!loading && (
                        <>
                            <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>
                                {currentLabel}{' '}
                                <strong style={{ color: colors.text.primary }}>{filtered.length}건</strong>
                            </Text>
                            {pendingCount > 0 && statusFilter !== 'PENDING' && (
                                <span style={styles.pendingBadge}>
                                    <ClockCircleOutlined style={{ fontSize: 11 }} />
                                    {' '}승인 대기 {pendingCount}건
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* 리스트 영역만 스켈레톤 */}
            {loading ? (
                <ReservationCardSkeleton count={5} />
            ) : filtered.length === 0 ? (
                <div style={{ marginTop: 80 }}>
                    <Empty description={
                        <span style={{ color: colors.text.tertiary }}>
                            {statusFilter === 'ALL' && !keyword.trim()
                                ? '예약 내역이 없습니다.'
                                : '조건에 맞는 예약이 없습니다.'}
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
        </>
    );
};

const ComingSoonTab = ({ label }) => (
    <div style={{ marginTop: 80 }}>
        <Empty
            image={<PartitionOutlined style={{ fontSize: 48, color: colors.border.default }} />}
            description={
                <span style={{ color: colors.text.tertiary }}>
                    <strong>{label}</strong> 기능이 곧 추가됩니다.
                </span>
            }
        />
    </div>
);

const BusinessPanel = () => {
    const [activeTab, setActiveTab] = useState('reservations');

    const tabItems = [
        {
            key: 'reservations',
            label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <CalendarOutlined /> 예약 관리
                </span>
            ),
            children: <ReservationTab />,
        },
        {
            key: 'analytics',
            label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <PartitionOutlined /> 통계 · 분석
                </span>
            ),
            children: <ComingSoonTab label="통계 · 분석" />,
        },
    ];

    return (
        <PageContainer size="xl" paddingTop="40px">
            {/* 헤더 — 항상 표시 */}
            <div style={{ marginBottom: 40 }}>
                <Title level={2} style={styles.title}>사업자 파트너 패널</Title>
                <Text type="secondary" style={{ fontSize: fontSize.base }}>
                    예약 현황을 실시간으로 확인하고 승인·거절하세요.
                </Text>
            </div>

            {/* 탭바 — 항상 표시, 내부 데이터만 스켈레톤 */}
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                style={{ marginBottom: 8 }}
            />
        </PageContainer>
    );
};

const styles = {
    title: { fontWeight: fontWeight.extrabold, margin: '0 0 8px', color: colors.text.primary },
    filterBar: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 20,
        paddingTop: 8,
    },
    countWrap: { display: 'flex', alignItems: 'center', gap: 10, marginLeft: 4 },
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

export default BusinessPanel;
