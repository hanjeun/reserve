import { useCallback, useEffect, useRef } from 'react';
import useReducedMotion from './useReducedMotion';
import { useSkeletonShown } from '../components/layout/loadingPresentation';

const MOTION = [
    { offset: 0, opacity: 0, transform: 'translateY(12px) scale(.88) rotate(-5deg)' },
    { offset: .28, opacity: 1, transform: 'translateY(-4px) scale(1.04) rotate(2deg)' },
    { offset: .55, opacity: 1, transform: 'translateY(2px) scale(.99) rotate(-1deg)' },
    { offset: .78, opacity: 1, transform: 'translateY(-1px) scale(1.005) rotate(.3deg)' },
    { offset: 1, opacity: 1, transform: 'translateY(0) scale(1) rotate(0deg)' },
];

/** Static page art enters only when already loaded without a skeleton; replay stays local. */
export default function useIllustrationMotion(picture, src) {
    const reduced = useReducedMotion();
    const skeletonShown = useSkeletonShown();
    const replayRef = useRef(null);
    const replay = useCallback(() => replayRef.current?.(), []);
    useEffect(() => {
        const img = picture.current;
        if (!src || reduced || typeof img?.animate !== 'function') return undefined;
        const page = img.ownerDocument;
        const view = page.defaultView;
        const animateEntry = !skeletonShown && img.complete && img.naturalWidth > 0;
        let visible = false;
        let played = false;
        let animation = null;
        const play = () => {
            const action = img.parentElement?.parentElement?.closest('a, button, input, label, [role="button"], [role="link"], [aria-hidden="true"], [inert]');
            if (action) return;
            if (!visible || page.hidden || !img.complete || img.naturalWidth === 0) return;
            played = true;
            animation?.cancel();
            const next = img.animate(MOTION, { duration: 1400, easing: 'cubic-bezier(.22,.61,.36,1)', iterations: 1, fill: 'both' });
            animation = next;
            next.addEventListener('finish', () => {
                next.cancel();
                if (animation === next) animation = null;
            }, { once: true });
        };
        replayRef.current = play;
        const sync = () => {
            if (animateEntry && !played) play();
            if (animation) {
                if (page.hidden || !visible) animation.pause();
                else animation.play();
            }
        };
        const observer = typeof view.IntersectionObserver === 'undefined' ? null : new view.IntersectionObserver(entries => {
            visible = entries.some(entry => entry.isIntersecting);
            sync();
        });
        observer?.observe(img);
        let frame;
        const updateVisibility = () => {
            const rect = img.getBoundingClientRect();
            visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < view.innerHeight
                && rect.right > 0 && rect.left < view.innerWidth;
            sync();
        };
        const scheduleVisibility = () => {
            if (frame != null) return;
            frame = view.requestAnimationFrame(() => { frame = null; updateVisibility(); });
        };
        const visibilityChanged = () => { if (observer) sync(); else updateVisibility(); };
        scheduleVisibility();
        if (!observer) {
            page.addEventListener('scroll', scheduleVisibility, { capture: true, passive: true });
            view.addEventListener('resize', scheduleVisibility, { passive: true });
        }
        page.addEventListener('visibilitychange', visibilityChanged);
        return () => {
            replayRef.current = null;
            observer?.disconnect();
            if (frame != null) view.cancelAnimationFrame(frame);
            animation?.cancel();
            page.removeEventListener('visibilitychange', visibilityChanged);
            if (!observer) {
                page.removeEventListener('scroll', scheduleVisibility, true);
                view.removeEventListener('resize', scheduleVisibility);
            }
        };
    }, [picture, reduced, src, skeletonShown]);
    return replay;
}
