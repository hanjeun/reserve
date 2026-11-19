import { useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';

export default function CollapsibleContent({ open, id, bodyClassName, retainHeight = false, children, ...rest }) {
    const reduced = useReducedMotion();
    const { shouldRender } = useExitAnimation(open, reduced ? 0 : 200, !reduced);
    const visible = open || !reduced && shouldRender;
    const container = useRef(null);
    const body = useRef(null);
    useLayoutEffect(() => {
        if (!open || !retainHeight || reduced) return undefined;
        const node = body.current;
        const outer = container.current;
        const measure = () => outer.style.setProperty('--reserve-collapse-height', `${node.offsetHeight}px`);
        measure();
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
        observer?.observe(node);
        return () => observer?.disconnect();
    }, [open, retainHeight, reduced]);
    if (!visible && !id) return null;
    return <div {...rest} ref={container} id={id} className="reserve-collapse-motion" hidden={!visible}
        data-closing={!open || undefined} inert={!open || undefined}>
        {visible && <div className="reserve-collapse-clip"><div ref={body} className={bodyClassName}>{children}</div></div>}
    </div>;
}
CollapsibleContent.propTypes = { open: PropTypes.bool.isRequired, id: PropTypes.string,
    bodyClassName: PropTypes.string, retainHeight: PropTypes.bool, children: PropTypes.node };
