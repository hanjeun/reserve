import React, { useState, useMemo, useEffect } from 'react';
import { Empty, Select, Tabs, Typography, Input } from 'antd';
import {
    CalendarOutlined,
    ClockCircleOutlined,
    PartitionOutlined,
    ReloadOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { PageContainer, Button, ReservationCardSkeleton } from '../../components/common';
import ReservationCard from '../../components/reservation/ReservationCard';
import useManageReservations from '../../hooks/useManageReservations';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useDebounce from '../../hooks/useDebounce';
import storeService from '../../services/storeService';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

const { Title, Text } = Typography;

// AdminPanel과 동일한 단순 텍스트 옵션 (아이콘/숫자 없음)
const STATUS_OPTIONS = [
    { value: 'ALL',       label: '전체 상태' },
    { value: 'PENDING',   label: '승인 대기' },
    { value: 'CONFIRMED', label: '확정' },
    { value: 'COMPLETED', label: '완료' },
    { value: 'REJECTED',  label: '거절' },
    { value: 'CANCELLED', label: '취소' },
    { value: 'NO_SHOW',   label: '노쇼' },
];

const ReservationTab = () => {
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [keyword, setKeyword] = useState('');
    const debouncedKeyword = useDebounce(keyword, 300);
    const [storeFilter, setStoreFilter]   = useState('ALL');
    const [myStores, setMyStores]         = useState([]);
    const { reservations, loading, actionLoading, approve, reject, complete, noShow, refetch } = useManageReservations();

    useEffect(() => {
        storeService.getMyStores()
            .then(list => setMyStores(Array.isArray(list) ? list : []))
            .catch(() => {});
    }, []);

    const filtered = useMemo(() => {
        let list = storeFilter !== 'ALL'
            ? reservations.filter(r => r.storeId === Number(storeFilter))
            : reservations;
        if (statusFilter !== 'ALL') list = list.filter(r => r.status === statusFilter);
        if (debouncedKeyword.trim()) {
            const kw = debouncedKeyword.toLowerCase();
            list = list.filter(r =>
                r.storeName?.toLowerCase().includes(kw) ||
                r.memberName?.toLowerCase().includes(kw) ||
                r.specialRequest?.toLowerCase().includes(kw)
            );
        }
        return list;
    }, [reservations, statusFilter, storeFilter, debouncedKeyword]);

    const pendingCount = !loading ? reservations.filter(r => r.status === 'PENDING').length : 0;

    return (
        <>
            {/* 필터 바 */}
            <div style={styles.filterBar}>
                {myStores.length > 1 && (
                    <Select
                        value={storeFilter}
                        onChange={setStoreFilter}
                        style={{ minWidth: 140 }}
                        size="large"
                        disabled={loading}
                        options={[
                            { value: 'ALL', label: '전체 가게' },
                            ...myStores.map(s => ({ value: String(s.id), label: s.name }))
                        ]}
                    />
                )}
                <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={STATUS_OPTIONS}
                    style={{ width: 140 }}
                    size="large"
                    disabled={loading}
                />
                {/* 건수 — AdminPanel과 동일하게 셀렉터 옆에 표시 */}
                {!loading && (
                    <Text type="secondary" style={{ fontSize: fontSize.sm, alignSelf: 'center', whiteSpace: 'nowrap' }}>
                        {filtered.length}건
                    </Text>
                )}
                {/* 승인 대기 뱃지 */}
                {pendingCount > 0 && statusFilter !== 'PENDING' && (
                    <span style={styles.pendingBadge}>
                        <ClockCircleOutlined style={{ fontSize: 11 }} />
                        {' '}승인 대기 {pendingCount}건
                    </span>
                )}
                <div style={{ display: 'flex', flex: 1, gap: 10, minWidth: 260 }}>
                    <Input
                        prefix={<SearchOutlined style={{ color: colors.text.tertiary }} />}
                        placeholder="가게명, 예약자로 검색"
                        allowClear
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                        style={{ flex: 1 }}
                        size="large"
                        disabled={loading}
                    />
                    <Button variant="ghost-sm" size="md" loading={loading} onClick={refetch} style={{ flexShrink: 0 }}>
                        <ReloadOutlined /> 새로고침
                    </Button>
                </div>
            </div>

            {loading ? (
                <ReservationCardSkeleton count={5} />
            ) : filtered.length === 0 ? (
                <div style={{ marginTop: 80 }}>
                    <Empty description={
                        <span style={{ color: colors.text.tertiary }}>
                            {statusFilter === 'ALL' && !debouncedKeyword.trim()
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
    useDocumentTitle('파트너 패널');

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
            <div style={{ marginBottom: 40 }}>
                <Title level={2} style={styles.title}>사업자 파트너 패널</Title>
                <Text type="secondary" style={{ fontSize: fontSize.base }}>
                    예약 현황을 실시간으로 확인하고 승인·거절하세요.
                </Text>
            </div>
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
