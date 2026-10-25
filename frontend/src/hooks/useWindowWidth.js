import { useState, useEffect } from 'react';

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
