import React, { lazy, Suspense, useEffect } from 'react';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Pagination from '../../components/common/Pagination';
import { ReservationCardSkeleton, ReservationSummaryCardSkeleton, DataState, FilterToolbar } from '../../components/common';
import WorkspaceLayout from '../../components/layout/WorkspaceLayout';
import WorkspacePanels from '../../components/layout/WorkspacePanels';
import useWorkspaceNavigate from '../../hooks/useWorkspaceNavigate';
import { BUSINESS_WORKSPACE_GROUPS, resolveBusinessTab } from '../../constants/workspaces';
import ReservationCard from '../../components/reservation/ReservationCard';
import ReservationListingToolbar from '../../components/reservation/ReservationListingToolbar';
import QrScannerSheet from '../../components/reservation/QrScannerSheet';
import AdManageTab from '../../components/advertisement/AdManageTab';
import StatisticsTab from '../../components/business/StatisticsTab';
import ChatIntroTab from '../../components/business/ChatIntroTab';
import StoreNewsSkeleton from '../../components/store-news/StoreNewsSkeleton';
import useManageReservations from '../../hooks/useManageReservations';
import { useMyStores, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import useMessage from '../../hooks/useMessage';
import useViewModeParam from '../../hooks/useViewModeParam';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { resolveViewMode } from '../../utils/viewMode';
import { WaitingTabSkeleton } from '../../components/waiting/WaitingSkeleton';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { RESERVATION_STATUS_FILTER_OPTIONS, RESERVATION_SORT_OPTIONS } from '../../constants';
import { DEFAULT_PAGE_SIZE, MOBILE_PAGINATION_BREAKPOINT } from '../../constants/pagination';
import reservationService from '../../services/reservationService';
import { colors } from '../../styles/tokens';
import businessTabSearch from './businessTabQuery';

const WaitingTab = lazy(() => import('../../components/business/WaitingTab'));
const StoreNewsTab = lazy(() => import('../../components/business/StoreNewsTab'));

// 상태 필터 목록은 constants/status.js 하나에서만 온다 —
// 같은 상태를 화면마다 다르게 부르지 않기 위해서다('확정' vs '승인됨' vs '예약 확정').
const STATUS_OPTIONS = RESERVATION_STATUS_FILTER_OPTIONS;
const SORT_OPTIONS = RESERVATION_SORT_OPTIONS;
const RESERVATION_QUERY_DEFAULTS = Object.freeze({
    reservationStatus: 'ALL',
    reservationSort: 'recent',
    reservationStore: 'ALL',
    reservationSearch: '',
    reservationPage: '1',
});

const optionValueOr = (options, value, fallback) => (
    options.some(option => option.value === value) ? value : fallback
);

const positivePageOrOne = (value) => {
    const page = Number.parseInt(value, 10);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
};

// useManageReservations 조회 조건 — 'ALL'·빈 검색어는 보내지 않는다
const buildManageQuery = ({ page, debouncedKeyword, statusFilter, storeFilter, sort }) => ({
    page: page - 1,
    size: DEFAULT_PAGE_SIZE,
    search: debouncedKeyword.trim() || undefined,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    storeId: storeFilter === 'ALL' ? undefined : Number(storeFilter),
    sort,
});

// 예약 목록 본문 — 로딩 스켈레톤 / 빈 안내 / 목록 중 하나.
const ReservationListBody = ({ loading, view, reservations, statusFilter, debouncedKeyword, cardProps, listRef }) => {
    if (loading) {
        return (
            view === 'cards'
                ? <ReservationSummaryCardSkeleton count={5} />
                : <ReservationCardSkeleton count={5} />
        );
    }
    if (reservations.length === 0) {
        return (
            <DataState state="empty" kind="reservation" style={{ marginTop: 80 }}
                title={statusFilter === 'ALL' && !debouncedKeyword.trim()
                    ? '예약 내역이 없어요.'
                    : '조건에 맞는 예약이 없어요.'} />
        );
    }
    return (
        <div ref={listRef} className={view === 'cards' ? 'reserve-reservation-card-grid' : undefined} style={view === 'list' ? styles.list : undefined}>
            {reservations.map((res, i) => (
                <React.Fragment key={res.id}>
                    <ReservationCard
                        view={view}
                        reservation={res}
                        {...cardProps}
                    />
                    {view === 'list' && i < reservations.length - 1 && <div style={styles.divider} />}
                </React.Fragment>
            ))}
        </div>
    );
};

// 가게 목록·예약 목록이 둘 다 실패하면 하나의 오류로, 예약만 실패하면 예약 오류만 보여 준다.
const renderMainContent = ({ error, blockingError, myStoresError, myStoresLoading, busy, retryAll, refetch, retryStores, listBody }) => {
    if (blockingError && myStoresError) {
        return (
            <DataState state="error" kind="reservation" subject="예약 관리 데이터"
                title="예약 관리 데이터를 불러오지 못했어요." error={error}
                onRetry={retryAll} retrying={busy} />
        );
    }
    if (blockingError) {
        return (
            <DataState state="error" kind="reservation" subject="예약 목록" error={error}
                onRetry={refetch} retrying={busy} />
        );
    }
    return (
        <>
            {error && <DataState state="error" kind="reservation" subject="예약 목록" error={error}
                title="최신 예약을 확인하지 못해 이전 목록을 보여드리고 있어요."
                onRetry={refetch} retrying={busy} compact style={{ marginBottom: 16 }} />}
            {myStoresError && (
                <DataState state="error" kind="store" subject="가게별 필터용 가게 목록" error={myStoresError}
                    onRetry={retryStores} retrying={myStoresLoading} compact style={{ marginBottom: 16 }} />
            )}
            {listBody}
        </>
    );
};

const ReservationTab = () => {
    const [urlSearchParams] = useSearchParams();
    const [reservationParams, setReservationParams] = useQueryParamsState(RESERVATION_QUERY_DEFAULTS);
    const statusFilter = optionValueOr(STATUS_OPTIONS, reservationParams.reservationStatus, 'ALL');
    const sort = optionValueOr(SORT_OPTIONS, reservationParams.reservationSort, 'recent');
    const [view, setView] = useViewModeParam(urlSearchParams, 'list');
    const keyword = reservationParams.reservationSearch;
    const debouncedKeyword = useDebounce(keyword, 300);
    const storeFilter = reservationParams.reservationStore;
    // 광고·통계 탭과 같은 키를 쓰므로, 같은 사업자 패널 안에서 이미 받은 가게 목록은
    // 다시 기다리지 않는다. 예약 데이터와 별개 요청인 점은 아래의 부분 오류 처리로 유지한다.
    const { stores: myStores, loading: myStoresLoading, error: myStoresError, refetch: refetchStores,
        hasData: hasMyStoresData = myStores.length > 0 || !myStoresLoading && !myStoresError } = useMyStores();
    const page = positivePageOrOne(reservationParams.reservationPage);
    const isMobile = useWindowWidth() < MOBILE_PAGINATION_BREAKPOINT;
    const { reservations, total, totalPages, error, loading, refetching, actionLoading, approve, reject, storeCancel, complete, noShow, refetch,
        hasData = reservations.length > 0 || !loading && !error } = useManageReservations(
        buildManageQuery({ page, debouncedKeyword, statusFilter, storeFilter, sort }),
    );
    const { message, confirm } = useMessage();
    const blockingError = isBlockingListReadError(error, reservations);
    const listRef = React.useRef(null);
    useListRefreshAnchor(listRef, JSON.stringify([view, page, debouncedKeyword, statusFilter, storeFilter, sort]), refetching, hasData ? reservations : null);
    const retryStores = () => refetchStores();
    const retryAll = () => {
        void retryStores();
        void refetch();
    };

    // 마지막 행의 삭제·상태 변경으로 현재 페이지가 없어지면 마지막 유효 페이지로 이동한다.
    if (!loading && !refetching && !error && page > Math.max(totalPages, 1)) {
        setReservationParams({ reservationPage: String(Math.max(totalPages, 1)) });
    }

    const changeFilter = (patch) => {
        setReservationParams({ ...patch, reservationPage: '1' });
    };

    const handleRemove = (id) => {
        confirm({
            title: '예약 삭제',
            content: '이 예약을 목록에서 삭제해요. 되돌릴 수 없어요.',
            okText: '삭제', cancelText: '취소',
            okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                try {
                    await reservationService.removeReservation(id);
                    message.success('목록에서 제거됐어요.');
                    void refetch();
                } catch { message.error('제거에 실패했어요.'); }
            },
        });
    };

    const listBody = <ReservationListBody
        {...{ loading, view, reservations, statusFilter, debouncedKeyword, listRef }}
        cardProps={{
            actionLoading,
            onApprove: approve,
            onReject: reject,
            onComplete: complete,
            onNoShow: noShow,
            onStoreCancel: storeCancel,
            onRemove: handleRemove,
        }} />;

    const mainContent = renderMainContent({
        error, blockingError, myStoresError, myStoresLoading, busy: loading || refetching,
        retryAll, refetch, retryStores, listBody,
    });

    return (
        <>
            <ReservationListingToolbar
                view={view}
                onViewChange={setView}
                store={storeFilter}
                onStoreChange={value => changeFilter({ reservationStore: value })}
                storeOptions={[
                    { value: 'ALL', label: '전체 가게' },
                    ...myStores.map(s => ({ value: String(s.id), label: s.name })),
                ]}
                storeDisabled={myStoresLoading || Boolean(myStoresError) && !hasMyStoresData}
                storeLoading={myStoresLoading}
                status={statusFilter}
                onStatusChange={value => changeFilter({ reservationStatus: value })}
                statusOptions={STATUS_OPTIONS}
                sort={sort}
                onSortChange={value => changeFilter({ reservationSort: value })}
                sortOptions={SORT_OPTIONS}
                count={hasData && !blockingError ? total : undefined}
                disabled={loading}
                initialLoading={loading || myStoresLoading}
                label="사업자 예약 목록 필터"
            />
            <FilterToolbar
                autoRefreshDomain="RESERVATION"
                search={{ value: keyword, onChange: e => changeFilter({ reservationSearch: e.target.value }), placeholder: '가게명, 예약자로 검색' }}
                onReload={refetch}
                loading={loading || refetching}
                initialLoading={loading}
            />

            {/* 가게 필터 목록과 예약 목록은 서로 독립 요청이다. 예약은 가게 목록 없이도 '전체 가게'로
                조회된다. 그래서 가게 목록만 실패했을 때 예약까지 가리면 멀쩡히 받아 온 예약을 버리는 셈이다.
                그때는 목록 위에 좁은 오류만 얹고, 둘 다 실패했을 때만 하나의 오류로 합친다. */}
            {mainContent}
            {hasData && !blockingError && total > 0 && (
                <nav aria-label="예약 목록 페이지" style={{ marginTop: 16 }}>
                    <Pagination
                        current={page}
                        pageSize={DEFAULT_PAGE_SIZE}
                        total={total}
                        onChange={nextPage => setReservationParams({ reservationPage: String(nextPage) })}
                        showSizeChanger={false}
                        showLessItems={isMobile}
                        size={isMobile ? 'small' : 'default'}
                        align="end"
                        disabled={loading || keyword !== debouncedKeyword}
                    />
                </nav>
            )}
        </>
    );
};

