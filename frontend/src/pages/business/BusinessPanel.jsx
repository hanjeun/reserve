import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Alert, Empty, Pagination, Typography, Tabs } from 'antd';
import {
    CalendarOutlined,
    PartitionOutlined,
    QrcodeOutlined,
    NotificationOutlined,
} from '@ant-design/icons';
import { PageContainer, ReservationCardSkeleton, FilterToolbar } from '../../components/common';
import ReservationCard from '../../components/reservation/ReservationCard';
import QrScannerTab from '../../components/reservation/QrScannerTab';
import AdManageTab from '../../components/advertisement/AdManageTab';
import StatisticsTab from '../../components/business/StatisticsTab';
import useManageReservations from '../../hooks/useManageReservations';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useDebounce from '../../hooks/useDebounce';
import useMessage from '../../hooks/useMessage';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { RESERVATION_STATUS_FILTER_OPTIONS } from '../../constants';
import { DEFAULT_PAGE_SIZE, MOBILE_PAGINATION_BREAKPOINT } from '../../constants/pagination';
import storeService from '../../services/storeService';
import reservationService from '../../services/reservationService';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

const { Title, Text } = Typography;

// 상태 필터 목록은 constants/status.js 하나에서만 온다 —
// 같은 상태를 화면마다 다르게 부르지 않기 위해서다('확정' vs '승인됨' vs '예약 확정').
const STATUS_OPTIONS = RESERVATION_STATUS_FILTER_OPTIONS;

const ReservationTab = () => {
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [keyword, setKeyword] = useState('');
    const debouncedKeyword = useDebounce(keyword, 300);
    const [storeFilter, setStoreFilter]   = useState('ALL');
    const [myStores, setMyStores]         = useState([]);
    const [page, setPage] = useState(1);
    const isMobile = useWindowWidth() < MOBILE_PAGINATION_BREAKPOINT;
    const { reservations, total, totalPages, error, loading, refetching, actionLoading, approve, reject, storeCancel, complete, noShow, refetch } = useManageReservations({
        page: page - 1,
        size: DEFAULT_PAGE_SIZE,
        search: debouncedKeyword.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        storeId: storeFilter === 'ALL' ? undefined : Number(storeFilter),
    });
    const { message, confirm } = useMessage();

    // 마지막 행의 삭제·상태 변경으로 현재 페이지가 없어지면 마지막 유효 페이지로 이동한다.
    if (!loading && !refetching && !error && page > Math.max(totalPages, 1)) {
        setPage(Math.max(totalPages, 1));
    }

    const changeFilter = (setter, value) => {
        setter(value);
        setPage(1);
    };

    const handleRemove = (id) => {
        confirm({
            title: '예약 삭제',
            content: '이 예약을 목록에서 삭제합니다. 되돌릴 수 없습니다.',
            okText: '삭제', cancelText: '취소',
            okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                try {
                    await reservationService.removeReservation(id);
                    message.success('목록에서 제거되었습니다.');
                    refetch();
                } catch { message.error('제거에 실패했습니다.'); }
            },
        });
    };

    useEffect(() => {
        storeService.getMyStores()
            .then(list => setMyStores(Array.isArray(list) ? list : []))
            .catch(() => {});
    }, []);

    return (
        <>
            <FilterToolbar
                selects={[
                    {
                        value: storeFilter,
                        onChange: value => changeFilter(setStoreFilter, value),
                        width: 140,
                        disabled: loading,
                        options: [
                            { value: 'ALL', label: '전체 가게' },
                            ...myStores.map(s => ({ value: String(s.id), label: s.name }))
                        ],
                    },
                    {
                        value: statusFilter,
                        onChange: value => changeFilter(setStatusFilter, value),
                        options: STATUS_OPTIONS,
                        width: 140,
                        disabled: loading,
                    },
                ]}
                count={total}
                search={{ value: keyword, onChange: e => changeFilter(setKeyword, e.target.value), placeholder: '가게명, 예약자로 검색' }}
                onReload={refetch}
                loading={loading || refetching}
            />

            {error ? (
                <Alert type="error" showIcon title="예약을 불러오지 못했습니다. 새로고침으로 다시 시도해주세요." />
            ) : (loading || refetching) ? (
                <ReservationCardSkeleton count={5} />
            ) : reservations.length === 0 ? (
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
                    {reservations.map((res, i) => (
                        <React.Fragment key={res.id}>
                            <ReservationCard
                                reservation={res}
                                actionLoading={actionLoading}
                                onApprove={approve}
                                onReject={reject}
                                onComplete={complete}
                                onNoShow={noShow}
                                onStoreCancel={storeCancel}
                                onRemove={handleRemove}
                            />
                            {i < reservations.length - 1 && <div style={styles.divider} />}
                        </React.Fragment>
                    ))}
                </div>
            )}
            {!error && total > 0 && (
                <nav aria-label="예약 목록 페이지" style={{ marginTop: 16 }}>
                    <Pagination
                        current={page}
                        pageSize={DEFAULT_PAGE_SIZE}
                        total={total}
                        onChange={setPage}
                        showSizeChanger={false}
                        showLessItems={isMobile}
                        size={isMobile ? 'small' : 'default'}
                        align="end"
                        disabled={loading || refetching || keyword !== debouncedKeyword}
                    />
                </nav>
            )}
        </>
    );
};

const BusinessPanel = () => {
    const location = useLocation();
    // 결제 리다이렉트 뒤 새 문서에서도 광고 탭을 복원할 수 있게 URL을 지원한다.
    const requestedTab = new URLSearchParams(location.search).get('tab') || location.state?.activeTab;
    const [activeTab, setActiveTab] = useState(
        ['reservations', 'qr-checkin', 'ads', 'analytics'].includes(requestedTab) ? requestedTab : 'reservations',
    );
    useDocumentTitle('파트너 패널');

    const tabItems = [
        {
            key: 'reservations',
            label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <CalendarOutlined />예약 관리
                </span>
            ),
            children: <ReservationTab />,
        },
        {
            key: 'qr-checkin',
            label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <QrcodeOutlined />QR 체크인
                </span>
            ),
            children: <QrScannerTab />,
        },
        {
            key: 'ads',
            label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <NotificationOutlined />광고 관리
                </span>
            ),
            children: <AdManageTab />,
        },
        {
            key: 'analytics',
            label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <PartitionOutlined />통계 · 분석
                </span>
            ),
            children: <StatisticsTab />,
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
                className="reserve-pill-tabs"
                tabBarGutter={4}
                animated={{ inkBar: true, tabPane: false }}
                destroyOnHidden
                style={{ marginBottom: 8 }}
            />
        </PageContainer>
    );
};

const styles = {
    title: { fontWeight: fontWeight.extrabold, margin: '0 0 8px', color: colors.text.primary },
    list:    { display: 'flex', flexDirection: 'column', paddingBottom: 40 },
    divider: { height: 1, background: colors.border.light },
};

export default BusinessPanel;
