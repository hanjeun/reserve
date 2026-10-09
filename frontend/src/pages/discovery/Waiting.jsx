import { PageTitle, PageDescription } from '../../components/common/PageTypography';
import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Pagination } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { DataState, FilterToolbar, PageContainer, StoreCardSkeleton } from '../../components/common';
import StoreCard from '../../components/store/StoreCard';
import StoreListRow from '../../components/store/StoreListRow';
import StoreListRowSkeleton from '../../components/store/StoreListRowSkeleton';
import LoadingStatus from '../../components/common/LoadingStatus';
import RegionSheet from '../../components/discovery/RegionSheet';
import WaitingStoreToolbar from '../../components/waiting/WaitingStoreToolbar';
import { WaitingStoresSkeleton } from '../../components/waiting/WaitingSkeleton';
import { WAITING_STORE_STATUSES, WAITING_STORE_SORTS } from '../../components/waiting/waitingDirectoryFilters';
import useDiscoveryRegion from '../../hooks/useDiscoveryRegion';
import useViewModeParam from '../../hooks/useViewModeParam';
import useDebounce from '../../hooks/useDebounce';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import useReducedMotion from '../../hooks/useReducedMotion';
import waitingService from '../../services/waitingService';

const PAGE_SIZE = 12;
export default function Waiting() {
    useDocumentTitle('웨이팅');
    const isMobile = useWindowWidth() < 576;
    const reducedMotion = useReducedMotion();
    const [params, setParams] = useSearchParams();
    const [regionOpen, setRegionOpen] = useState(false);
    const [region, rememberRegion] = useDiscoveryRegion(params);
    const [settled, setSettled] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [view, setView] = useViewModeParam(params, setParams, 'cards');
    const keyword = params.get('keyword') || '';
    const status = WAITING_STORE_STATUSES.some(option => option.value === params.get('status')) ? params.get('status') : 'ALL';
    const sort = WAITING_STORE_SORTS.some(option => option.value === params.get('sort')) ? params.get('sort') : 'recommended';
    const term = useDebounce(keyword, 300);
    const rawPage = Number(params.get('page') || 1);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100_000 ? rawPage - 1 : 0;
    const result = useQuery({ queryKey: ['waiting-stores', term, region, status, sort, page],
        queryFn: ({ signal }) => waitingService.getStores({ keyword: term, region, status, sort, page, size: PAGE_SIZE }, signal),
        placeholderData: keepPreviousData, retry: false, staleTime: 30_000 });
    if (!settled && (result.isSuccess || result.isError)) setSettled(true);
    const change = (key, value) => {
        if (key === 'region' && !rememberRegion(value)) return;
        setParams(current => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value); else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
        });
    };
    const reload = async () => {
        setRefreshing(true);
        try { await result.refetch(); } finally { setRefreshing(false); }
    };
    const stores = result.data?.content || [];
    const total = result.data?.page?.totalElements ?? result.data?.totalElements ?? 0;
    useEffect(() => {
        const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
        if (!result.isSuccess || result.isPlaceholderData || page <= lastPage) return;
        setParams(current => {
            const next = new URLSearchParams(current);
            if (lastPage) next.set('page', String(lastPage + 1)); else next.delete('page');
            return next;
        }, { replace: true });
    }, [total, page, result.isSuccess, result.isPlaceholderData, setParams]);
    const Item = view === 'cards' ? StoreCard : StoreListRow;
    return <PageContainer size="xl" paddingTop="32px">
        <div className="reserve-waiting-heading"><PageTitle level={1}>웨이팅</PageTitle><PageDescription>접수 가능한 가게를 찾고, 내 예약에서 대기 현황을 확인해요.</PageDescription></div>
        {!settled ? <WaitingStoresSkeleton view={view} status={status} sort={sort} /> : <>
        <WaitingStoreToolbar view={view} onViewChange={setView} count={total} region={region} regionOpen={regionOpen}
            onRegionOpen={() => setRegionOpen(true)} status={status} onStatusChange={value => change('status', value)}
            sort={sort} onSortChange={value => change('sort', value)} disabled={result.isFetching} />
        <FilterToolbar search={{ value: keyword, onChange: event => change('keyword', event.target.value),
            placeholder: '웨이팅 가게 검색' }} onReload={reload} loading={refreshing} />
        {result.isLoading || result.isPlaceholderData ? <LoadingStatus aria-label="웨이팅 가게를 불러오는 중" aria-busy="true"
            className={view === 'cards' ? 'rsv-store-grid' : 'reserve-store-list-rows'}>
            {view === 'cards' ? <StoreCardSkeleton count={4} /> : <StoreListRowSkeleton count={4} />}
        </LoadingStatus> : result.error ? <DataState state="error" subject="웨이팅 가게" error={result.error} onRetry={reload} retrying={result.isFetching} />
                : stores.length ? <div className={view === 'cards' ? 'rsv-store-grid' : 'reserve-store-list-rows'}>
                    {stores.map(store => <Item key={store.id} store={store} />)}
                </div> : <DataState state="empty" kind="waiting" title={term ? '검색에 맞는 웨이팅 가게가 없어요.' : '접수 가능한 가게가 없어요.'}
                    description="가게가 웨이팅 접수를 켜면 여기에 표시돼요." />}
        {!result.error && total > PAGE_SIZE && <nav className="reserve-waiting-pagination" aria-label="웨이팅 가게 목록 페이지">
            <Pagination current={page + 1} total={total} pageSize={PAGE_SIZE} onChange={next => {
                change('page', String(next));
                window.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
            }} showSizeChanger={false} showLessItems={isMobile} size={isMobile ? 'small' : 'default'} disabled={result.isFetching} />
        </nav>}
        </>}
        <RegionSheet open={regionOpen} value={region} onClose={() => setRegionOpen(false)} onApply={value => {
            change('region', value); setRegionOpen(false);
        }} />
    </PageContainer>;
}
