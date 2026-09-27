import { useEffect } from 'react';
import { Pagination } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import DataState from '../../components/common/DataState';
import FilterMenu from '../../components/common/FilterMenu';
import { StoreCardSkeleton } from '../../components/common/Skeletons';
import StoreCard from '../../components/store/StoreCard';
import { SERVICE_DOMAIN_FILTER_OPTIONS } from '../../constants/categories';
import { storeKeys } from '../../hooks/queryKeys';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import storeService from '../../services/storeService';

export const BENEFIT_STORE_PAGE_SIZE = 12;
// These values are supported by StoreService.normalizeSort; distance needs a location.
const SORT_OPTIONS = [
    { value: 'rating', label: '별점순' },
    { value: 'reviews', label: '리뷰순' },
    { value: 'recent', label: '최신순' },
];
const MAX_PAGE = Math.floor(2147483647 / BENEFIT_STORE_PAGE_SIZE) + 1;
const readPage = value => {
    if (!/^[1-9]\d*$/.test(value ?? '')) return 1;
    const number = Number(value);
    return Number.isSafeInteger(number) && number <= MAX_PAGE ? number : 1;
};
const readCount = (value, fallback) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;

export default function BenefitStoreDiscovery() {
    const [params, setParams] = useSearchParams();
    const isMobile = useWindowWidth() < 576;
    const rawDomain = params.get('domain');
    const rawSort = params.get('sort');
    const rawPage = params.get('storePage');
    const domain = SERVICE_DOMAIN_FILTER_OPTIONS.some(option => option.value === rawDomain) ? rawDomain : '';
    const sort = SORT_OPTIONS.some(option => option.value === rawSort) ? rawSort : 'rating';
    const page = readPage(rawPage);
    const queryParams = { sort, page: page - 1, size: BENEFIT_STORE_PAGE_SIZE, ...(domain ? { domain } : {}) };
    const { data, isPending, isFetching, isError, isSuccess, isPlaceholderData, error, refetch } = useQuery({
        queryKey: storeKeys.list(queryParams),
        queryFn: () => storeService.getStores(queryParams),
        staleTime: 60000,
        placeholderData: keepPreviousData,
    });
    const stores = Array.isArray(data?.content) ? data.content : [];
    const total = readCount(data?.page?.totalElements ?? data?.totalElements, stores.length);
    const totalPages = readCount(data?.page?.totalPages ?? data?.totalPages, Math.ceil(total / BENEFIT_STORE_PAGE_SIZE));
    const lastPage = Math.max(1, totalPages);
    const pageOutOfRange = isSuccess && !isFetching && !isPlaceholderData && !isError && page > lastPage;
    const loading = isPending || isFetching || pageOutOfRange;

    useEffect(() => {
        // Never use placeholder counts or an unsuccessful response to repair a shared URL.
        if (!isSuccess || isFetching || isPlaceholderData || isError) return;
        const correctedPage = Math.min(page, lastPage);
        const invalidPage = rawPage != null && (rawPage !== String(correctedPage) || correctedPage === 1);
        const invalidDomain = rawDomain != null && rawDomain !== domain;
        const invalidSort = rawSort != null && rawSort !== sort;
        if (!invalidPage && !invalidDomain && !invalidSort) return;
        setParams(previous => {
            if (previous.get('storePage') !== rawPage || previous.get('domain') !== rawDomain || previous.get('sort') !== rawSort) return previous;
            const next = new URLSearchParams(previous);
            if (invalidPage) {
                if (correctedPage === 1) next.delete('storePage');
                else next.set('storePage', String(correctedPage));
            }
            if (invalidDomain) next.delete('domain');
            if (invalidSort) next.delete('sort');
            return next;
        }, { replace: true });
    }, [isSuccess, isFetching, isPlaceholderData, isError, page, lastPage, rawPage, rawDomain, rawSort, domain, sort, setParams]);

    const changeFilter = (key, value) => {
        setParams(previous => {
            const next = new URLSearchParams(previous);
            if (value) next.set(key, value);
            else next.delete(key);
            next.delete('storePage');
            return next;
        });
    };
    const changePage = value => {
        const nextPage = Math.min(readPage(String(value)), lastPage);
        setParams(previous => {
            const next = new URLSearchParams(previous);
            if (nextPage === 1) next.delete('storePage');
            else next.set('storePage', String(nextPage));
            return next;
        });
    };

    return (
        <section id="benefit-stores" className="reserve-benefit-store-discovery" aria-labelledby="benefit-stores-title">
            <header className="reserve-benefit-store-heading">
                <h2 id="benefit-stores-title">가게도 함께 둘러보세요</h2>
                <p>아래는 서비스별 전체 가게예요. 혜택 제공 여부는 각 가게의 소식에서 확인해 주세요.</p>
            </header>
            <div className="reserve-benefit-store-toolbar">
                <span className="reserve-benefit-store-count">{loading ? '가게를 불러오는 중' : isError ? '가게 조회 실패' : `총 ${total.toLocaleString()}개 가게`}</span>
                <div className="reserve-benefit-store-controls">
                    <FilterMenu appearance="plain" aria-label="서비스 분야 선택" value={domain} options={SERVICE_DOMAIN_FILTER_OPTIONS} onChange={value => changeFilter('domain', value)} disabled={loading} />
                    <FilterMenu appearance="plain" aria-label="가게 정렬 선택" value={sort} options={SORT_OPTIONS} onChange={value => changeFilter('sort', value)} disabled={loading} />
                </div>
            </div>
            {loading ? (
                <div className="reserve-benefit-store-grid" role="status" aria-label="가게 목록을 불러오는 중" aria-busy="true"><StoreCardSkeleton count={BENEFIT_STORE_PAGE_SIZE} /></div>
            ) : isError ? (
                <DataState state="error" kind="store" subject="가게 목록" error={error}
                    title="가게 목록을 불러오지 못했어요." onRetry={refetch} retrying={isFetching} />
            ) : stores.length === 0 ? (
                <DataState state="empty" kind="store" title="선택한 서비스 분야에 등록된 가게가 없어요." />
            ) : (
                <div className="reserve-benefit-store-grid">{stores.map(store => <StoreCard key={store.id} store={store} />)}</div>
            )}
            {!isError && total > BENEFIT_STORE_PAGE_SIZE && (
                <nav className="reserve-benefit-store-pagination" aria-label="함께 둘러볼 가게 페이지">
                    <Pagination current={page} pageSize={BENEFIT_STORE_PAGE_SIZE} total={total} showSizeChanger={false} showLessItems={isMobile} size={isMobile ? 'small' : 'default'} disabled={loading} onChange={changePage} />
                </nav>
            )}
        </section>
    );
}
