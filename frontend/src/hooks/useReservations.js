import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import reservationService from '../services/reservationService';
import { handleApiError } from '../utils/errorHandler';
import useMessage from './useMessage';
import { reservationKeys } from './queryKeys';
import { invalidateReservationData } from './invalidateAfterWrite';
import { queryErrorStatus } from './liveUpdateQueries';
import useLiveUpdatesStatus from './useLiveUpdatesStatus';

const useReservations = (params = {}) => {
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const live = useLiveUpdatesStatus();
    const liveReservations = live.connected && live.domains.includes('RESERVATION');

    // 코드리뷰 지적사항 반영(2026-07): 예전엔 loading: isLoading || isFetching라서, 취소 후
    // 백그라운드 재조회나 focus 재검증처럼 "조용히 갱신"되는 순간에도 화면 전체가 다시
    // 스켈레톤으로 바뀌었음(이미 데이터가 있는데도). isLoading(최초 로딩)과 isFetching(그
    // 외 백그라운드 재조회)을 분리해서 노출 — StoreList.jsx의 refetching과 동일한 패턴.
    const { data, isLoading, isFetching, error } = useQuery({
        queryKey: reservationKeys.myPage(params),
        queryFn: () => reservationService.getMyReservations(params),
        // 사업자 승인은 서버에서 즉시 확정된다. 대기 예약이 화면에 있을 때만 짧게 재검증해
        // 다른 계정/기기에서 승인한 결과도 열린 "내 예약" 화면에 10초 안에 반영한다.
        refetchInterval: query => !liveReservations && query.state.data?.content
            ?.some(reservation => reservation.status === 'PENDING')
            ? 10000 : false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: 'always',
    });

    React.useEffect(() => {
        if (error && data === undefined) handleApiError(error, message, '예약 목록을 불러오지 못했어요');
    }, [error, data]); // eslint-disable-line react-hooks/exhaustive-deps

    const cancelMutation = useMutation({
        mutationFn: (reservationId) => reservationService.cancelReservation(reservationId),
        // 취소는 서버 필터·총 건수·페이지 경계를 바꾼다. 관리 목록과 같이 모든 내 예약 페이지를 재검증한다.
        onSuccess: () => message.success('예약이 취소됐어요'),
        onError: (err) => handleApiError(err, message, '예약 취소에 실패했어요'),
        onSettled: () => invalidateReservationData(queryClient),
    });

    const accessDenied = [401, 403].includes(queryErrorStatus(error));
    return {
        reservations: accessDenied ? [] : data?.content ?? [],
        total: accessDenied ? 0 : data?.page?.totalElements ?? data?.totalElements ?? 0,
        totalPages: accessDenied ? 0 : data?.page?.totalPages ?? data?.totalPages ?? 0,
        loading: isLoading,
        refetching: isFetching && !isLoading,
        hasData: data !== undefined && !accessDenied,
        error: error ?? null,
        cancelReservation: cancelMutation.mutateAsync,
        refetch: () => queryClient.invalidateQueries({ queryKey: reservationKeys.my() }),
    };
};

export default useReservations;
