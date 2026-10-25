import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import storeService from '../services/storeService';
import useMessage from './useMessage';
import { storeKeys } from './queryKeys';
import { invalidateStoreData } from './invalidateAfterWrite';
import { queryErrorStatus } from './liveUpdateQueries';

const useMyStores = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: storeKeys.my(),
        queryFn:  () => storeService.getMyStores(),
        select:   (d) => (Array.isArray(d) ? d : []),
        staleTime: 1000 * 60 * 5,
    });

    const deleteMutation = useMutation({
        mutationFn: (storeId) => storeService.deleteStore(storeId),
        // 낙관적 변경은 오류 시 이전 값으로 복구한다.
        onMutate: async (storeId) => {
            await queryClient.cancelQueries({ queryKey: storeKeys.my() });
            const prev = queryClient.getQueryData(storeKeys.my());
            queryClient.setQueryData(storeKeys.my(), (old) =>
                (old || []).filter(s => s.id !== storeId)
            );
            return { prev };
        },
        onSuccess: () => message.success('가게 영업이 종료됐어요.'),
        onError: (err, _, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(storeKeys.my(), ctx.prev);
            message.error(err?.message || '영업 종료에 실패했어요.');
        },

        // 요청 결과와 무관하게 서버 값으로 다시 맞춘다.
        onSettled: () => invalidateStoreData(queryClient),
    });

    const accessDenied = [401, 403].includes(queryErrorStatus(error));
    return {
        stores:      accessDenied ? [] : data || [],
        loading:     isLoading,
        refetching:  isFetching && !isLoading,
        hasData:     data !== undefined && !accessDenied,
        error:       error ?? null,
        deleteStore: (id) => deleteMutation.mutateAsync(id),
        refetch:     () => queryClient.invalidateQueries({ queryKey: storeKeys.my() }),
    };
};

export default useMyStores;
