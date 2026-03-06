import { useEffect, useRef } from 'react';

export function useScrollReveal(isMobile) {
    const observerRef = useRef(null);

    useEffect(() => {
        // 이전 observer 정리
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }

        // React가 새 DOM을 그린 뒤 observe하도록 딜레이
        const timer = setTimeout(() => {
            const observer = new IntersectionObserver(
                entries => entries.forEach(e => {
                    if (e.isIntersecting) e.target.classList.add('rv');
                }),
                { threshold: 0.1 }
            );
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
