import { useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import useReducedMotion from '../../hooks/useReducedMotion';
import { IllustrationMotionScope } from '../../hooks/illustrationMotionScope';

/** 사용자 선택이 바뀐 결과만 전환한다. 같은 목록의 배경 재조회는 다시 흔들지 않는다. */
export default function AnimatedContent({ motionKey, ready = true, children, ...rest }) {
    const node = useRef(null);
    const last = useRef(motionKey);
    const pending = useRef(false);
    const reduced = useReducedMotion();
    useLayoutEffect(() => {
        if (last.current !== motionKey) {
            last.current = motionKey;
            pending.current = true;
        }
        if (!ready || !pending.current) return undefined;
        pending.current = false;
        if (reduced || typeof node.current?.animate !== 'function') return undefined;
        const motion = node.current.animate([{ opacity: 0.5, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 220, easing: 'cubic-bezier(.22,.61,.36,1)' });
        return () => motion.cancel();
    }, [motionKey, ready, reduced]);
    return <div {...rest} ref={node}><IllustrationMotionScope.Provider value={ready ? motionKey : null}>{children}</IllustrationMotionScope.Provider></div>;
}
AnimatedContent.propTypes = { motionKey: PropTypes.string.isRequired, ready: PropTypes.bool, children: PropTypes.node };
