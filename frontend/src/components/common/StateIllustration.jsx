import { useState } from 'react';
import PropTypes from 'prop-types';
import useReducedMotion from '../../hooks/useReducedMotion';
import useIllustrationMotion from '../../hooks/useIllustrationMotion';
import { stateIllustrationSize, stateIllustrationDesktopSize } from '../../styles/tokens';
import Bone from './Bone';
import LoadingImage from './LoadingImage';

// 최대 112px로 표시하는 상태 그림에는 512px 원본을 사용해요.
const sources = import.meta.glob('./*-512.webp', {
    base: '../../assets/state-illustrations', eager: true, query: '?url&no-inline', import: 'default',
});
// 완료 상태는 다시 재생할 수 있지만 QR·결제 대기는 진행 표시를 유지한다.
const STATIC_STATES = new Set(['not-found', 'access-restricted', 'network-offline', 'rate-limited',
    'retry', 'server-unavailable', 'unknown-error', 'preparing', 'payment-success', 'payment-failure', 'waiting-called']);
const slotStyle = size => ({
    '--state-illustration-mobile-size': `${stateIllustrationSize[size]}px`,
    '--state-illustration-desktop-size': `${stateIllustrationDesktopSize[size]}px`,
});

export function StateIllustrationSkeleton({ size = 'lg', style }) {
    return <span className="reserve-state-illustration" style={{ ...slotStyle(size), ...style }} aria-hidden="true">
        <Bone width="100%" height="100%" borderRadius="50%" />
    </span>;
}
StateIllustrationSkeleton.propTypes = { size: PropTypes.oneOf(['sm', 'md', 'lg']), style: PropTypes.object };
function IllustrationImage({ name, size, fallback, interactive }) {
    const [replayable, setReplayable] = useState(false);
    const [failed, setFailed] = useState(false);
    const reduced = useReducedMotion();
    const pixels = stateIllustrationSize[size] ?? stateIllustrationSize.md;
    const src = failed ? undefined : sources[`./${name}-512.webp`];
    const embeddedFallback = name === 'network-offline' || name === 'server-unavailable' ? name : undefined;
    const { pictureRef, replay } = useIllustrationMotion(interactive ? src : null);
    const updateReplayable = host => {
        if (!host) return;
        // 실행 도구 안의 그림을 중첩 버튼으로 만들지 않는다.
        const action = host.parentElement?.closest('a, button, input, label, [role="button"], [role="link"], [aria-hidden="true"], [inert]');
        setReplayable(interactive && !action && !reduced && Boolean(src) && typeof host.querySelector('img')?.animate === 'function');
    }; // 커밋마다 부모의 role·inert 변경도 다시 확인한다.
    return <span ref={updateReplayable} className="reserve-state-illustration"
        style={slotStyle(size)} aria-hidden={replayable ? undefined : true}
        role={replayable ? 'button' : undefined} tabIndex={replayable ? 0 : undefined}
        aria-label={replayable ? '일러스트 움직임 다시 보기' : undefined}
        onClick={replayable ? replay : undefined}
        onKeyDown={replayable ? event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); replay(); }
        } : undefined}>
        {src ? <LoadingImage ref={pictureRef} src={src}
                width={pixels} height={pixels} alt="" loading="lazy" decoding="async" draggable={false}
                onError={() => setFailed(true)} />
            : <span className="reserve-state-illustration__fallback" data-embedded={embeddedFallback}>{!embeddedFallback && fallback}</span>}
    </span>;
}
IllustrationImage.propTypes = { name: PropTypes.string.isRequired, size: PropTypes.oneOf(['sm', 'md', 'lg']).isRequired, fallback: PropTypes.node, interactive: PropTypes.bool };

export default function StateIllustration({ name, size = 'md', fallback, interactive = name.startsWith('empty-') || STATIC_STATES.has(name) }) {
    return <IllustrationImage key={name} name={name} size={size} fallback={fallback} interactive={interactive} />;
}
StateIllustration.propTypes = { name: PropTypes.string.isRequired, size: PropTypes.oneOf(['sm', 'md', 'lg']), fallback: PropTypes.node, interactive: PropTypes.bool };
