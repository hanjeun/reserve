import { useEffect, useState } from 'react';
import holidayService from '../services/holidayService';

const EMPTY = new Set();

// 'YYYY-MM' → Promise<Set<'YYYY-MM-DD'>>. 공휴일은 공개 정보이고 한 번 받으면 탭이 살아 있는 동안 그대로 쓴다.
// TanStack Query 를 쓰지 않는 이유: FormDatePicker 는 공통 입력이라 QueryClient 밖(단위 테스트·디자인 미리보기)에서도
// 그려진다. 공통 입력이 Provider 유무에 따라 깨지면 안 된다. 실패한 달은 기억하지 않아 다음에 다시 시도한다.
const cache = new Map();

const load = month => {
    if (!cache.has(month)) {
        const request = holidayService.getMonth(month)
            .then(dates => new Set(Array.isArray(dates) ? dates : []))
            .catch(() => {
                cache.delete(month);
                return EMPTY;
            });
        cache.set(month, request);
    }
    return cache.get(month);
};

/**
 * 해당 달의 공휴일 날짜 집합. 받기 전·실패·비활성일 때는 빈 집합이라 달력은 일요일만 빨갛게 그린다.
 * @param {string|null} month 'YYYY-MM'
 * @param {boolean} enabled 달력이 열려 있고 공휴일 표시를 원할 때만 요청한다
 */
export default function useHolidayDates(month, enabled = true) {
    const [state, setState] = useState({ month: null, dates: EMPTY });

    useEffect(() => {
        if (!enabled || !month) return undefined;
        let active = true;
        load(month).then(dates => {
            if (active) setState({ month, dates });
        });
        return () => {
            active = false;
        };
    }, [month, enabled]);

    return enabled && state.month === month ? state.dates : EMPTY;
}
