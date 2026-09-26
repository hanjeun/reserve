import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import storeService from '../services/storeService';
import useMessage from './useMessage';
import { storeKeys } from './queryKeys';
import { invalidateStoreData } from './invalidateAfterWrite';

const useMyStores = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();

    const { data, isLoading, error } = useQuery({
        queryKey: storeKeys.my(),
        queryFn:  () => storeService.getMyStores(),
        select:   (d) => d || [],
        staleTime: 1000 * 60 * 5,
    });

    const deleteMutation = useMutation({
        mutationFn: (storeId) => storeService.deleteStore(storeId),
        // 낙관적 업데이트 — 실패 시 원복
        onMutate: async (storeId) => {
            await queryClient.cancelQueries({ queryKey: storeKeys.my() });
            const prev = queryClient.getQueryData(storeKeys.my());
            queryClient.setQueryData(storeKeys.my(), (old) =>
                (old || []).filter(s => s.id !== storeId)
            );
            return { prev };
        },
        onSuccess: () => message.success('가게 영업이 종료되었습니다.'),
        onError: (err, _, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(storeKeys.my(), ctx.prev);
            message.error(err?.message || '영업 종료에 실패했습니다.');
        },
        // 내 가게 목록만 낙관 갱신하면 공개 목록·상세와 즐겨찾기에 닫은 가게가 남고,
        // 서버가 함께 정리한 광고 상태도 늦게 보인다.
        // 성공·실패와 관계없이 서버 값으로 다시 맞춘다.
        onSettled: () => invalidateStoreData(queryClient),
    });

    return {
        stores:      data || [],
        loading:     isLoading,
        error:       error?.message || null,
        deleteStore: (id) => deleteMutation.mutateAsync(id),
        refetch:     () => queryClient.invalidateQueries({ queryKey: storeKeys.my() }),
    };
};

export default useMyStores;
