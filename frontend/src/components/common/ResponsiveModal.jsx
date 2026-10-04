import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'antd';
import { fillRef } from '@rc-component/util';
import useReducedMotion from '../../hooks/useReducedMotion';
import { breakpoints, mq } from '../../styles/tokens';

const MOBILE_QUERY = mq.below(breakpoints.card);
const mobileSnapshot = () => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches;
const subscribeMobile = callback => {
    if (typeof window.matchMedia !== 'function') return () => {};
    const media = window.matchMedia(MOBILE_QUERY);
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
};

/** AntD owns the portal, focus trap and close lifecycle; mobile changes only the surface. */
export default function ResponsiveModal({
    mobileSize = 'content', mobileSheet = true, open, title, rootClassName,
    panelRef: forwardedPanelRef, afterOpenChange, transitionName, maskTransitionName,
    ...modalProps
}) {
    const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, () => false);
    const reducedMotion = useReducedMotion();
    const panelRef = useRef(null);
    const titleRef = useRef(null);
    const focusFrame = useRef(null);
    const initialFocusPending = useRef(false);
    const syncViewport = useRef(null);
    const openRef = useRef(open);
    const forwardedRef = useRef(forwardedPanelRef);

    const focusInitialContent = useCallback(() => {
        const panel = panelRef.current;
        if (!openRef.current || !panel || !initialFocusPending.current) return;
        initialFocusPending.current = false;
        const active = document.activeElement;
        // Preserve an input explicitly focused by the caller or a user during entry.
        if (panel.contains(active) && active !== panel && !active.matches('.ant-modal-close')) return;
        (titleRef.current ?? panel).focus({ preventScroll: true });
    }, []);

    const setPanelRef = useCallback(panel => {
        panelRef.current = panel;
        fillRef(forwardedRef.current, panel);
        if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
        if (panel) {
            initialFocusPending.current = true;
            // Wait for rc-dialog to record the trigger before moving initial focus.
            focusFrame.current = requestAnimationFrame(focusInitialContent);
        }
    }, [focusInitialContent]);

    useEffect(() => {
        if (forwardedRef.current === forwardedPanelRef) return;
        fillRef(forwardedRef.current, null);
        forwardedRef.current = forwardedPanelRef;
        fillRef(forwardedPanelRef, panelRef.current);
    }, [forwardedPanelRef]);

    useEffect(() => {
        openRef.current = open;
        initialFocusPending.current = !!open;
        if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
        if (open) focusFrame.current = requestAnimationFrame(focusInitialContent);
    }, [open, focusInitialContent]);

    useEffect(() => () => {
        if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    }, []);

    useEffect(() => {
        if (!open || !mobile || !mobileSheet) return undefined;
        const viewport = window.visualViewport;
        let frame;
        let surface;
        const sync = () => {
            surface = panelRef.current?.closest('.ant-modal-root');
            if (!surface || !viewport) return;
            // DOM variables avoid rerendering the form as Safari opens or pans its keyboard.
            surface.style.setProperty('--reserve-modal-viewport-height', `${viewport.height}px`);
            surface.style.setProperty('--reserve-modal-viewport-top', `${viewport.offsetTop}px`);
            const body = panelRef.current.querySelector('.ant-modal-body');
            const active = document.activeElement;
            if (!body?.contains(active) || !active.matches('input, textarea, [contenteditable="true"]')) return;
            const bounds = body.getBoundingClientRect();
            const field = active.getBoundingClientRect();
            if (field.bottom > bounds.bottom - 12) body.scrollTop += field.bottom - bounds.bottom + 12;
            else if (field.top < bounds.top + 12) body.scrollTop += field.top - bounds.top - 12;
        };
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(sync);
        };
        syncViewport.current = schedule;
        viewport?.addEventListener('resize', schedule);
        viewport?.addEventListener('scroll', schedule);
        window.addEventListener('resize', schedule);
        document.addEventListener('focusin', schedule);
        schedule();
        return () => {
            cancelAnimationFrame(frame);
            viewport?.removeEventListener('resize', schedule);
            viewport?.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            document.removeEventListener('focusin', schedule);
            surface?.style.removeProperty('--reserve-modal-viewport-height');
            surface?.style.removeProperty('--reserve-modal-viewport-top');
            syncViewport.current = null;
        };
    }, [open, mobile, mobileSheet]);

    const sheet = mobile && mobileSheet;
    const classes = [rootClassName, 'reserve-responsive-modal-root', mobileSheet && 'reserve-modal-sheet-root',
        mobileSheet && `reserve-modal-sheet-${mobileSize}`].filter(Boolean).join(' ');

    return (
        <Modal
            {...modalProps}
            open={open}
            rootClassName={classes}
            panelRef={setPanelRef}
            title={title ? <div ref={titleRef} tabIndex={-1} className="reserve-responsive-modal-title">{title}</div> : title}
            transitionName={sheet ? (reducedMotion ? '' : 'reserve-modal-sheet-motion') : transitionName}
            maskTransitionName={sheet && reducedMotion ? '' : maskTransitionName}
            afterOpenChange={visible => {
                if (visible) {
                    focusInitialContent();
                    syncViewport.current?.();
                }
                afterOpenChange?.(visible);
            }}
        />
    );
}

ResponsiveModal.propTypes = {
    mobileSize: PropTypes.oneOf(['content', 'tall', 'form']),
    mobileSheet: PropTypes.bool,
    open: PropTypes.bool,
    title: PropTypes.node,
    rootClassName: PropTypes.string,
    panelRef: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
    afterOpenChange: PropTypes.func,
    transitionName: PropTypes.string,
    maskTransitionName: PropTypes.string,
};
