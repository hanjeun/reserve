import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import reservationService from '../services/reservationService';
import { handleApiError } from '../utils/errorHandler';
import useMessage from './useMessage';
import { reservationKeys } from './queryKeys';

const useManageReservations = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();

    const { data, isLoading, isFetching } = useQuery({
        queryKey: reservationKeys.manage(),
        queryFn:  () => reservationService.getStoreReservations(),
        // 백엔드가 Page 객체({ content: [], totalElements, ... })를 반환
        select:   (d) => (Array.isArray(d) ? d : (d?.content ?? [])),
        staleTime: 1000 * 60,  // 1분 — 예약 관리는 실시간성 중요
    });

    const optimisticPatch = async (id, newStatus) => {
        await queryClient.cancelQueries({ queryKey: reservationKeys.manage() });
        const prev = queryClient.getQueryData(reservationKeys.manage());
        queryClient.setQueryData(reservationKeys.manage(), (old) => {
            // old는 서버 원본(Page 객체) 또는 배열일 수 있음
            if (Array.isArray(old)) {
                return old.map(r => r.id === id ? { ...r, status: newStatus } : r);
            }
            if (old?.content) {
                return { ...old, content: old.content.map(r => r.id === id ? { ...r, status: newStatus } : r) };
            }
            return old;
        });
        return { prev };
    };

    const onError = (err, _, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(reservationKeys.manage(), ctx.prev);
        handleApiError(err, message);
    };

    // 코드리뷰 지적사항 반영(2026-07): 낙관적 업데이트는 status 필드만 클라이언트에서 미리 바꿔주는
    // 거라, 서버가 실제로 같이 계산하는 다른 필드(예: 처리 시각 등)는 반영이 안 된 채로 남을 수
    // 있음 — 성공/실패 관계없이 마지막에 한 번 더 실제 서버 데이터로 재검증(invalidate)해서
    // 로컬 캐시와 서버 상태의 미세한 어긋남을 방지하는 안전망.
    const onSettled = () => queryClient.invalidateQueries({ queryKey: reservationKeys.manage() });

    const approveMutation = useMutation({
        mutationFn: (id) => reservationService.approveReservation(id),
        onMutate:   (id) => optimisticPatch(id, 'CONFIRMED'),
        onSuccess:  () => message.success('예약을 승인했습니다'),
        onError,
        onSettled,
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }) => reservationService.rejectReservation(id, reason),
        onMutate:   ({ id }) => optimisticPatch(id, 'REJECTED'),
        onSuccess:  () => message.success('예약을 거절했습니다'),
        onError,
        onSettled,
    });

    // 확정된 예약을 가게가 취소 (2026-08-11 신설). 거절과 달리 서버가 **전액 환불**까지 실행한다.
    // 그래서 성공 메시지에도 환불을 명시한다 — 사장님 입장에서 돈이 나가는 동작이라
    // "취소했습니다"만 뜨면 환불이 됐는지 따로 확인하러 가야 한다.
    const storeCancelMutation = useMutation({
        mutationFn: ({ id, reason }) => reservationService.storeCancelReservation(id, reason),
        onMutate:   ({ id }) => optimisticPatch(id, 'CANCELLED'),
        onSuccess:  () => message.success('예약을 취소했습니다. 예약금은 전액 환불됩니다'),
        onError,
        onSettled,
    });

    const completeMutation = useMutation({
        mutationFn: (id) => reservationService.completeReservation(id),
        onMutate:   (id) => optimisticPatch(id, 'COMPLETED'),
        onSuccess:  () => message.success('방문 완료로 처리했습니다'),
        onError,
        onSettled,
    });

    const noShowMutation = useMutation({
        mutationFn: (id) => reservationService.noShowReservation(id),
        onMutate:   (id) => optimisticPatch(id, 'NO_SHOW'),
        onSuccess:  () => message.success('노쇼로 처리했습니다'),
        onError,
        onSettled,
    });

    // ReservationCard의 actionLoading 키 형식과 동일
    const getActionLoading = () => {
        if (approveMutation.isPending)  return `approve-${approveMutation.variables}`;
        if (rejectMutation.isPending)   return `reject-${rejectMutation.variables?.id}`;
        if (storeCancelMutation.isPending) return `storecancel-${storeCancelMutation.variables?.id}`;
        if (completeMutation.isPending) return `complete-${completeMutation.variables}`;
        if (noShowMutation.isPending)   return `noshow-${noShowMutation.variables}`;
        return null;
    };

    return {
        reservations:  data || [],
        // 코드리뷰 지적사항 반영(2026-07): useReservations.js와 동일한 이유로 isLoading만 노출 —
        // onSettled의 invalidateQueries가 백그라운드 재조회(isFetching)를 유발하는데, 이걸
        // loading에 같이 묶으면 승인/거절 등 처리 직후 목록이 다시 스켈레톤으로 깜빡였음.
        loading:       isLoading,
        refetching:    isFetching && !isLoading,
        actionLoading: getActionLoading(),
        approve:  (id) => approveMutation.mutateAsync(id),
        reject:   (id, reason = '') => rejectMutation.mutateAsync({ id, reason }),
        storeCancel: (id, reason = '') => storeCancelMutation.mutateAsync({ id, reason }),
        complete: (id) => completeMutation.mutateAsync(id),
        noShow:   (id) => noShowMutation.mutateAsync(id),
        refetch:  () => queryClient.invalidateQueries({ queryKey: reservationKeys.manage() }),
    };
};

export default useManageReservations;