const BusinessPanel = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const navigateWorkspace = useWorkspaceNavigate();
    const params = new URLSearchParams(location.search);
    const activeTab = resolveBusinessTab(params.get('tab') || location.state?.activeTab);
    const returnTab = resolveBusinessTab(params.get('qrReturn'));
    const contentTab = activeTab === 'qr-checkin' ? (returnTab === 'qr-checkin' ? 'reservations' : returnTab) : activeTab;

    const hrefFor = tab => '?' + businessTabSearch(location.search, tab) + location.hash;
    useEffect(() => {
        const normalized = businessTabSearch(location.search, activeTab);
        if (normalized !== location.search.replace(/^\?/, '')) navigate({ search: '?' + normalized, hash: location.hash }, { replace: true });
    }, [activeTab, location.search, location.hash, navigate]);

    const tabItems = [
        { key: 'reservations', label: '예약 관리', children: <ReservationTab /> },
        { key: 'waiting', label: '웨이팅', children: <Suspense fallback={<WaitingTabSkeleton view={resolveViewMode('/business', params, 'list')} />}><WaitingTab /></Suspense> },
        { key: 'news', label: '가게 소식', children: <Suspense fallback={<StoreNewsSkeleton />}><StoreNewsTab /></Suspense> },
        { key: 'ads', label: '광고 관리', children: <AdManageTab /> },
        { key: 'analytics', label: '통계 · 분석', children: <StatisticsTab /> },
        { key: 'chat-intro', label: '채팅 관리', children: <ChatIntroTab /> },
    ];

    return <WorkspaceLayout title="사업자 파트너 패널"
        groups={BUSINESS_WORKSPACE_GROUPS} activeKey={activeTab} hrefFor={hrefFor}
        onSelect={key => navigateWorkspace(hrefFor(key), key === 'qr-checkin'
            ? { state: { workspaceQrOriginIndex: window.history.state?.idx } } : undefined)}>
        <WorkspacePanels activeKey={contentTab} items={tabItems} />
        <QrScannerSheet open={activeTab === 'qr-checkin'} onClose={() => {
            const origin = location.state?.workspaceQrOriginIndex;
            if (Number.isInteger(origin) && window.history.state?.idx === origin + 1) navigate(-1);
            else navigate(hrefFor(contentTab), { replace: true });
        }} />
    </WorkspaceLayout>;
};

const styles = {
    list: { display: 'flex', flexDirection: 'column', paddingBottom: 40 },
    divider: { height: 1, background: colors.border.light },
};

export default BusinessPanel;
