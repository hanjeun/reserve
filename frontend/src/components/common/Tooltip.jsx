import { cloneElement, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
// This component owns the application tooltip interaction policy.
import { Tooltip as AntTooltip } from 'antd'; // eslint-disable-line no-restricted-imports
import useInputModality from '../../hooks/useInputModality';
import { getInputModality } from '../../hooks/inputModality';
import { TooltipScopeContext } from './tooltipScope';

// Event handlers are forwarded without reading their refs during rendering.
function TooltipSurface({ children, handlers, ...props }) {
    return <AntTooltip {...props}>{cloneElement(children, handlers)}</AntTooltip>;
}
TooltipSurface.propTypes = { children: PropTypes.element.isRequired, handlers: PropTypes.object.isRequired };

/** Explain controls on hover or keyboard focus without retaining a touch popup. */
export default function Tooltip({ title, children, disabled = false, ...props }) {
    const modality = useInputModality();
    const scope = useContext(TooltipScopeContext);
    const dismissed = useRef(false);
    const [state, setState] = useState({ modality, scope, open: false });
    // An old hover must not reappear after touch input switches back to a mouse.
    if (state.modality !== modality || state.scope !== scope) setState({ modality, scope, open: false });
    const open = state.modality === modality && state.scope === scope && state.open && modality !== 'touch' && !disabled;
    const close = () => { dismissed.current = true; setState({ modality: getInputModality(), scope, open: false }); };
    useLayoutEffect(() => { dismissed.current = true; }, [scope, disabled]);
    useEffect(() => {
        if (!open) return undefined;
        const dismiss = () => { dismissed.current = true; setState({ modality: getInputModality(), scope, open: false }); };
        window.addEventListener('blur', dismiss);
        window.addEventListener('scroll', dismiss, true);
        document.addEventListener('visibilitychange', dismiss);
        return () => {
            window.removeEventListener('blur', dismiss);
            window.removeEventListener('scroll', dismiss, true);
            document.removeEventListener('visibilitychange', dismiss);
        };
    }, [open, scope]);
    const handlers = {
        onMouseEnter: event => { dismissed.current = false; children.props.onMouseEnter?.(event); },
        onMouseLeave: event => { close(); children.props.onMouseLeave?.(event); },
        onFocusCapture: event => { dismissed.current = false; children.props.onFocusCapture?.(event); },
        onBlurCapture: event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); children.props.onBlurCapture?.(event); },
        onPointerDown: event => { close(); children.props.onPointerDown?.(event); },
        onClick: event => { close(); children.props.onClick?.(event); },
        onKeyDown: event => {
            if (event.key === 'Escape') close();
            children.props.onKeyDown?.(event);
        },
    };
    return <TooltipSurface handlers={handlers} {...props} title={title} open={Boolean(title) && open}
        trigger={modality === 'touch' ? [] : modality === 'keyboard' ? ['hover', 'focus'] : ['hover']}
        onOpenChange={next => setState({ modality: getInputModality(), scope, open: next && !dismissed.current && getInputModality() !== 'touch' })}
        mouseEnterDelay={0.2} mouseLeaveDelay={0} destroyOnHidden fresh>{children}</TooltipSurface>;
}
Tooltip.propTypes = { title: PropTypes.node, children: PropTypes.element.isRequired, disabled: PropTypes.bool };
