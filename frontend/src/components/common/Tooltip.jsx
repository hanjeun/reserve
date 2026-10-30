import { cloneElement, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Tooltip as AntTooltip } from 'antd'; // eslint-disable-line no-restricted-imports
import useInputModality from '../../hooks/useInputModality';
import { getInputModality } from '../../hooks/inputModality';
import { TooltipScopeContext } from './tooltipScope';

const TRIGGERS = ['hover'];

function TooltipSurface({ children, handlers, ...props }) {
    return <AntTooltip {...props}>{cloneElement(children, handlers)}</AntTooltip>;
}
TooltipSurface.propTypes = { children: PropTypes.element.isRequired, handlers: PropTypes.object.isRequired };

/* 짧은 실행 설명만 길게 누르기로 표시하며 링크의 기본 길게 누르기는 보존한다. */
export default function Tooltip({ title, children, disabled = false, ...props }) {
    const modality = useInputModality();
    const scope = useContext(TooltipScopeContext);
    const enabled = !disabled && Boolean(title);
    const dismissed = useRef(false);
    const press = useRef(null);
    const suppressClick = useRef(false);
    const [state, setState] = useState({ modality, scope, enabled, open: false, held: false });
    if (state.modality !== modality || state.scope !== scope || state.enabled !== enabled) setState({ modality, scope, enabled, open: false, held: false });
    const open = state.modality === modality && state.scope === scope && state.open
        && (modality !== 'touch' || state.held) && !disabled;
    const clearPress = useCallback(() => {
        press.current?.dispose();
        press.current = null;
    }, []);
    const close = useCallback(() => {
        clearPress();
        dismissed.current = true;
        setState({ modality: getInputModality(), scope, enabled, open: false, held: false });
    }, [clearPress, scope, enabled]);
    useLayoutEffect(() => {
        dismissed.current = true;
        clearPress();
        suppressClick.current = false;
        return clearPress;
    }, [scope, disabled, clearPress]);
    useEffect(() => {
        if (!open) return undefined;
        window.addEventListener('blur', close);
        window.addEventListener('scroll', close, true);
        document.addEventListener('visibilitychange', close);
        return () => {
            window.removeEventListener('blur', close);
            window.removeEventListener('scroll', close, true);
            document.removeEventListener('visibilitychange', close);
        };
    }, [open, close]);
    const beginPress = event => {
        close();
        suppressClick.current = false;
        children.props.onPointerDown?.(event);
        if (event.defaultPrevented || event.pointerType !== 'touch' || disabled || !title
            || event.target.closest?.('a[href]')) return;
        const target = event.currentTarget;
        const gesture = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        const end = next => { if (next.pointerId === gesture.pointerId) close(); };
        const move = next => {
            if (next.pointerId === gesture.pointerId && Math.hypot(next.clientX - gesture.x, next.clientY - gesture.y) > 10) close();
        };
        const timer = setTimeout(() => {
            if (press.current !== gesture || !target.isConnected || document.visibilityState === 'hidden'
                || getInputModality() !== 'touch') return;
            dismissed.current = false;
            suppressClick.current = true;
            setState({ modality: 'touch', scope, enabled, open: true, held: true });
        }, 500);
        gesture.dispose = () => {
            clearTimeout(timer);
            document.removeEventListener('pointerup', end, true);
            document.removeEventListener('pointercancel', end, true);
            document.removeEventListener('pointermove', move, true);
            document.removeEventListener('visibilitychange', close);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('blur', close);
        };
        press.current = gesture;
        document.addEventListener('pointerup', end, true);
        document.addEventListener('pointercancel', end, true);
        document.addEventListener('pointermove', move, true);
        document.addEventListener('visibilitychange', close);
        window.addEventListener('scroll', close, true);
        window.addEventListener('blur', close);
    };
    const handlers = {
        onMouseEnter: event => { dismissed.current = false; children.props.onMouseEnter?.(event); },
        onMouseLeave: event => { children.props.onMouseLeave?.(event); },
        onFocusCapture: event => {
            const keyboard = getInputModality() === 'keyboard';
            dismissed.current = !keyboard;
            if (keyboard && enabled) setState({ modality: 'keyboard', scope, enabled, open: true, held: false });
            children.props.onFocusCapture?.(event);
        },
        onBlurCapture: event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); children.props.onBlurCapture?.(event); },
        onPointerDown: beginPress,
        onClickCapture: event => {
            if (suppressClick.current) {
                suppressClick.current = false;
                event.preventDefault();
                event.stopPropagation();
                close();
            } else children.props.onClickCapture?.(event);
        },
        onContextMenu: event => {
            if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); return; }
            children.props.onContextMenu?.(event);
        },
        onClick: event => { close(); children.props.onClick?.(event); },
        onKeyDown: event => {
            clearPress();
            suppressClick.current = false;
            if (event.key === 'Escape') close();
            children.props.onKeyDown?.(event);
        },
    };
    return <TooltipSurface handlers={handlers} {...props} title={title} open={Boolean(title) && open}
        trigger={TRIGGERS}
        onOpenChange={next => setState({ modality: getInputModality(), scope, enabled, held: false,
            open: next && enabled && !dismissed.current && getInputModality() !== 'touch' })}
        mouseEnterDelay={0.2} mouseLeaveDelay={0.1} destroyOnHidden fresh>{children}</TooltipSurface>;
}
Tooltip.propTypes = { title: PropTypes.node, children: PropTypes.element.isRequired, disabled: PropTypes.bool };
