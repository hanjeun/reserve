import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import reservationService from '../services/reservationService';
import { handleApiError } from '../utils/errorHandler';
import useMessage from './useMessage';
import { reservationKeys } from './queryKeys';

const useReservations = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();

    const { data, isLoading, refetch, error } = useQuery({
        queryKey: reservationKeys.my(),
        queryFn: () => reservationService.getMyReservations(),
        select: (data) => (Array.isArray(data) ? data : []),
    });

    React.useEffect(() => {
        if (error) handleApiError(error, message, '예약 목록을 불러오지 못했습니다');
    }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

    const cancelMutation = useMutation({
        mutationFn: (reservationId) => reservationService.cancelReservation(reservationId),
        // 낙관적 업데이트: 실패 시 원복
        onMutate: async (reservationId) => {
            await queryClient.cancelQueries({ queryKey: reservationKeys.my() });
            const prev = queryClient.getQueryData(reservationKeys.my());
            queryClient.setQueryData(reservationKeys.my(), (old) =>
                (old || []).map(r => r.id === reservationId ? { ...r, status: 'CANCELLED' } : r)
            );
            return { prev };
        },
        onSuccess: () => message.success('예약이 취소되었습니다'),
        onError: (err, _, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(reservationKeys.my(), ctx.prev);
            handleApiError(err, message, '예약 취소에 실패했습니다');
        },
    });

    return {
        reservations: data || [],
        loading: isLoading,
        cancelReservation: cancelMutation.mutateAsync,
        refetch,
    };
};

export default useReservations;
