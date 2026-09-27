import { useState, useEffect } from 'react';

/**
 * 브라우저 창 너비를 반환하는 공용 훅.
 * StoreDetail, ReservationCard, MyReservations 등 반응형 분기에 공통 사용.
 *
 * 사용 예:
 *   const isPC   = useWindowWidth() >= 900;  // PC 레이아웃
 *   const isWide = useWindowWidth() >= 576;  // 넓은 카드 레이아웃
 */
export function useWindowWidth() {
    const [width, setWidth] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth : 1200
    );
    useEffect(() => {
        let timeoutId;
        const handler = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => setWidth(window.innerWidth), 150);
        };
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('resize', handler);
            clearTimeout(timeoutId);
        };
    }, []);
    return width;
}
