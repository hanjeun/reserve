import { useCallback, useContext, useEffect, useRef } from 'react';
import useReducedMotion from './useReducedMotion';
import { IllustrationMotionScope } from './illustrationMotionScope';

const MOTION = [
    { offset: 0, opacity: 0, transform: 'translateY(12px) scale(.88) rotate(-5deg)' },
    { offset: .28, opacity: 1, transform: 'translateY(-4px) scale(1.04) rotate(2deg)' },
    { offset: .55, opacity: 1, transform: 'translateY(2px) scale(.99) rotate(-1deg)' },
    { offset: .78, opacity: 1, transform: 'translateY(-1px) scale(1.005) rotate(.3deg)' },
    { offset: 1, opacity: 1, transform: 'translateY(0) scale(1) rotate(0deg)' },
];

// Only successful static assets are remembered in this document. No persistent cache flag or extra request.
const loadedSources = new Set();
const enteredSources = new Set();
const hasLoaded = img => Boolean(img?.complete && img.naturalWidth > 0);
const cameFromCache = img => {
    const url = img.currentSrc || img.src;
    const entries = img.ownerDocument.defaultView?.performance?.getEntriesByName?.(url, 'resource') || [];
    const latest = entries.at(-1);
    // A zero transfer alone can also mean restricted cross-origin timing; require a known response body.
    return latest?.transferSize === 0 && latest.decodedBodySize > 0;
};

/** New static art enters after loading; ready/cached art stays still and explicit replay stays local. */
export default function useIllustrationMotion(src) {
    const reduced = useReducedMotion();
    const scope = useContext(IllustrationMotionScope);
    const picture = useRef(null);
    const attached = useRef(null);
    const pictureRef = useCallback(img => {
        picture.current = img;
        if (!img || !src || attached.current?.image === img && attached.current.source === src) return;
        // Capture availability when the native image attaches, before a cold load can finish in an effect.
        attached.current = { image: img, source: src, cached: loadedSources.has(src) || hasLoaded(img) };
        if (hasLoaded(img)) loadedSources.add(src);
    }, [src]);
    const replayRef = useRef(null);
    const replay = useCallback(() => replayRef.current?.(), []);
    useEffect(() => {
        const img = picture.current;
        if (!src || !img) return undefined;
        let played = attached.current?.cached || loadedSources.has(src);
        const rememberLoaded = () => { if (hasLoaded(img)) loadedSources.add(src); };
        rememberLoaded();
        if (reduced || typeof img.animate !== 'function') {
            img.addEventListener('load', rememberLoaded);
            return () => img.removeEventListener('load', rememberLoaded);
        }
        const page = img.ownerDocument;
        const view = page.defaultView;
        let visible = false;
        let animation = null;
        const play = (manual = false) => {
            const host = img.closest('.reserve-state-illustration');
            const action = (host?.parentElement || img.parentElement?.parentElement)?.closest('a, button, input, label, [role="button"], [role="link"], [aria-hidden="true"], [inert]');
            if (action) return;
            if (!visible || page.hidden || !hasLoaded(img)) return;
            rememberLoaded();
            if (!manual) {
                if (played) return;
                played = true;
                if (enteredSources.has(src) || cameFromCache(img)) return;
            }
            played = true;
            enteredSources.add(src);
            animation?.cancel();
            const next = img.animate(MOTION, { duration: 1400, easing: 'cubic-bezier(.22,.61,.36,1)', iterations: 1, fill: 'both' });
            animation = next;
            next.addEventListener('finish', () => {
                next.cancel();
                if (animation === next) animation = null;
            }, { once: true });
        };
        replayRef.current = () => play(true);
        const sync = () => {
            if (!played) play();
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
        const loaded = () => { rememberLoaded(); scheduleVisibility(); };
        scheduleVisibility();
        img.addEventListener('load', loaded);
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
            img.removeEventListener('load', loaded);
            page.removeEventListener('visibilitychange', visibilityChanged);
            if (!observer) {
                page.removeEventListener('scroll', scheduleVisibility, true);
                view.removeEventListener('resize', scheduleVisibility);
            }
        };
    }, [reduced, src, scope]);
    return { pictureRef, replay };
}
