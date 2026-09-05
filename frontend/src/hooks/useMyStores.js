import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import storeService from '../services/storeService';
import useMessage from './useMessage';
import { storeKeys } from './queryKeys';

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
