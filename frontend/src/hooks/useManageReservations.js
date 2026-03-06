import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import reservationService from '../services/reservationService';
import { handleApiError } from '../utils/errorHandler';
import useMessage from './useMessage';
import { reservationKeys } from './queryKeys';

const useManageReservations = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: reservationKeys.manage(),
        queryFn:  () => reservationService.getStoreReservations(),
        select:   (d) => (Array.isArray(d) ? d : []),
        staleTime: 1000 * 60,  // 1분 — 예약 관리는 실시간성 중요
    });

    const optimisticPatch = async (id, newStatus) => {
        await queryClient.cancelQueries({ queryKey: reservationKeys.manage() });
        const prev = queryClient.getQueryData(reservationKeys.manage());
        queryClient.setQueryData(reservationKeys.manage(), (old) =>
            (old || []).map(r => r.id === id ? { ...r, status: newStatus } : r)
        );
        return { prev };
    };

    const onError = (err, _, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(reservationKeys.manage(), ctx.prev);
        handleApiError(err, message);
    };

    const approveMutation = useMutation({
        mutationFn: (id) => reservationService.approveReservation(id),
        onMutate:   (id) => optimisticPatch(id, 'CONFIRMED'),
        onSuccess:  () => message.success('예약을 승인했습니다'),
        onError,
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }) => reservationService.rejectReservation(id, reason),
        onMutate:   ({ id }) => optimisticPatch(id, 'REJECTED'),
        onSuccess:  () => message.success('예약을 거절했습니다'),
        onError,
    });

    const completeMutation = useMutation({
        mutationFn: (id) => reservationService.completeReservation(id),
        onMutate:   (id) => optimisticPatch(id, 'COMPLETED'),
        onSuccess:  () => message.success('방문 완료로 처리했습니다'),
        onError,
    });

    const noShowMutation = useMutation({
        mutationFn: (id) => reservationService.noShowReservation(id),
        onMutate:   (id) => optimisticPatch(id, 'NO_SHOW'),
        onSuccess:  () => message.success('노쇼로 처리했습니다'),
        onError,
    });

    // ReservationCard의 actionLoading 키 형식과 동일
    const getActionLoading = () => {
        if (approveMutation.isPending)  return `approve-${approveMutation.variables}`;
        if (rejectMutation.isPending)   return `reject-${rejectMutation.variables?.id}`;
        if (completeMutation.isPending) return `complete-${completeMutation.variables}`;
        if (noShowMutation.isPending)   return `noshow-${noShowMutation.variables}`;
        return null;
    };

    return {
        reservations:  data || [],
        loading:       isLoading,
        actionLoading: getActionLoading(),
        approve:  (id) => approveMutation.mutateAsync(id),
        reject:   (id, reason = '') => rejectMutation.mutateAsync({ id, reason }),
        complete: (id) => completeMutation.mutateAsync(id),
        noShow:   (id) => noShowMutation.mutateAsync(id),
        refetch:  () => queryClient.invalidateQueries({ queryKey: reservationKeys.manage() }),
    };
};

export default useManageReservations;
