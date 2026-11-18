/**
 * 공개 가게 목록 — URL은 1부터, 서버 offset 페이지는 0부터 시작한다.
 * 한 번에 12건만 표시하며 검색·필터 변경은 첫 페이지로 돌아간다.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import storeService from '../services/storeService';
import { storeKeys } from './queryKeys';
import { rememberImageHints } from '../utils/imageHintCache';
import { hasDistanceCoordinates } from '../utils/distanceSort';
import { STORE_LIST_PAGE_SIZE } from '../constants/storeListPageSize';
import { normalizeListQueryParams } from '../utils/listQueryParams';
import useDiscoveryRegion from './useDiscoveryRegion';
import { isListQueryLoading, isReadAccessDenied, queryErrorStatus } from './liveUpdateQueries';
import { readQuerySelection, writeQuerySelection } from '../utils/querySelection';
import { keepListForSort } from './listSortPlaceholder';

export { STORE_LIST_PAGE_SIZE };
const FILTER_KEYS = new Set(['keyword', 'domain', 'region', 'sort', 'lat', 'lng']);

const readPage = (value) => {
    if (!/^[1-9]\d*$/.test(value ?? '')) return 1;
    const number = Number(value);
    return Number.isSafeInteger(number) && number <= 2147483647 ? number : 1;
};

const readCount = (value, fallback) =>
    Number.isSafeInteger(value) && value >= 0 ? value : fallback;

const orderKey = ({ sort, lat, lng }) => JSON.stringify(sort === 'distance' ? [sort, lat, lng] : [sort]);

const useStoreList = () => {
    const [urlSearchParams, setUrlSearchParams] = useSearchParams();
    const normalizedParams = normalizeListQueryParams('/stores', urlSearchParams);

    const keyword = (normalizedParams.get('keyword') || '').trim();
    const sort    = normalizedParams.get('sort')    || 'recommended';
    const lat     = normalizedParams.get('lat');
    const lng     = normalizedParams.get('lng');
    const domain  = readQuerySelection('domain', normalizedParams.get('domain')) || '';
    const [region, rememberRegion] = useDiscoveryRegion(urlSearchParams);
    const rawPage = urlSearchParams.get('page');
    const page = readPage(rawPage);
    const order = orderKey({ sort, lat, lng });

    const {
        data,
        isLoading,
        isPending,
        isFetching,
        isPlaceholderData,
        isSuccess,
        error,
        refetch,
    } = useQuery({
        // 페이지·크기도 키에 포함한다. 늦게 도착한 이전 페이지 응답은 현재 목록을 덮지 않는다.
        queryKey: storeKeys.list({ keyword, sort, lat, lng, domain, region, page: page - 1, size: STORE_LIST_PAGE_SIZE }),
        refetchOnReconnect: false,
        queryFn: ({ signal }) =>
            storeService.getStores({
                keyword, sort, page: page - 1, size: STORE_LIST_PAGE_SIZE,
                ...(sort === 'distance' && hasDistanceCoordinates(lat, lng) ? { lat, lng } : {}),
                ...(domain ? { domain } : {}),
                ...(region ? { region } : {}),
            }, signal),
        staleTime: 1000 * 60 * 3,
        placeholderData: (previous, query) => {
            if (isReadAccessDenied(query?.state.error)) return undefined;
            const source = query?.queryKey[2];
            // 검색 범위가 같은 정렬 변경만 이전 결과를 그대로 보여준다.
            if (source?.keyword === keyword && source.domain === domain && source.region === region) {
                return keepListForSort(previous, orderKey(source), order, source.page) ?? previous;
            }
            return previous;
        },
    });

    const accessDenied = [401, 403].includes(queryErrorStatus(error));
    const hasData = data !== undefined && !accessDenied;
    const previousOrder = isPlaceholderData ? data?.previousOrder : undefined;
    const sorting = Boolean(previousOrder);
    const stores = useMemo(() => !accessDenied && Array.isArray(data?.content) ? data.content : [], [data, accessDenied]);
    // 중첩된 page 메타와 기존 평탄 응답을 모두 허용한다.
    const totalElements = hasData ? readCount(data?.page?.totalElements ?? data?.totalElements, stores.length) : 0;
    const totalPages = hasData ? readCount(data?.page?.totalPages ?? data?.totalPages, Math.ceil(totalElements / STORE_LIST_PAGE_SIZE)) : 0;
    const lastPage = Math.max(1, totalPages);
    const pageOutOfRange = isSuccess && !isPlaceholderData && !error && page > lastPage;

    // 목록 캐시가 없어도 상세 골격이 실제 사진 비율을 유지하도록 크기 힌트를 별도 보관한다.
    useEffect(() => {
        rememberImageHints(stores);
    }, [stores]);

    useEffect(() => {
        // 잘못된 공유 URL·삭제로 줄어든 결과를 복구한다. 이전 결과의 메타로 보정하지 않는다.
        if (!pageOutOfRange && (rawPage == null || rawPage === String(page))) return;
        setUrlSearchParams(prev => {
            const next = new URLSearchParams(prev);
            const corrected = pageOutOfRange ? lastPage : page;
            next.set('page', String(corrected));
            return next;
        }, { replace: true });
    }, [pageOutOfRange, rawPage, page, lastPage, setUrlSearchParams]);

    // 필터와 페이지를 한 번의 URL 갱신으로 바꿔 검색어 유실을 막는다.
    const setSearchParams = useCallback((newParams) => {
        const changesRegion = Object.hasOwn(newParams, 'region');
        const nextRegion = changesRegion ? String(newParams.region ?? '') : region;
        if (changesRegion && !rememberRegion(nextRegion)) return;
        setUrlSearchParams(prev => {
            const next = new URLSearchParams(prev);
            // 복원한 지역은 URL에 없을 수 있다. 전체 선택도 실제 조건 변경으로 판단한다.
            let filtersChanged = changesRegion && nextRegion !== region;
            Object.entries(newParams).forEach(([key, value]) => {
                if (value == null || value === '' && key !== 'domain' && key !== 'region') next.delete(key);
                else next.set(key, String(writeQuerySelection(key, value)));
                if (key !== 'region' && FILTER_KEYS.has(key) && next.get(key) !== prev.get(key)) filtersChanged = true;
            });
            if (filtersChanged || readPage(next.get('page')) === 1) next.set('page', '1');
            return next;
        });
    }, [rememberRegion, region, setUrlSearchParams]);

    const setPage = useCallback((nextPage) => {
        const bounded = Math.min(readPage(String(nextPage)), lastPage);
        setSearchParams({ page: bounded });
    }, [lastPage, setSearchParams]);

    return {
        stores,
        totalElements,
        totalPages,
        page,
        resultPage: sorting ? previousOrder.page + 1 : page,
        resultOrder: previousOrder?.sort ?? order,
        sorting,
        pageSize: STORE_LIST_PAGE_SIZE,
        loading: isListQueryLoading({ isPending, isPlaceholderData: isPlaceholderData && !sorting }) || pageOutOfRange,
        initialLoading: isLoading,
        refetching: isFetching && !isLoading,
        hasData,
        error:        error ?? null,
        refetch,
        setPage,
        searchParams: { keyword, sort, lat, lng, domain, region },
        setSearchParams,
    };
};

export default useStoreList;
