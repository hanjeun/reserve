/**
 * 공개 가게 목록 — URL은 1부터, 서버 offset 페이지는 0부터 시작한다.
 * 한 번에 12건만 표시하며 검색·필터 변경은 첫 페이지로 돌아간다.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import storeService from '../services/storeService';
import { storeKeys } from './queryKeys';
import { rememberImageHints } from '../utils/imageHintCache';
import { hasDistanceCoordinates } from '../utils/distanceSort';
import { STORE_LIST_PAGE_SIZE } from '../constants/storeListPageSize';
import { normalizeListQueryParams } from '../utils/listQueryParams';
import useDiscoveryRegion from './useDiscoveryRegion';

export { STORE_LIST_PAGE_SIZE };
const FILTER_KEYS = new Set(['keyword', 'domain', 'region', 'sort', 'lat', 'lng']);

const readPage = (value) => {
    if (!/^[1-9]\d*$/.test(value ?? '')) return 1;
    const number = Number(value);
    return Number.isSafeInteger(number) && number <= 2147483647 ? number : 1;
};

const readCount = (value, fallback) =>
    Number.isSafeInteger(value) && value >= 0 ? value : fallback;

const useStoreList = () => {
    const [urlSearchParams, setUrlSearchParams] = useSearchParams();
    const normalizedParams = normalizeListQueryParams('/stores', urlSearchParams);

    const keyword = normalizedParams.get('keyword') || '';
    const sort    = normalizedParams.get('sort')    || 'recommended';
    const lat     = normalizedParams.get('lat');
    const lng     = normalizedParams.get('lng');
    const domain  = normalizedParams.get('domain') || '';
    const [region, rememberRegion] = useDiscoveryRegion(urlSearchParams);
    const rawPage = urlSearchParams.get('page');
    const page = readPage(rawPage);

    const {
        data,
        isLoading,
        isFetching,
        isPlaceholderData,
        isSuccess,
        error,
        refetch,
    } = useQuery({
        // 페이지·크기도 키에 포함한다. 늦게 도착한 이전 페이지 응답은 현재 목록을 덮지 않는다.
        queryKey: storeKeys.list({ keyword, sort, lat, lng, domain, region, page: page - 1, size: STORE_LIST_PAGE_SIZE }),
        queryFn: () =>
            storeService.getStores({
                keyword, sort, page: page - 1, size: STORE_LIST_PAGE_SIZE,
                ...(sort === 'distance' && hasDistanceCoordinates(lat, lng) ? { lat, lng } : {}),
                ...(domain ? { domain } : {}),
                ...(region ? { region } : {}),
            }),
        staleTime: 1000 * 60 * 3,
        // 이동 중 건수·페이지 컨트롤은 유지하고 화면은 기존 스켈레톤으로 진행 상태를 표시한다.
        placeholderData: keepPreviousData,
    });

    const stores = useMemo(() => Array.isArray(data?.content) ? data.content : [], [data]);
    // Spring Boot 3.5의 page 하위 메타와 이전 평탄 응답을 모두 허용한다.
    const totalElements = readCount(data?.page?.totalElements ?? data?.totalElements, stores.length);
    const totalPages = readCount(data?.page?.totalPages ?? data?.totalPages, Math.ceil(totalElements / STORE_LIST_PAGE_SIZE));
    const lastPage = Math.max(1, totalPages);
    const pageOutOfRange = isSuccess && !isPlaceholderData && !error && page > lastPage;

    // 가게 목록을 받을 때마다 각 가게의 커버 이미지 "비율"만 따로 적어둔다 (2026-07 추가).
    // 상세 페이지 스켈레톤이 커버 자리를 실제 비율로 그려야 이미지 도착 시 레이아웃이 안 튀는데,
    // 그동안은 TanStack Query의 목록 캐시에서만 비율을 찾았다. 그런데 그 캐시가 없는 경우가
    // 흔해서(상세 URL 직접 진입 / 상세에서 새로고침 / 홈·찜 목록에서 클릭 / gcTime 만료)
    // "어떤 땐 비율이 딱 맞고 어떤 땐 큰 정사각형이 뜨는" 들쭉날쭉한 증상이 있었다.
    // 비율은 몇 바이트짜리 메타데이터라 따로 오래 들고 있어도 안전하다 — utils/imageHintCache.js 참고.
    useEffect(() => {
        rememberImageHints(stores);
    }, [stores]);

    useEffect(() => {
        // 잘못된 공유 URL·삭제로 줄어든 결과를 복구한다. 이전 결과의 메타로 보정하지 않는다.
        if (!pageOutOfRange && (rawPage == null || rawPage === String(page))) return;
        setUrlSearchParams(prev => {
            const next = new URLSearchParams(prev);
            const corrected = pageOutOfRange ? lastPage : page;
            if (corrected === 1) next.delete('page');
            else next.set('page', String(corrected));
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
                if (value === '' || value == null) next.delete(key);
                else next.set(key, String(value));
                if (key !== 'region' && FILTER_KEYS.has(key) && next.get(key) !== prev.get(key)) filtersChanged = true;
            });
            if (filtersChanged || readPage(next.get('page')) === 1) next.delete('page');
            return next;
        });
    }, [rememberRegion, region, setUrlSearchParams]);

    const setPage = useCallback((nextPage) => {
        const bounded = Math.min(readPage(String(nextPage)), lastPage);
        setSearchParams({ page: bounded === 1 ? null : bounded });
    }, [lastPage, setSearchParams]);

    return {
        stores,
        totalElements,
        totalPages,
        page,
        pageSize: STORE_LIST_PAGE_SIZE,
        loading: isLoading || pageOutOfRange || isPlaceholderData,
        initialLoading: isLoading,
        refetching: isFetching && !isLoading,
        error:        error?.message || null,
        refetch,
        setPage,
        searchParams: { keyword, sort, lat, lng, domain, region },
        setSearchParams,
    };
};

export default useStoreList;
