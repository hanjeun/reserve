/**
 * useStoreList — 가게 목록 조회 훅 (서버사이드 offset 무한스크롤)
 *
 * 이전: 백엔드에서 전체 목록을 한 번에 받아 클라이언트에서 slice → "가짜 무한스크롤"
 * 현재: useInfiniteQuery + ?page=N&size=12 → 서버가 실제로 나눠서 줌
 *
 * [offset vs cursor 선택 이유]
 * - 정렬 기준이 rating / reviewCount (가변값) → cursor 키가 불안정
 * - RESERVE 규모에서 offset 성능 문제 없음
 * - 동시에 새 가게가 추가되는 빈도가 낮아 데이터 shift 문제도 미미
 */
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import storeService from '../services/storeService';
import { storeKeys } from './queryKeys';
import { rememberImageHints } from '../utils/imageHintCache';

const PAGE_SIZE = 12;

const useStoreList = () => {
    const [urlSearchParams, setUrlSearchParams] = useSearchParams();

    const keyword = urlSearchParams.get('keyword') || '';
    const sort    = urlSearchParams.get('sort')    || 'rating';
    const lat     = urlSearchParams.get('lat');
    const lng     = urlSearchParams.get('lng');

    const {
        data,
        isLoading,
        isFetching,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        error,
    } = useInfiniteQuery({
        queryKey: storeKeys.list({ keyword, sort, lat, lng }),
        queryFn: ({ pageParam = 0 }) =>
            storeService.getStores({
                keyword, sort, page: pageParam, size: PAGE_SIZE,
                ...(sort === 'distance' && lat && lng ? { lat, lng } : {}),
            }),
        // Spring Boot 3.5부터 Page 응답이 { content, page: { number, size, totalElements, totalPages } } 형태로
        // 바뀜(이전 버전은 { content, number, totalPages, totalElements, last } 평탄 형태였음 —
        // 이 변경을 몰라서 아래 둘 다 top-level로 읽다가 totalElements=0/hasNextPage가 항상 true로 조용히 망가져 있었음(2026-07 버그 수정).
        getNextPageParam: (lastPage) => {
            const pageInfo = lastPage?.page ?? lastPage; // 구버전 평탄 형태도 폴백으로 계속 허용
            const number = pageInfo?.number ?? 0;
            const totalPages = pageInfo?.totalPages ?? 1;
            return number + 1 < totalPages ? number + 1 : undefined;
        },
        staleTime: 1000 * 60 * 3,
        // 검색어/정렬 바꿀 때 직전 결과(실제 가게 카드, 이미지 비율 포함)가 새 데이터 도착까지 그대로 남아있어서
        // 전체 그리드가 스켈레톤으로 돌아가지 않음
        placeholderData: keepPreviousData,
    });

    // 모든 페이지의 content를 단일 배열로 평탄화
    const stores        = data?.pages?.flatMap(page => page?.content ?? []) ?? [];

    // 가게 목록을 받을 때마다 각 가게의 커버 이미지 "비율"만 따로 적어둔다 (2026-07 추가).
    // 상세 페이지 스켈레톤이 커버 자리를 실제 비율로 그려야 이미지 도착 시 레이아웃이 안 튀는데,
    // 그동안은 TanStack Query의 목록 캐시에서만 비율을 찾았다. 그런데 그 캐시가 없는 경우가
    // 흔해서(상세 URL 직접 진입 / 상세에서 새로고침 / 홈·찜 목록에서 클릭 / gcTime 만료)
    // "어떤 땐 비율이 딱 맞고 어떤 땐 큰 정사각형이 뜨는" 들쭉날쭉한 증상이 있었다.
    // 비율은 몇 바이트짜리 메타데이터라 따로 오래 들고 있어도 안전하다 — utils/imageHintCache.js 참고.
    rememberImageHints(stores);
    const totalElements = data?.pages?.[0]?.page?.totalElements ?? data?.pages?.[0]?.totalElements ?? 0;

    // 검색·정렬 파라미터 변경 (queryKey 변경 → TanStack Query가 자동으로 첫 페이지부터 재조회)
    const setSearchParams = useCallback((newParams) => {
        setUrlSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(newParams).forEach(([key, value]) => {
                if (value === '' || value == null) next.delete(key);
                else next.set(key, value);
            });
            return next;
        });
    }, [setUrlSearchParams]);

    // 검색어/정렬을 바꾸면(placeholderData: keepPreviousData 덕에) 직전 목록이 그대로 남아있다가
    // 새 데이터가 도착하는 순간 스켈레톤 없이 갑자기 휙 바뀌어서, 그 사이엔 아무 피드백도 없었음
    // (2026-07 버그 수정) — isLoading(최초 로딩)도 아니고 isFetchingNextPage(무한스크롤 다음 페이지,
    // 이건 이미 하단 스피너로 표시 중)도 아닌 "그 외의 백그라운드 재조회"만 별도로 노출해서,
    // StoreList.jsx가 이 구간에 옅은 오버레이 스피너를 보여줄 수 있게 함.
    const isRefetching = isFetching && !isLoading && !isFetchingNextPage;

    return {
        stores,
        totalElements,
        loading:      isLoading,
        refetching:   isRefetching,
        fetchingNext: isFetchingNextPage,
        hasNextPage:  hasNextPage ?? false,
        fetchNextPage,
        error:        error?.message || null,
        searchParams: { keyword, sort, lat, lng },
        setSearchParams,
    };
};

export default useStoreList;
