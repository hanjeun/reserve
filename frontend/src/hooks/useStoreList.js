// URL searchParams와 동기화 → 공유/북마크 가능
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import storeService from '../services/storeService';
import { storeKeys } from './queryKeys';

const useStoreList = () => {
    const [urlSearchParams, setUrlSearchParams] = useSearchParams();

    const searchParams = {
        keyword: urlSearchParams.get('keyword') || '',
        sort:    urlSearchParams.get('sort')    || 'rating',
    };

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: storeKeys.list(searchParams),  // params 바뀌면 새 쿼리
        queryFn:  () => storeService.getStores(searchParams),
        select:   (data) => data || [],
        staleTime: 1000 * 60 * 5,  // 5분
    });

    const updateSearch = useCallback((newParams) => {
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
        stores:          data || [],
        loading:         isLoading,   // 최초 로드 (캐시 없음)
        fetching:        isFetching,  // 재조회 중 (검색어 변경 등)
        error:           error?.message || null,
        searchParams,
        setSearchParams: updateSearch,
    };
};

export default useStoreList;
