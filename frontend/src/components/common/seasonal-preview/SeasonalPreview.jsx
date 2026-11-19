import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import useReducedMotion from '../../../hooks/useReducedMotion';
import { getSeasonEffect } from './seasonEffect';
import './seasonal-preview.css';

const Snowfall = lazy(() => import('./SnowfallPreview').catch(() => ({ default: () => null })));
const Particles = lazy(() => import('./SeasonParticles').catch(() => ({ default: () => null })));
export default function SeasonalPreview() {
    const host = useRef(null);
    const reducedMotion = useReducedMotion();
    const [visible, setVisible] = useState(() => !document.hidden);
    const [inView, setInView] = useState(() => typeof IntersectionObserver !== 'function');
    const season = getSeasonEffect();
    useEffect(() => {
        if (!season) return undefined;
        const update = () => setVisible(!document.hidden);
        document.addEventListener('visibilitychange', update);
        const observer = typeof IntersectionObserver === 'function'
            ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting)) : null;
        observer?.observe(host.current);
        return () => {
            observer?.disconnect();
            document.removeEventListener('visibilitychange', update);
        };
    }, [season]);
    if (!season) return null;

    return <div ref={host} className="reserve-season-preview" data-season-preview={season}>
        {visible && inView && !reducedMotion &&
            <div className="reserve-season-preview-paint" aria-hidden="true">
                <Suspense fallback={null}>
                    {season === 'snowfall' ? <Snowfall /> : <Particles season={season} />}
                </Suspense>
            </div>}
    </div>;
}
