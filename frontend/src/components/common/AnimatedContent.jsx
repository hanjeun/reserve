import { useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import useReducedMotion from '../../hooks/useReducedMotion';
import { IllustrationMotionScope } from '../../hooks/illustrationMotionScope';

const enterOffset = {
    up: 'translateY(8px)', down: 'translateY(-8px)', left: 'translateX(-12px)', right: 'translateX(12px)',
};

/** 표시할 결과가 바뀔 때만 전환한다. 같은 목록의 배경 재조회는 다시 흔들지 않는다. */
export default function AnimatedContent({ motionKey, ready = true, animateOnMount = false, direction = 'up', duration = 220, as: Component = 'div', children, ...rest }) {
    const node = useRef(null);
    const last = useRef(motionKey);
    const pending = useRef(animateOnMount);
    const running = useRef(null);
    const reduced = useReducedMotion();
    useLayoutEffect(() => {
        if (last.current !== motionKey) {
            last.current = motionKey;
            pending.current = true;
        }
        if (!ready || reduced) running.current?.cancel();
        if (!ready || !pending.current) return;
        pending.current = false;
        if (reduced || typeof node.current?.animate !== 'function') return;
        running.current?.cancel();
        const horizontal = direction === 'left' || direction === 'right';
        running.current = node.current.animate([
            { opacity: 0.5, transform: enterOffset[direction] ?? enterOffset.up },
            { opacity: 1, transform: horizontal ? 'translateX(0)' : 'translateY(0)' },
        ],
            { duration, easing: 'cubic-bezier(.22,.61,.36,1)' });
    }, [motionKey, ready, reduced, direction, duration]);
    return <Component {...rest} ref={node}><IllustrationMotionScope.Provider value={ready ? motionKey : null}>{children}</IllustrationMotionScope.Provider></Component>;
}
AnimatedContent.propTypes = { motionKey: PropTypes.string.isRequired, ready: PropTypes.bool, animateOnMount: PropTypes.bool,
    as: PropTypes.elementType, direction: PropTypes.oneOf(['up', 'down', 'left', 'right']), duration: PropTypes.number, children: PropTypes.node };
