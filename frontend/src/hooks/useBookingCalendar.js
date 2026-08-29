import { useQuery } from '@tanstack/react-query';
import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';
import { reservationKeys } from './queryKeys';

/**
 * 예약 달력 한 달치 — `GET /api/reservations/calendar`.
 *
 * <h3>왜 서버가 사유까지 주는가 (2026-08-25)</h3>
 * 예전 날짜 칸은 AntD `DatePicker` 의 `disabledDate` 였고, 그건 **회색으로 막는 것밖에 못 한다.**
 * 정기휴무·임시휴무·운영기간 밖·예약범위 초과·정원 마감이 전부 같은 회색이 돼서
 * 손님은 "왜 안 눌리지"를, 사장님은 "왜 예약이 안 들어오지"를 알 방법이 없었다.
 *
 * ⚠️ **여기서 다시 판정하지 말 것.** 서버가 준 `status` 를 그리기만 한다.
 *   프론트가 휴무·기간을 스스로 계산하면 서버 `Store.isBookableOn` 과 언젠가 어긋나고,
 *   그 순간 이 프로젝트가 계속 경계해 온 **"달력엔 눌리는데 예약하면 거절"** 이 돌아온다.
 *
 * @param {number|string} storeId
 * @param {string} month `"2026-09"`
 */
const useBookingCalendar = (storeId, month) => {
    const { data, isLoading, isFetching, error, refetch } = useQuery({
        queryKey: reservationKeys.calendar(storeId, month),
        queryFn: () => api.get(API_ENDPOINTS.RESERVATION.CALENDAR, { params: { storeId, month } }),
        enabled: !!storeId && !!month,
        // 달을 넘기는 동안 이전 달을 그대로 두고 새 응답이 오면 교체한다.
        // 없으면 달력이 매번 빈 격자로 깜빡여서, 넘길 때마다 화면이 무너지는 느낌이 난다.
        placeholderData: (prev) => prev,
        // 정원은 남이 예약하면 바뀐다. 그렇다고 매번 새로 부를 만큼 급하지도 않다.
        staleTime: 30 * 1000,
    });

    /** `{ "2026-09-01": { date, status, totalSlots, openSlots }, ... }` — 칸에서 O(1) 로 찾는다. */
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
