import { useState, useEffect } from 'react';

/**
 * 디바운스 훅 — 값이 변경되고 delay ms 후에 업데이트된 값 반환
 *
 * 사용 예시:
 *   const debouncedKeyword = useDebounce(keyword, 300);
 *   // useMemo에서 keyword 대신 debouncedKeyword 사용
 *
 * 효과:
 *   - 입력창은 즉시 반응 (keyword state)
 *   - 필터링/API 호출은 타이핑 멈춘 후 300ms에만 실행
 *   - 빠르게 타이핑할 때 불필요한 연산 차단
 *
 * @param {*} value - 디바운스할 값
 * @param {number} delay - 지연 시간 (ms), 기본 300
 */
const useDebounce = (value, delay = 300) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
};

export default useDebounce;
