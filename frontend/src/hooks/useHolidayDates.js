import { useEffect, useState } from 'react';
import holidayService from '../services/holidayService';

const EMPTY = new Set();
const MAX_MONTHS = 64;
const CACHE_MS = 24 * 60 * 60 * 1000;

// 공통 입력은 Provider 없이도 동작한다. 조회하지 못한 달은 다음 요청에서 다시 시도한다.
const cache = new Map();

const load = month => {
    const cached = cache.get(month);
    cache.delete(month);
    if (cached && cached.expiresAt > Date.now()) {
        cache.set(month, cached);
        return cached.request;
    }
    const request = holidayService.getMonth(month)
        .then(dates => new Set(Array.isArray(dates) ? dates : []))
        .catch(() => {
            if (cache.get(month)?.request === request) cache.delete(month);
            return EMPTY;
        });
    if (cache.size >= MAX_MONTHS) cache.delete(cache.keys().next().value);
    cache.set(month, { request, expiresAt: Date.now() + CACHE_MS });
    return request;
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
