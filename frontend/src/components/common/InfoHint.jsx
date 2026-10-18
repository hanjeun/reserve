import { useContext, useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Popover } from 'antd';
import { InfoCircleOutlined } from './icons';
import { TooltipScopeContext } from './tooltipScope';
import useInputModality from '../../hooks/useInputModality';
import useReducedMotion from '../../hooks/useReducedMotion';

/** State details can be pinned with a click or tap without changing action tooltips. */
export default function InfoHint({ label, children }) {
    const descriptionId = useId();
    const scope = useContext(TooltipScopeContext);
    const modality = useInputModality();
    const reducedMotion = useReducedMotion();
    const trigger = useRef(null);
    const popup = useRef(null);
    const timer = useRef(null);
    const focused = useRef(false);
    const [state, setState] = useState({ scope, open: false, pinned: false });
    if (state.scope !== scope) setState({ scope, open: false, pinned: false });
    const open = state.scope === scope && state.open;

    const clearTimer = () => { window.clearTimeout(timer.current); timer.current = null; };
    const reveal = () => {
        clearTimer();
        setState(current => ({ ...current, scope, open: true }));
    };
    const leave = () => {
        clearTimer();
        timer.current = window.setTimeout(() => {
            setState(current => current.pinned || focused.current ? current : { ...current, open: false });
        }, 120);
    };
    const enter = event => {
        if (event.pointerType === 'touch') return;
        clearTimer();
        timer.current = window.setTimeout(reveal, open ? 0 : 200);
    };

    useEffect(() => () => window.clearTimeout(timer.current), [scope]);
    useEffect(() => {
        const close = () => {
            window.clearTimeout(timer.current);
            timer.current = null;
            focused.current = false;
            setState(current => current.open || current.pinned ? { scope, open: false, pinned: false } : current);
        };
        const withinPopup = target => target instanceof Node && popup.current?.closest('.reserve-info-hint-popup')?.contains(target);
        const outside = event => {
            if (!trigger.current?.contains(event.target) && !withinPopup(event.target)) close();
        };
        const scroll = event => {
            if (!withinPopup(event.target)) close();
        };
        const escape = event => {
            if (event.key !== 'Escape' || !open && timer.current === null) return;
            if (open) { event.preventDefault(); event.stopPropagation(); }
            close();
        };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('focusin', outside, true);
        document.addEventListener('keydown', escape, true);
        document.addEventListener('visibilitychange', close);
        window.addEventListener('blur', close);
        window.addEventListener('scroll', scroll, true);
        return () => {
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('focusin', outside, true);
            document.removeEventListener('keydown', escape, true);
            document.removeEventListener('visibilitychange', close);
            window.removeEventListener('blur', close);
            window.removeEventListener('scroll', scroll, true);
        };
    }, [open, scope]);

    return <Popover id={descriptionId} open={open} trigger={[]} placement="topRight" destroyOnHidden fresh
        color="var(--reserve-info-hint-background)" motion={reducedMotion ? { motionName: '' } : undefined}
        classNames={{ root: 'reserve-info-hint-popup' }}
        styles={{ container: { padding: '8px 12px', borderRadius: 10, background: 'var(--reserve-info-hint-background)',
            color: 'var(--reserve-info-hint-foreground)' }, content: { color: 'inherit' } }}
        content={<div ref={popup} className="reserve-info-hint-content" onPointerEnter={event => {
            if (event.pointerType !== 'touch') reveal();
        }} onPointerLeave={leave}>{children}</div>}>
        <button ref={trigger} type="button" className="reserve-icon-tool reserve-info-hint-trigger" data-icon-kind="tool"
            aria-label={label} aria-expanded={open}
            onPointerEnter={enter} onPointerLeave={leave}
            onFocus={() => { focused.current = modality === 'keyboard'; if (modality !== 'touch') reveal(); }}
            onBlur={() => { focused.current = false; leave(); }}
            onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                clearTimer();
                setState(current => ({ scope, open: !current.pinned, pinned: !current.pinned }));
            }}>
            <InfoCircleOutlined aria-hidden="true" />
        </button>
    </Popover>;
}
InfoHint.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node.isRequired };
