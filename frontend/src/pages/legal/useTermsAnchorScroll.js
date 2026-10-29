import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import useReducedMotion from '../../hooks/useReducedMotion';

export default function useTermsAnchorScroll() {
    const { key, hash } = useLocation();
    const navigationType = useNavigationType();
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        if (hash !== '#payments') return undefined;
        const animate = navigationType === 'PUSH' && !reducedMotion;
        let frame = 0;
        let finished = false;
        const stop = () => {
            finished = true;
            cancelAnimationFrame(frame);
            document.removeEventListener('reserve:modal-unlocked', schedule);
            window.removeEventListener('wheel', stop);
            window.removeEventListener('touchstart', stop);
            window.removeEventListener('pointerdown', stop);
            window.removeEventListener('keydown', stop);
        };
        const reveal = () => {
            if (finished || document.documentElement.dataset.reserveModalOpen) return;
            const target = document.getElementById('payments');
            stop();
            target?.focus({ preventScroll: true });
            target?.scrollIntoView({ block: 'start', behavior: animate ? 'smooth' : 'instant' });
        };
        const schedule = () => {
            if (finished || document.documentElement.dataset.reserveModalOpen) return;
            cancelAnimationFrame(frame);
            if (!animate) { frame = requestAnimationFrame(reveal); return; }
            // 모달의 스크롤 복원이 끝나고 약관 상단이 그려진 뒤 해당 조항으로 이동해요.
            frame = requestAnimationFrame(() => {
                if (finished || document.documentElement.dataset.reserveModalOpen) return;
                window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
                frame = requestAnimationFrame(reveal);
            });
        };
        document.addEventListener('reserve:modal-unlocked', schedule);
        window.addEventListener('wheel', stop, { passive: true });
        window.addEventListener('touchstart', stop, { passive: true });
        window.addEventListener('pointerdown', stop, { passive: true });
        window.addEventListener('keydown', stop);
        schedule();
        return stop;
    }, [key, hash, navigationType, reducedMotion]);
}
