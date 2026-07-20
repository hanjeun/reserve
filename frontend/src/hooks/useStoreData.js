import { useQuery } from '@tanstack/react-query';
import storeService from '../services/storeService';
import { storeKeys } from './queryKeys';

/**
 * 가게 데이터 로딩 훅
 * @param {string|number} storeId
 * @param {object} options
 * @param {boolean} options.forEdit true면 인증된 /edit 엔드포인트 사용 (소유자만 접근 가능)
 *
 * 2026-07-10: TanStack Query로 전환 — 이전엔 useState+useEffect라 캐싱이 전혀 없어서
 * 목록에서 봤던 가게를 다시 눌러 들어가도 항상 새로 요청 + 스켈레톤부터 다시 보여줬음.
 * 이제 같은 가게를 짧은 시간(staleTime) 안에 다시 열면 캐시에서 즉시 보여줌.
 */
const useStoreData = (storeId, { forEdit = false } = {}) => {
    const { data: store, isLoading: loading, error, refetch } = useQuery({
        queryKey: forEdit ? [...storeKeys.detail(storeId), 'edit'] : storeKeys.detail(storeId),
        queryFn: () => (forEdit ? storeService.getStoreForEdit(storeId) : storeService.getStoreById(storeId)),
        enabled: !!storeId,
    });

    return { store: store ?? null, loading, error: error?.message || null, refetch };
};

export default useStoreData;
