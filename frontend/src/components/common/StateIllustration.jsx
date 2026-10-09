import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import useReducedMotion from '../../hooks/useReducedMotion';
import useIllustrationMotion from '../../hooks/useIllustrationMotion';
import { stateIllustrationSize, stateIllustrationDesktopSize } from '../../styles/tokens';
import Bone from './Bone';

// Vite emits content-hashed files. URL metadata does not fetch the other pictures.
const files = import.meta.glob('../../assets/state-illustrations/*.webp', { eager: true, query: '?url&no-inline', import: 'default' });
const sources = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.split('/').pop(), url]));
// Static outcomes may replay wherever they appear. QR and pending payment remain process indicators.
const STATIC_STATES = new Set(['not-found', 'access-restricted', 'network-offline', 'rate-limited',
    'retry', 'server-unavailable', 'unknown-error', 'preparing', 'payment-success', 'payment-failure', 'waiting-called']);
const slotStyle = size => ({
    '--state-illustration-mobile-size': `${stateIllustrationSize[size]}px`,
    '--state-illustration-desktop-size': `${stateIllustrationDesktopSize[size]}px`,
    display: 'inline-flex', width: `var(--state-illustration-size, ${stateIllustrationSize[size]}px)`,
    height: `var(--state-illustration-size, ${stateIllustrationSize[size]}px)`,
    maxWidth: '100%', flexShrink: 0, alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle',
});

export function StateIllustrationSkeleton({ size = 'lg', style }) {
    return <span className="reserve-state-illustration" style={{ ...slotStyle(size), ...style }} aria-hidden="true">
        <Bone width="100%" height="100%" borderRadius="50%" />
    </span>;
}
StateIllustrationSkeleton.propTypes = { size: PropTypes.oneOf(['sm', 'md', 'lg']), style: PropTypes.object };
function IllustrationImage({ name, size, fallback, interactive }) {
    const picture = useRef(null);
    const [replayable, setReplayable] = useState(false);
    const [failed, setFailed] = useState(false);
    const reduced = useReducedMotion();
    const pixels = stateIllustrationSize[size] ?? stateIllustrationSize.md;
    const desktopPixels = stateIllustrationDesktopSize[size] ?? stateIllustrationDesktopSize.md;
    const src = sources[`${name}-512.webp`];
    const large = sources[`${name}-768.webp`];
    const replay = useIllustrationMotion(picture, interactive && !failed ? src : null);
    const updateReplayable = host => {
        if (!host) return;
        // An illustration inside a real action must not become a nested button.
        const action = host.parentElement?.closest('a, button, input, label, [role="button"], [role="link"], [aria-hidden="true"], [inert]');
        setReplayable(interactive && !action && !reduced && !failed && Boolean(src) && typeof host.querySelector('img')?.animate === 'function');
    }; // A fresh callback ref rechecks ancestors after every commit, including role and inert changes.
    return <span ref={updateReplayable} className="reserve-state-illustration"
        style={slotStyle(size)} aria-hidden={replayable ? undefined : true}
        role={replayable ? 'button' : undefined} tabIndex={replayable ? 0 : undefined}
        aria-label={replayable ? '일러스트 움직임 다시 보기' : undefined}
        onClick={replayable ? replay : undefined}
        onKeyDown={replayable ? event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); replay(); }
        } : undefined}>
        {failed || !src ? <span className="reserve-state-illustration__fallback" style={{ fontSize: `calc(var(--state-illustration-size, ${pixels}px) / 2)` }}>{fallback}</span>
            : <img ref={picture} src={src} srcSet={`${src} 512w, ${large} 768w`} sizes={`(min-width: 768px) ${desktopPixels}px, ${pixels}px`}
                width={pixels} height={pixels} alt="" loading="lazy" decoding="async" draggable={false}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none',
                    userSelect: 'none', transformOrigin: '50% 55%' }}
                onError={() => setFailed(true)} />}
    </span>;
}
IllustrationImage.propTypes = { name: PropTypes.string.isRequired, size: PropTypes.oneOf(['sm', 'md', 'lg']).isRequired, fallback: PropTypes.node, interactive: PropTypes.bool };

export default function StateIllustration({ name, size = 'md', fallback, interactive = name.startsWith('empty-') || STATIC_STATES.has(name) }) {
    return <IllustrationImage key={name} name={name} size={size} fallback={fallback} interactive={interactive} />;
}
StateIllustration.propTypes = { name: PropTypes.string.isRequired, size: PropTypes.oneOf(['sm', 'md', 'lg']), fallback: PropTypes.node, interactive: PropTypes.bool };
