import { cloneElement, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import { Tooltip as AntTooltip } from 'antd'; // eslint-disable-line no-restricted-imports
import useInputModality from '../../hooks/useInputModality';
import { getInputModality } from '../../hooks/inputModality';
import { TooltipScopeContext } from './tooltipScope';

// 렌더 중 ref를 읽지 않고 이벤트 처리기를 전달한다.
function TooltipSurface({ children, handlers, ...props }) {
    return <AntTooltip {...props}>{cloneElement(children, handlers)}</AntTooltip>;
}
TooltipSurface.propTypes = { children: PropTypes.element.isRequired, handlers: PropTypes.object.isRequired };

/* 호버·키보드 포커스에서 안내하고 터치 팝업은 남기지 않는다. */
export default function Tooltip({ title, children, disabled = false, ...props }) {
    const modality = useInputModality();
    const scope = useContext(TooltipScopeContext);
    const dismissed = useRef(false);
    const [state, setState] = useState({ modality, scope, open: false });
    // 터치 뒤 마우스로 전환할 때 이전 호버가 다시 나타나지 않게 한다.
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
