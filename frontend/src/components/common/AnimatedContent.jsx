import { useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import useReducedMotion from '../../hooks/useReducedMotion';
import { IllustrationMotionScope } from '../../hooks/illustrationMotionScope';
import ListingContent from './ListingContent';

const enterOffset = {
    up: 'translateY(8px)', down: 'translateY(-8px)', left: 'translateX(-12px)', right: 'translateX(12px)',
};
const resultHeightProperty = '--reserve-result-height';

/** 표시할 결과가 바뀔 때만 전환한다. 같은 목록의 배경 재조회는 다시 흔들지 않는다. */
export default function AnimatedContent({ motionKey, ready = true, animateOnMount = false, direction = 'up', duration = 220,
    as: Component = 'div', motionTarget, keepResultsHeight = false, children, ...rest }) {
    const node = useRef(null);
    const resultHeight = useRef(0);
    const last = useRef(motionKey);
    const pending = useRef(animateOnMount);
    const running = useRef(null);
    const reduced = useReducedMotion();
    useLayoutEffect(() => {
        const element = node.current;
        if (!keepResultsHeight || !element) return undefined;
        if (!ready) {
            if (!resultHeight.current) return undefined;
            element.style.setProperty(resultHeightProperty, `${resultHeight.current}px`);
            return () => element.style.removeProperty(resultHeightProperty);
        }
        const rememberHeight = () => {
            const height = element.offsetHeight;
            if (height > 0) resultHeight.current = height;
        };
        rememberHeight();
        if (typeof ResizeObserver !== 'function') return undefined;
        const observer = new ResizeObserver(rememberHeight);
        observer.observe(element);
        return () => observer.disconnect();
    }, [keepResultsHeight, ready]);
    useLayoutEffect(() => {
        if (last.current !== motionKey) {
            last.current = motionKey;
            pending.current = true;
        }
        if (!ready || reduced) running.current?.cancel();
        if (!ready || !pending.current) return;
        pending.current = false;
        const target = motionTarget ? node.current?.querySelector(motionTarget) : node.current;
        if (reduced || typeof target?.animate !== 'function') return;
        running.current?.cancel();
        const horizontal = direction === 'left' || direction === 'right';
        running.current = target.animate([
            { opacity: 0.5, transform: enterOffset[direction] ?? enterOffset.up },
            { opacity: 1, transform: horizontal ? 'translateX(0)' : 'translateY(0)' },
        ],
            { duration, easing: 'cubic-bezier(.22,.61,.36,1)' });
    }, [motionKey, ready, reduced, direction, duration, motionTarget]);
    return <Component {...rest} ref={node} data-reserve-result-loading={keepResultsHeight && !ready || undefined}>
        <IllustrationMotionScope.Provider value={ready ? motionKey : null}>{children}</IllustrationMotionScope.Provider>
    </Component>;
}
AnimatedContent.propTypes = { motionKey: PropTypes.string.isRequired, ready: PropTypes.bool, animateOnMount: PropTypes.bool,
    as: PropTypes.elementType, direction: PropTypes.oneOf(['up', 'down', 'left', 'right']), duration: PropTypes.number,
    motionTarget: PropTypes.string, keepResultsHeight: PropTypes.bool, children: PropTypes.node };

export function AnimatedListingContent({ notice, motionKey, ready, keepResultsHeight, children }) {
    return <ListingContent notice={notice}>
        <AnimatedContent className="reserve-list-view-motion" motionKey={motionKey} ready={ready} keepResultsHeight={keepResultsHeight}>{children}</AnimatedContent>
    </ListingContent>;
}

AnimatedListingContent.propTypes = { notice: PropTypes.node, motionKey: PropTypes.string.isRequired,
    ready: PropTypes.bool, keepResultsHeight: PropTypes.bool, children: PropTypes.node };
