import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import reservationService from '../services/reservationService';
import { handleApiError } from '../utils/errorHandler';
import useMessage from './useMessage';
import { reservationKeys } from './queryKeys';
import { invalidateReservationData } from './invalidateAfterWrite';
import UnderlinedTextButton from '../components/common/UnderlinedTextButton';
import { assertCurrentSession, currentSession, isCurrentSession } from '../api/sessionScope';
import { isReadAccessDenied } from './liveUpdateQueries';
import { keepListForSort } from './listSortPlaceholder';
import { WorkspaceActivityContext } from '../components/layout/workspaceActivity';

const useManageReservations = (params) => {
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const active = React.useContext(WorkspaceActivityContext);

    const { data, isLoading, isFetching, isPlaceholderData, error } = useQuery({
        queryKey: reservationKeys.managePage(params),
        enabled: active,
        queryFn: ({ signal }) => reservationService.getStoreReservations(params, signal),
        placeholderData: (previous, query) => {
            if (!query || isReadAccessDenied(query.state.error)) return undefined;
            const source = query.queryKey[3];
            if (source.search !== params.search || source.status !== params.status
                || source.storeId !== params.storeId || source.size !== params.size) return undefined;
            return keepListForSort(previous, source.sort, params.sort, source.page) ?? previous;
        },
        refetchOnReconnect: false,
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
            kind === 'approve' ? '승인을 되돌렸어요.' : '이용 완료를 되돌렸어요.'),
        onError,
        onSettled,
    });

    // 처리 직후 되돌리기 알림을 8초간 노출한다.
    const successWithUndo = (text, id, kind, epoch = currentSession().epoch) => {
        if (!isCurrentSession(epoch)) return;
        const key = `undo-${kind}-${id}`;
        let used = false;
        message.open({
            key,
            type: 'success',
            duration: 8,
            content: React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 12 } },
                text,
                React.createElement(UnderlinedTextButton, {
                    onClick: () => {
                        if (used) return;
                        used = true;
                        message.destroy(key);
                        if (!isCurrentSession(epoch)) return;
                        if (kind === 'noshow') undoNoShowMutation.mutate({ id, epoch });
                        else undoMutation.mutate({ id, kind });
                    },
                }, '되돌리기'),
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
        onSuccess: (result, id) => {
            const reservation = data?.content?.find(item => item.id === id);
            const attendanceDeposit = reservation?.attendanceRefundEnabled && reservation.depositAmount > 0;
            if (result?.canUndo ?? (Boolean(reservation) && !attendanceDeposit)) {
                successWithUndo('이용 완료로 처리했어요.', id, 'complete');
            } else if (result?.refundRequested ?? (attendanceDeposit && reservation.depositPaid)) {
                message.success('이용 완료로 처리했어요. 보증금 환불을 진행해요.');
            } else message.success('이용 완료로 처리했어요.');
        },
        onError,
        onSettled,
    });

    const noShowMutation = useMutation({
        mutationFn: ({ id, epoch }) => {
            assertCurrentSession(epoch);
            return reservationService.noShowReservation(id);
        },
        onSuccess: (_d, { id, epoch }) => successWithUndo('노쇼로 처리했어요.', id, 'noshow', epoch),
        onError: (failure, { epoch }) => { if (isCurrentSession(epoch)) onError(failure); },
        onSettled: (_d, _error, { epoch }) => { if (isCurrentSession(epoch)) return onSettled(); },
    });

    const undoNoShowMutation = useMutation({
        mutationFn: ({ id, epoch }) => {
            assertCurrentSession(epoch);
            return reservationService.undoNoShow(id);
        },
        onSuccess: (_d, { epoch }) => { if (isCurrentSession(epoch)) message.success('노쇼 처리를 되돌렸어요.'); },
        onError: (failure, { epoch }) => { if (isCurrentSession(epoch)) onError(failure); },
        onSettled: (_d, _error, { epoch }) => { if (isCurrentSession(epoch)) return onSettled(); },
    });

    // ReservationCard의 actionLoading 키 형식과 동일
    const getActionLoading = () => {
        if (approveMutation.isPending)  return `approve-${approveMutation.variables}`;
        if (rejectMutation.isPending)   return `reject-${rejectMutation.variables?.id}`;
        if (storeCancelMutation.isPending) return `storecancel-${storeCancelMutation.variables?.id}`;
        if (completeMutation.isPending) return `complete-${completeMutation.variables}`;
        if (noShowMutation.isPending)   return `noshow-${noShowMutation.variables?.id}`;
        if (undoNoShowMutation.isPending) return `undo-noshow-${undoNoShowMutation.variables?.id}`;
        if (undoMutation.isPending)     return `undo-${undoMutation.variables?.id}`;
        return null;
    };

    const accessDenied = isReadAccessDenied(error);
    const previousOrder = isPlaceholderData ? data?.previousOrder : undefined;
    const loading = isLoading || isPlaceholderData && !previousOrder;
    return {
        reservations:  accessDenied || loading ? [] : data?.content ?? [],
        total:         accessDenied ? 0 : data?.page?.totalElements ?? data?.totalElements ?? 0,
        totalPages:    accessDenied ? 0 : data?.page?.totalPages ?? data?.totalPages ?? 0,
        hasData:       data !== undefined && !accessDenied,
        sorting:       Boolean(previousOrder),
        resultSort:    previousOrder?.sort ?? params.sort,
        resultPage:    (previousOrder?.page ?? params.page ?? 0) + 1,
        error,
        loading,
        refetching:    isFetching && !loading,
        actionLoading: getActionLoading(),
        approve:  (id) => approveMutation.mutateAsync(id),
        reject:   (id, reason = '') => rejectMutation.mutateAsync({ id, reason }),
        storeCancel: (id, reason = '') => storeCancelMutation.mutateAsync({ id, reason }),
        complete: (id) => completeMutation.mutateAsync(id),
        noShow:   (id) => noShowMutation.mutateAsync({ id, epoch: currentSession().epoch }),
        undoNoShow: (id) => undoNoShowMutation.mutateAsync({ id, epoch: currentSession().epoch }),
        refetch:  () => queryClient.invalidateQueries({ queryKey: reservationKeys.manage() }),
    };
};

export default useManageReservations;
