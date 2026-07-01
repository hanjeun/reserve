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
import { useInfiniteQuery } from '@tanstack/react-query';
import storeService from '../services/storeService';
import { storeKeys } from './queryKeys';

const PAGE_SIZE = 12;

const useStoreList = () => {
    const [urlSearchParams, setUrlSearchParams] = useSearchParams();

    const keyword = urlSearchParams.get('keyword') || '';
    const sort    = urlSearchParams.get('sort')    || 'rating';

    const {
        data,
        isLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
        error,
    } = useInfiniteQuery({
        queryKey: storeKeys.list({ keyword, sort }),
        queryFn: ({ pageParam = 0 }) =>
            storeService.getStores({ keyword, sort, page: pageParam, size: PAGE_SIZE }),
        // Spring Page 응답: { content, number, totalPages, totalElements, last }
        getNextPageParam: (lastPage) =>
            lastPage?.last ? undefined : (lastPage?.number ?? 0) + 1,
        staleTime: 1000 * 60 * 3,
    });

    // 모든 페이지의 content를 단일 배열로 평탄화
    const stores        = data?.pages?.flatMap(page => page?.content ?? []) ?? [];
    const totalElements = data?.pages?.[0]?.totalElements ?? 0;

    // 검색·정렬 파라미터 변경 (queryKey 변경 → React Query가 자동으로 첫 페이지부터 재조회)
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

    return {
        stores,
        totalElements,
        loading:      isLoading,
        fetchingNext: isFetchingNextPage,
        hasNextPage:  hasNextPage ?? false,
        fetchNextPage,
        error:        error?.message || null,
        searchParams: { keyword, sort },
        setSearchParams,
    };
};

export default useStoreList;
