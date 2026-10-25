import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import reservationService from '../services/reservationService';
import { handleApiError } from '../utils/errorHandler';
import useMessage from './useMessage';
import { reservationKeys } from './queryKeys';
import { invalidateReservationData } from './invalidateAfterWrite';
import { colors } from '../styles/tokens';
import { queryErrorStatus } from './liveUpdateQueries';

const useManageReservations = (params) => {
    const { message } = useMessage();
    const queryClient = useQueryClient();

    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: reservationKeys.managePage(params),
        queryFn:  () => reservationService.getStoreReservations(params),
        staleTime: 1000 * 60,  // 1분 — 예약 관리는 실시간성 중요
    });

    const onError = (err) => handleApiError(err, message);

    // 상태 변경 후 필터 결과·전체 건수를 함께 다시 조회한다.
    // 예약 상태 변경은 달력 빈자리와 사업자 통계도 함께 무효화한다.

    const onSettled = () => invalidateReservationData(queryClient);

    const undoMutation = useMutation({
        mutationFn: ({ id, kind }) => (kind === 'approve'
            ? reservationService.undoApprove(id)
            : reservationService.undoComplete(id)),
        onSuccess:  (_d, { kind }) => message.success(
            kind === 'approve' ? '승인을 되돌렸어요' : '이용완료를 되돌렸어요'),
        onError,
        onSettled,
    });

    /*
     * 서버의 실행 취소 제한 안에서 토스트를 8초간 노출한다.
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
                        color: colors.primary.main, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
                    },
                }, '실행 취소'),
            ),
        });
    };

    const approveMutation = useMutation({
        mutationFn: (id) => reservationService.approveReservation(id),
        onSuccess:  (_d, id) => successWithUndo('예약을 승인했어요', id, 'approve'),
        onError,
        onSettled,
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }) => reservationService.rejectReservation(id, reason),
        onSuccess:  () => message.success('예약을 거절했어요'),
        onError,
        onSettled,
    });

    // 확정된 예약을 가게가 취소. 거절과 달리 서버가 **전액 환불**까지 실행한다.
    // 그래서 성공 메시지에도 환불을 명시한다 — 사장님 입장에서 돈이 나가는 동작이라
    // "취소했습니다"만 뜨면 환불이 됐는지 따로 확인하러 가야 한다.
    const storeCancelMutation = useMutation({
        mutationFn: ({ id, reason }) => reservationService.storeCancelReservation(id, reason),
        onSuccess:  () => message.success('예약을 취소했어요. 예약금은 전액 환불돼요'),
        onError,
        onSettled,
    });

    const completeMutation = useMutation({
        mutationFn: (id) => reservationService.completeReservation(id),
        onSuccess:  (_d, id) => successWithUndo('방문 완료로 처리했어요', id, 'complete'),
        onError,
        onSettled,
    });

    const noShowMutation = useMutation({
        mutationFn: (id) => reservationService.noShowReservation(id),
        onSuccess:  () => message.success('노쇼로 처리했어요'),
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

    const accessDenied = [401, 403].includes(queryErrorStatus(error));
    return {
        reservations:  accessDenied ? [] : data?.content ?? [],
        total:         accessDenied ? 0 : data?.page?.totalElements ?? data?.totalElements ?? 0,
        totalPages:    accessDenied ? 0 : data?.page?.totalPages ?? data?.totalPages ?? 0,
        hasData:       data !== undefined && !accessDenied,
        error,
        // 배경 재조회 중에도 기존 목록을 유지하도록 최초 로딩만 노출한다.

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
