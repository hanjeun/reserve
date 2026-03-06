import { useState, useEffect } from 'react';

export function useWindowWidth() {
    const [width, setWidth] = useState(() => window.innerWidth); // 초기화 함수로 불필요한 re-render 방지
    useEffect(() => {
        const handler = () => setWidth(window.innerWidth);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);
    return width;
}
