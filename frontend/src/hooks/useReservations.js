import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import reservationService from '../services/reservationService';
import { handleApiError } from '../utils/errorHandler';
import useMessage from './useMessage';
import { reservationKeys } from './queryKeys';
import { invalidateReservationData } from './invalidateAfterWrite';
import { isReadAccessDenied, queryErrorStatus } from './liveUpdateQueries';
import useLiveUpdatesStatus from './useLiveUpdatesStatus';
import useAuthStore from '../store/useAuthStore';
import { keepListForSort } from './listSortPlaceholder';

const useReservations = (params = {}) => {
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const live = useLiveUpdatesStatus();
    const revision = useAuthStore(state => state.sessionRevision);
    const memberId = useAuthStore(state => state.isLoggedIn ? state.user?.id : null);
    const session = memberId == null ? null : `${revision}:${memberId}`;
    const key = reservationKeys.myPage(params);

    const { data, isLoading, isFetching, isPlaceholderData, error } = useQuery({
        queryKey: session === null ? key : [...key, session],
        queryFn: ({ signal }) => reservationService.getMyReservations(params, signal),
        placeholderData: (previous, query) => {
            if (session === null || query?.queryKey[3] !== session || isReadAccessDenied(query.state.error)) return undefined;
            const source = query.queryKey[2];
            if (source.search !== params.search || source.status !== params.status || source.size !== params.size) return undefined;
            return keepListForSort(previous, source.sort, params.sort, source.page) ?? previous;
        },
        // 사업자 승인은 서버에서 즉시 확정된다. 대기 예약이 화면에 있을 때만 짧게 재검증해
        // 다른 계정/기기에서 승인한 결과도 열린 "내 예약" 화면에 10초 안에 반영한다.
        refetchInterval: query => !live.present && query.state.data?.content
            ?.some(reservation => reservation.status === 'PENDING')
            ? 10000 : false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: live.present ? false : 'always',
        refetchOnReconnect: false,
    });

    const cancelMutation = useMutation({
        mutationFn: (reservationId) => reservationService.cancelReservation(reservationId),
        // 취소는 서버 필터·총 건수·페이지 경계를 바꾼다. 관리 목록과 같이 모든 내 예약 페이지를 재검증한다.
        onSuccess: () => message.success('예약이 취소됐어요'),
        onError: (err) => handleApiError(err, message, '예약 취소에 실패했어요'),
        onSettled: () => invalidateReservationData(queryClient),
    });

    const accessDenied = [401, 403].includes(queryErrorStatus(error));
    const previousOrder = isPlaceholderData ? data?.previousOrder : undefined;
    const loading = isLoading || isPlaceholderData && !previousOrder;
    return {
        reservations: accessDenied || loading ? [] : data?.content ?? [],
        total: accessDenied ? 0 : data?.page?.totalElements ?? data?.totalElements ?? 0,
        totalPages: accessDenied ? 0 : data?.page?.totalPages ?? data?.totalPages ?? 0,
        sorting: Boolean(previousOrder),
        resultSort: previousOrder?.sort ?? params.sort,
        resultPage: (previousOrder?.page ?? params.page ?? 0) + 1,
        loading,
        refetching: isFetching && !loading,
        hasData: data !== undefined && !accessDenied,
        error: error ?? null,
        cancelReservation: cancelMutation.mutateAsync,
        refetch: () => queryClient.invalidateQueries({ queryKey: reservationKeys.my() }),
    };
};

export default useReservations;
