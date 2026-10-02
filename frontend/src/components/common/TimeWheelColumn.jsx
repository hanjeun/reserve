import React, { useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react';
import useReducedMotion from '../../hooks/useReducedMotion';
import { transitions } from '../../styles/tokens';

export const TIME_WHEEL_ROW_HEIGHT = 44;
const ROW_HEIGHT = TIME_WHEEL_ROW_HEIGHT;
const SNAP_DURATION = Number.parseFloat(transitions.fast) * 1000;
const clamp = (value, maximum) => Math.max(0, Math.min(maximum, value));
const stopMotion = (motionRef, scroller) => {
    if (!motionRef.current) return;
    cancelAnimationFrame(motionRef.current.frame);
    motionRef.current = null;
    if (scroller) scroller.style.scrollSnapType = '';
};

/** Native scrolling keeps touch momentum and wheel/trackpad input on the same selection path. */
const TimeWheelColumn = ({ label, options, value, onChange }) => {
    const id = useId();
    const scrollerRef = useRef(null);
    const lastValueRef = useRef(null);
    const dragRef = useRef(null);
    const suppressClickRef = useRef(false);
    const touchActiveRef = useRef(false);
    const settleTimerRef = useRef(null);
    const motionRef = useRef(null);
    const changeRef = useRef(onChange);
    const reducedMotion = useReducedMotion();
    const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));

    useLayoutEffect(() => { changeRef.current = onChange; }, [onChange]);
    useEffect(() => () => {
        clearTimeout(settleTimerRef.current);
        stopMotion(motionRef, scrollerRef.current);
    }, []);

    useEffect(() => {
        if (!reducedMotion || !motionRef.current) return;
        const scroller = scrollerRef.current;
        scroller.scrollTop = motionRef.current.to;
        stopMotion(motionRef, scroller);
    }, [reducedMotion]);

    const selectIndex = index => {
        const next = options[clamp(index, options.length - 1)].value;
        lastValueRef.current = next;
        changeRef.current(next);
    };

    const alignIndex = useCallback(index => {
        const scroller = scrollerRef.current;
        const to = clamp(index, options.length - 1) * ROW_HEIGHT;
        const from = scroller.scrollTop;
        clearTimeout(settleTimerRef.current);
        stopMotion(motionRef, scroller);
        if (reducedMotion || Math.abs(to - from) < 1) {
            scroller.scrollTop = to;
            scroller.style.scrollSnapType = '';
            return;
        }
        // Only explicit picks and the final snap animate; direct manipulation stays native.
        const motion = { from, to, start: null, frame: null };
        motionRef.current = motion;
        scroller.style.scrollSnapType = 'none';
        const step = now => {
            if (motionRef.current !== motion) return;
            motion.start ??= now;
            const progress = Math.min(1, (now - motion.start) / SNAP_DURATION);
            const eased = 1 - (1 - progress) ** 3;
            scroller.scrollTop = motion.from + (motion.to - motion.from) * eased;
            if (progress < 1) {
                motion.frame = requestAnimationFrame(step);
            } else {
                scroller.scrollTop = motion.to;
                motionRef.current = null;
                scroller.style.scrollSnapType = '';
            }
        };
        motion.frame = requestAnimationFrame(step);
    }, [options.length, reducedMotion]);

    useLayoutEffect(() => {
        const scroller = scrollerRef.current;
        const align = () => {
            // AntD mounts modal children before the opening surface has a measurable height.
            if (!scroller.clientHeight || lastValueRef.current === value) return;
            const initialized = lastValueRef.current !== null;
            lastValueRef.current = value;
            if (initialized) {
                alignIndex(selectedIndex);
            } else {
                scroller.scrollTop = selectedIndex * ROW_HEIGHT;
            }
        };
        align();
        const observer = new ResizeObserver(align);
        observer.observe(scroller);
        return () => observer.disconnect();
    }, [alignIndex, selectedIndex, value]);

    const pickIndex = index => {
        selectIndex(index);
        alignIndex(index);
        scrollerRef.current.focus({ preventScroll: true });
    };

    const interruptMotion = () => {
        if (!motionRef.current) return;
        const scroller = scrollerRef.current;
        stopMotion(motionRef, scroller);
        selectIndex(Math.round(scroller.scrollTop / ROW_HEIGHT));
    };

    const queueSettle = () => {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = setTimeout(() => {
            if (motionRef.current || touchActiveRef.current || dragRef.current?.moved || lastValueRef.current === null) return;
            const scroller = scrollerRef.current;
            const index = clamp(Math.round(scroller.scrollTop / ROW_HEIGHT), options.length - 1);
            // Some touch engines stop between snap points. Wait until momentum has stopped before aligning.
            if (options[index].value !== lastValueRef.current) selectIndex(index);
            alignIndex(index);
        }, 160);
    };

    const onScroll = event => {
        if (motionRef.current || lastValueRef.current === null) return;
        const index = clamp(Math.round(event.currentTarget.scrollTop / ROW_HEIGHT), options.length - 1);
        if (options[index].value !== lastValueRef.current) selectIndex(index);
        queueSettle();
    };

    const onKeyDown = event => {
        let index;
        switch (event.key) {
            case 'ArrowUp': index = selectedIndex - 1; break;
            case 'ArrowDown': index = selectedIndex + 1; break;
            case 'PageUp': index = selectedIndex - 5; break;
            case 'PageDown': index = selectedIndex + 5; break;
            case 'Home': index = 0; break;
            case 'End': index = options.length - 1; break;
            default: return;
        }
        event.preventDefault();
        pickIndex(index);
    };

    const onPointerDown = event => {
        suppressClickRef.current = false;
        interruptMotion();
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        dragRef.current = { y: event.clientY, top: event.currentTarget.scrollTop, moved: false };
    };

    const onPointerMove = event => {
        const drag = dragRef.current;
        if (!drag || event.buttons !== 1) return;
        const distance = drag.y - event.clientY;
        if (!drag.moved && Math.abs(distance) < 4) return;
        if (!drag.moved) {
            drag.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.style.scrollSnapType = 'none';
            event.currentTarget.dataset.dragging = 'true';
        }
        event.preventDefault();
        event.currentTarget.scrollTop = drag.top + distance;
    };

    const finishDrag = event => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag?.moved) return;
        const scroller = event.currentTarget;
        delete scroller.dataset.dragging;
        suppressClickRef.current = event.type !== 'pointercancel';
        pickIndex(Math.round(scroller.scrollTop / ROW_HEIGHT));
        if (scroller.hasPointerCapture(event.pointerId)) scroller.releasePointerCapture(event.pointerId);
    };

    return (
        <div className="reserve-time-column">
            <span className="reserve-time-column-label" aria-hidden="true">{label}</span>
            <div
                ref={scrollerRef}
                role="listbox"
                aria-label={label}
                aria-orientation="vertical"
                aria-activedescendant={`${id}-${selectedIndex}`}
                tabIndex={0}
                className="reserve-time-wheel"
                style={{ '--reserve-time-row-height': `${ROW_HEIGHT}px` }}
                onScroll={onScroll}
                onWheel={interruptMotion}
                onKeyDown={onKeyDown}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                onLostPointerCapture={finishDrag}
                onTouchStart={() => {
                    interruptMotion();
                    touchActiveRef.current = true;
                    clearTimeout(settleTimerRef.current);
                }}
                onTouchEnd={() => { touchActiveRef.current = false; queueSettle(); }}
                onTouchCancel={() => { touchActiveRef.current = false; queueSettle(); }}
                onClickCapture={event => {
                    if (!suppressClickRef.current) return;
                    suppressClickRef.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                }}
            >
                {options.map((option, index) => (
                    <button
                        key={option.value}
                        id={`${id}-${index}`}
                        type="button"
                        role="option"
                        aria-selected={option.value === value}
                        tabIndex={-1}
                        className="reserve-time-option"
                        onClick={() => pickIndex(index)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default TimeWheelColumn;
