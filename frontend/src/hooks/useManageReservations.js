import React from 'react';
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

    // ── Undo (2026-08-11) ────────────────────────────────────────────────────
    // 승인·완료는 확인 모달 없이 한 번에 확정된다. 목록에서 바로 옆 줄을 누르는 오조작이 잦은데,
    // 그 전까지 되돌릴 방법이 거절뿐이었다 — 거절은 이용자에게 "거절됨"으로 남고 메일까지 나가서
    // 실수 정정에 쓰기엔 흔적이 너무 크다.
    //
    // 왜 확인 모달이 아니라 Undo 인가 — 승인·완료는 하루에도 수십 번 누르는 동작이다.
    // 매번 모달을 띄우면 그걸 습관적으로 넘기게 되어 오조작을 못 막는다.
    // 되돌릴 수 있게 해두는 쪽이 빠르면서도 안전하다. (노쇼는 반대다 — 드물고 무거워서 모달이 맞다.)
    const undoMutation = useMutation({
        mutationFn: ({ id, kind }) => (kind === 'approve'
            ? reservationService.undoApprove(id)
            : reservationService.undoComplete(id)),
        onMutate:   ({ id, kind }) => optimisticPatch(id, kind === 'approve' ? 'PENDING' : 'CONFIRMED'),
        onSuccess:  (_d, { kind }) => message.success(
            kind === 'approve' ? '승인을 되돌렸습니다' : '이용완료를 되돌렸습니다'),
        onError,
        onSettled,
    });

    /**
     * "…했습니다 [실행 취소]" 토스트. 서버가 10분 이내만 되돌리기를 허용하므로
     * 토스트가 사라진 뒤에도 잠깐은 유효하지만, 화면에서는 8초만 노출한다.
     * 이 파일은 .js 라 JSX 를 쓸 수 없어 createElement 로 만든다(useMessage.js 와 같은 제약).
     */
    const successWithUndo = (text, id, kind) => {
        const key = `undo-${kind}-${id}`;
        message.open({
            key,
            type: 'success',
            duration: 8,
            content: React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 12 } },
                text,
                React.createElement('button', {
                    type: 'button',
                    onClick: () => { message.destroy(key); undoMutation.mutate({ id, kind }); },
                    style: {
                        background: 'none', border: 'none', padding: 0, font: 'inherit',
                        color: '#3182f6', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
                    },
                }, '실행 취소'),
            ),
        });
    };

    const approveMutation = useMutation({
        mutationFn: (id) => reservationService.approveReservation(id),
        onMutate:   (id) => optimisticPatch(id, 'CONFIRMED'),
        onSuccess:  (_d, id) => successWithUndo('예약을 승인했습니다', id, 'approve'),
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
        onSuccess:  (_d, id) => successWithUndo('방문 완료로 처리했습니다', id, 'complete'),
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
        if (undoMutation.isPending)     return `undo-${undoMutation.variables?.id}`;
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
