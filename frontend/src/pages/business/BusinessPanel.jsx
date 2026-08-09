import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Empty, Typography, Tabs } from 'antd';
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
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import storeService from '../../services/storeService';
import { colors, fontSize, fontWeight } from '../../styles/tokens';

const { Title, Text } = Typography;

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
    const { reservations, loading, refetching, actionLoading, approve, reject, complete, noShow, refetch } = useManageReservations();
    const { message, confirm } = useMessage();

    const handleRemove = (id) => {
        confirm({
            title: '예약 삭제',
            content: '이 예약을 목록에서 삭제합니다. 되돌릴 수 없습니다.',
            okText: '삭제', cancelText: '취소',
            okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                try {
                    await api.delete(API_ENDPOINTS.RESERVATION.REMOVE(id));
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

    return (
        <>
            <FilterToolbar
                selects={[
                    {
                        value: storeFilter,
                        onChange: setStoreFilter,
                        width: 140,
                        disabled: loading,
                        options: [
                            { value: 'ALL', label: '전체 가게' },
                            ...myStores.map(s => ({ value: String(s.id), label: s.name }))
                        ],
                    },
                    {
                        value: statusFilter,
                        onChange: setStatusFilter,
                        options: STATUS_OPTIONS,
                        width: 140,
                        disabled: loading,
                    },
                ]}
                count={filtered.length}
                search={{ value: keyword, onChange: e => setKeyword(e.target.value), placeholder: '가게명, 예약자로 검색', disabled: loading || refetching }}
                onReload={refetch}
                loading={loading || refetching}
                /* 2026-07-30 — "승인 대기 N건" 배지를 제거했다.
                   셀렉트 줄에 들어가기엔 폭이 부족해 항상 둘째 줄로 밀렸고, 그 때문에 탭과 검색창
                   사이에 줄이 하나 더 끼어 레이아웃이 산만해졌다. 승인 대기 건수는 상태 필터와
                   카드의 상태 라벨로 이미 알 수 있다. */
            />

            {/* 코드리뷰 지적사항 반영(2026-07): 승인/거절/완료/노쇼 처리 후 onSettled로 백그라운드
                재검증이 도는 동안(refetching)에도 최초 로딩과 동일하게 스켈레톤 노출 —
                MyReservations.jsx/StoreList.jsx와 동일 컨벤션 */}
            {(loading || refetching) ? (
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
                                onRemove={handleRemove}
                            />
                            {i < filtered.length - 1 && <div style={styles.divider} />}
                        </React.Fragment>
                    ))}
                </div>
            )}
        </>
    );
};

const BusinessPanel = () => {
    const location = useLocation();
    // 결제 결과 페이지(PaymentResult.jsx)에서 "내 광고 확인하기" 누르면 광고 관리 탭으로 바로 열리게(2026-07)
    const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'reservations');
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
    divider: { height: 1, background: colors.border?.light || '#f0f0f0' },
};

export default BusinessPanel;
