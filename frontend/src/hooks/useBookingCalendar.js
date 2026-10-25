import { useQuery } from '@tanstack/react-query';
import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';
import { reservationKeys } from './queryKeys';
import reservationService from '../services/reservationService';

/*
 * 예약 가능 상태와 사유는 서버 응답을 표시하고 프론트에서 다시 판정하지 않는다.
 * @param {number|string} storeId
 * @param {string} month `"2026-09"`
 */
const useBookingCalendar = (storeId, month, reservationId = null) => {
    const { data, isLoading, isFetching, error, refetch } = useQuery({
        queryKey: reservationId == null ? reservationKeys.calendar(storeId, month)
            : [...reservationKeys.calendar(storeId, month), 'reservation-edit', reservationId],
        queryFn: ({ signal }) => reservationId == null
            ? api.get(API_ENDPOINTS.RESERVATION.CALENDAR, { params: { storeId, month }, signal })
            : reservationService.getEditCalendar(reservationId, storeId, month, { signal }),
        enabled: !!storeId && !!month,
        // 달을 넘기는 동안 이전 달을 그대로 두고 새 응답이 오면 교체한다.
        // 없으면 달력이 매번 빈 격자로 깜빡여서, 넘길 때마다 화면이 무너지는 느낌이 난다.
        placeholderData: (prev, previousQuery) => {
            if (reservationId == null) return prev;
            const previousKey = previousQuery?.queryKey;
            return previousKey?.[2] === storeId && previousKey?.[4] === 'reservation-edit' && previousKey?.[5] === reservationId ? prev : undefined;
        },
        // 정원은 남이 예약하면 바뀐다. 그렇다고 매번 새로 부를 만큼 급하지도 않다.
        staleTime: 30 * 1000,
    });

    /* 날짜 키로 달력 상태를 바로 찾는다. */
    const byDate = {};
    for (const day of data ?? []) byDate[day.date] = day;

    return {
        byDate,
        // isLoading 은 **캐시가 아예 없을 때만** true 다. 달을 넘길 땐 isFetching 만 켜지므로
        // 이전 달을 흐리게 두고 기다릴 수 있다.
        loading: isLoading,
        fetching: isFetching,
        error: error ? (error.message || '달력을 불러오지 못했어요.') : null,
        refetch,
    };
};

export default useBookingCalendar;
