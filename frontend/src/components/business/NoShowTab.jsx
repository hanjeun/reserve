import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataState, FilterToolbar, ReservationCardSkeleton, SegmentedControl } from '../common';
import Pagination from '../common/Pagination';
import { AnimatedListingContent } from '../common/AnimatedContent';
import ReservationCard from '../reservation/ReservationCard';
import ReservationListingToolbar from '../reservation/ReservationListingToolbar';
import NoShowMembers from './NoShowMembers';
import useManageReservations from '../../hooks/useManageReservations';
import useMyStores from '../../hooks/useMyStores';
import useQueryParamsState from '../../hooks/useQueryParamState';
import useInitialLoading from '../../hooks/useInitialLoading';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import { DEFAULT_PAGE_SIZE, MOBILE_PAGINATION_BREAKPOINT } from '../../constants/pagination';
import { colors } from '../../styles/tokens';

const STATUS_OPTIONS = [{ value: 'UNCONFIRMED', label: '확인 필요' }, { value: 'NO_SHOW', label: '확정된 노쇼' }];
const SORT_OPTIONS = [{ value: 'recent', label: '최신 예약순' }, { value: 'oldest', label: '오래된 예약순' }, { value: 'visit', label: '방문 일시순' }];

export default function NoShowTab() {
    const [params, setParams] = useSearchParams();
    const section = params.get('noShowSection') === 'members' ? 'members' : 'reservations';
    const stores = useMyStores();
    return <section aria-label="노쇼 관리 내역">
        <div style={{ marginBottom: 20 }}><SegmentedControl block={false} value={section}
            options={[{ value: 'reservations', label: '노쇼 예약' }, { value: 'members', label: '노쇼 인원' }]}
            onChange={value => setParams(previous => {
                const next = new URLSearchParams(previous);
                next.set('noShowSection', value);
                return next;
            })} /></div>
        {section === 'members' ? <NoShowMembers storeList={stores} /> : <NoShowReservations storeList={stores} />}
    </section>;
}

function NoShowReservations({ storeList }) {
    const [params, setParams] = useSearchParams();
    const { stores, error: storesError, loading: storesLoading, refetch: refetchStores } = storeList;
    const isMobile = useWindowWidth() < MOBILE_PAGINATION_BREAKPOINT;
    const status = STATUS_OPTIONS.some(option => option.value === params.get('noShowStatus')) ? params.get('noShowStatus') : 'UNCONFIRMED';
    const sort = SORT_OPTIONS.some(option => option.value === params.get('noShowSort')) ? params.get('noShowSort') : 'recent';
    const view = params.get('noShowView') === 'cards' ? 'cards' : 'list';
    const [{ noShowSearch: search, noShowPage }, setSearch] = useQueryParamsState({ noShowSearch: '', noShowPage: '1' },
        { privateKeys: ['noShowSearch'] });
    const requestedPage = Number(noShowPage);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const requestedStore = Number(params.get('noShowStore'));
    const storeId = Number.isSafeInteger(requestedStore) && requestedStore > 0 ? requestedStore : undefined;
    const list = useManageReservations({ page: page - 1, size: DEFAULT_PAGE_SIZE, status, storeId, sort, search: search.trim() || undefined });
    const busy = list.loading || list.refetching;
    const initialLoading = useInitialLoading(list.loading || storesLoading);
    const blocking = isBlockingListReadError(list.error, list.reservations);
    const change = (patch, resetPage = true) => setParams(previous => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === '' || value === 'ALL') next.delete(key);
            else next.set(key, String(value));
        }
        if (resetPage) next.set('noShowPage', '1');
        return next;
    });
    const reload = () => { void list.refetch(); if (storesError) void refetchStores(); };
    useEffect(() => {
        const lastPage = Math.max(list.totalPages, 1);
        if (busy || !list.hasData || list.error || page <= lastPage) return;
        setParams(previous => {
            const next = new URLSearchParams(previous);
            next.set('noShowPage', String(lastPage));
            return next;
        }, { replace: true });
    }, [busy, list.hasData, list.error, list.totalPages, page, setParams]);

    return <div className="reserve-no-show-tab">
        <ReservationListingToolbar view={view} onViewChange={value => change({ noShowView: value }, false)}
            label="노쇼 예약 목록 필터" status={status} statusAriaLabel="노쇼 확인 상태" statusOptions={STATUS_OPTIONS}
            onStatusChange={value => change({ noShowStatus: value })}
            sort={sort} sortOptions={SORT_OPTIONS} onSortChange={value => change({ noShowSort: value })}
            store={storeId == null ? 'ALL' : String(storeId)} storeLoading={storesLoading}
            storeOptions={[{ value: 'ALL', label: '전체 가게' }, ...stores.map(store => ({ value: String(store.id), label: store.name }))]}
            onStoreChange={value => change({ noShowStore: value })}
            disabled={initialLoading} initialLoading={initialLoading}
            count={list.hasData && !blocking ? list.total : undefined} />
        <FilterToolbar search={{ value: search, onSubmit: value => setSearch({ noShowSearch: value, noShowPage: '1' }), placeholder: '가게명, 예약자로 검색' }}
            onReload={reload} loading={busy} initialLoading={initialLoading} />
        {blocking ? <DataState state="error" title="노쇼 관리 내역을 불러오지 못했어요." error={list.error} onRetry={reload} retrying={busy} /> :
            <AnimatedListingContent motionKey={`${view}:${list.resultPage ?? page}`} ready={!list.loading}
                keepResultsHeight={list.total > DEFAULT_PAGE_SIZE} notice={<>
                {list.error && <DataState state="error" title="최신 내역을 확인하지 못해 이전 목록을 보여드리고 있어요." error={list.error} onRetry={reload} retrying={busy} compact />}
                {!list.error && storesError && <DataState state="error" title="가게 목록을 불러오지 못했어요." error={storesError} onRetry={refetchStores} retrying={storesLoading} compact />}
            </>}>
                {list.loading ? <ReservationCardSkeleton count={5} /> :
                    list.reservations.length === 0 ? <DataState state="empty" kind="reservation"
                        title={status === 'NO_SHOW' ? '확정된 노쇼 내역이 없어요.' : '방문 확인이 필요한 예약이 없어요.'} /> :
                        <div className={view === 'cards' ? 'reserve-reservation-card-grid' : undefined}>{list.reservations.map((reservation, index) => <div key={reservation.id}
                            style={{ borderBottom: view === 'list' && index < list.reservations.length - 1 ? `1px solid ${colors.border.light}` : undefined }}>
                            <ReservationCard reservation={reservation} view={view} actionLoading={list.actionLoading}
                                onApprove={list.approve} onReject={list.reject} onComplete={list.complete} onNoShow={list.noShow}
                                onUndoNoShow={list.undoNoShow} onStoreCancel={list.storeCancel} />
                        </div>)}</div>}
            </AnimatedListingContent>}
        {list.hasData && !blocking && list.total > DEFAULT_PAGE_SIZE && <nav aria-label="노쇼 내역 페이지" className="reserve-listing-pagination">
            <Pagination current={page} pageSize={DEFAULT_PAGE_SIZE} total={list.total} showSizeChanger={false}
                showLessItems={isMobile} size={isMobile ? 'small' : 'default'} align="end" disabled={busy}
                onChange={value => change({ noShowPage: value }, false)} />
        </nav>}
    </div>;
}
