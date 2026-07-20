import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import reservationService from '../services/reservationService';
import { handleApiError } from '../utils/errorHandler';
import useMessage from './useMessage';
import { reservationKeys } from './queryKeys';

const useReservations = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();

    // 코드리뷰 지적사항 반영(2026-07): 예전엔 loading: isLoading || isFetching라서, 취소 후
    // 백그라운드 재조회나 focus 재검증처럼 "조용히 갱신"되는 순간에도 화면 전체가 다시
    // 스켈레톤으로 바뀌었음(이미 데이터가 있는데도). isLoading(최초 로딩)과 isFetching(그
    // 외 백그라운드 재조회)을 분리해서 노출 — StoreList.jsx의 refetching과 동일한 패턴.
    const { data, isLoading, isFetching, refetch, error } = useQuery({
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
        // 코드리뷰 지적사항 반영(2026-07): 낙관적 업데이트는 status만 미리 바꿔주는 거라, 서버가
        // 같이 계산하는 다른 필드(환불 여부 등)는 반영이 안 될 수 있음 — 성공/실패 관계없이 마지막에
        // 한 번 더 실제 서버 데이터로 재검증(refetching만 true가 되고 loading은 안 바뀌므로 스켈레톤
        // 깜빡임 없이 조용히 정정됨).
        onSettled: () => queryClient.invalidateQueries({ queryKey: reservationKeys.my() }),
    });

    return {
        reservations: data || [],
        loading: isLoading,
        refetching: isFetching && !isLoading,
        cancelReservation: cancelMutation.mutateAsync,
        refetch,
    };
};

export default useReservations;
