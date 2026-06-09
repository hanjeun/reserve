import { useEffect, useRef } from 'react';

// 중첩 방지: IntersectionObserver 콜백을 모듈 레벨로 분리
const handleIntersection = (entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('rv');
    });
};

export function useScrollReveal(isMobile) {
    const observerRef = useRef(null);

    useEffect(() => {
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }

        const timer = setTimeout(() => {
            const observer = new IntersectionObserver(handleIntersection, { threshold: 0.1 });
            document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
            observerRef.current = observer;
        }, 50);

        return () => {
            clearTimeout(timer);
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
        };
    }, [isMobile]);
}
