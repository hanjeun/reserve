import { useCallback, useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import useReducedMotion from '../../hooks/useReducedMotion';
import { transitions } from '../../styles/tokens';

/** Only the visible value rolls; form state and the accessible current label update immediately. */
const RollingFieldValue = ({ value, children, modalOpen = false, motionKey, order, onMotionChange }) => {
    const currentRef = useRef(null);
    const previousRef = useRef(null);
    const snapshotRef = useRef({ value, text: children, modalOpen, motionKey, order });
    const motionRef = useRef(null);
    const motionChangeRef = useRef(onMotionChange);
    const reducedMotion = useReducedMotion();

    const stopMotion = useCallback(() => {
        const motion = motionRef.current;
        motionRef.current = null;
        if (motion) {
            motion.incoming.onfinish = null;
            motion.outgoing.onfinish = null;
            motion.incoming.cancel();
            motion.outgoing.cancel();
        }
        const previous = previousRef.current;
        if (previous) {
            previous.textContent = '';
            previous.style.visibility = 'hidden';
        }
        motionChangeRef.current?.(false);
    }, []);
    useLayoutEffect(() => stopMotion, [stopMotion]);

    useLayoutEffect(() => {
        const before = snapshotRef.current;
        snapshotRef.current = { value, text: children, modalOpen, motionKey, order };
        motionChangeRef.current = onMotionChange;
        const current = currentRef.current;
        const previous = previousRef.current;
        if (reducedMotion || typeof current.animate !== 'function' || value == null
            || (typeof value === 'number' && !Number.isFinite(value))) {
            stopMotion();
            return;
        }
        if (value === before.value) {
            if (modalOpen !== before.modalOpen) stopMotion();
            return;
        }
        // Native typing interrupts an explicit replacement and keeps the caret immediate.
        if (motionKey !== undefined && motionKey === before.motionKey) {
            stopMotion();
            return;
        }
        // Rapid choices update the current text in the same cycle instead of replaying it.
        const active = motionRef.current?.incoming;
        if (active && (active.playState === 'running' || active.pending)) {
            if (value === motionRef.current.fromValue) stopMotion();
            return;
        }
        stopMotion();

        const numeric = Number.isFinite(value) && Number.isFinite(before.value);
        const comparable = before.value != null && before.value !== '' && (typeof before.value !== 'number' || Number.isFinite(before.value));
        const ordered = Number.isFinite(order) && Number.isFinite(before.order) && order !== before.order;
        // 메뉴에서 위 항목은 위로, 아래 항목은 아래로 들어온다. 숫자·날짜의 기존 방향은 유지한다.
        let direction = numeric ? Math.sign(value - before.value) : 1;
        if (ordered) direction = Math.sign(before.order - order);
        previous.textContent = String(before.text);
        previous.style.visibility = 'visible';
        const duration = Number.parseFloat(transitions.fast) * 1000;
        const timing = { duration, easing: transitions.easing, delay: before.modalOpen && !modalOpen ? duration : 0, fill: 'backwards' };
        const centered = { transform: 'translateY(0) rotateX(0deg)', opacity: 1 };
        const incoming = current.animate([
            { transform: `translateY(${direction * (comparable ? 70 : 20)}%) rotateX(${comparable ? -direction * 25 : 0}deg)`, opacity: 0 },
            centered,
        ], timing);
        const outgoing = previous.animate([
            centered,
            { transform: `translateY(${comparable ? -direction * 70 : 0}%) rotateX(${comparable ? direction * 25 : 0}deg)`, opacity: 0 },
        ], { ...timing, fill: 'both' });
        motionRef.current = { incoming, outgoing, fromValue: before.value };
        // Keep the old layer transparent until cleanup, including a delayed finish event.
        outgoing.onfinish = () => {
            if (motionRef.current?.outgoing === outgoing) previous.style.visibility = 'hidden';
        };
        incoming.onfinish = () => {
            if (motionRef.current?.incoming === incoming) stopMotion();
        };
        motionChangeRef.current?.(true);
    }, [value, children, reducedMotion, modalOpen, motionKey, order, onMotionChange, stopMotion]);

    return (
        <span className="reserve-rolling-field-value" style={styles.surface}>
            <span ref={currentRef} style={styles.layer}>{children}</span>
            <span ref={previousRef} aria-hidden="true" style={styles.previous} />
        </span>
    );
};

const layer = { gridArea: '1 / 1', backfaceVisibility: 'hidden' };
const styles = {
    // 이전 값은 크기 계산에서 빼고, 값 교체의 레이아웃·페인트 범위를 이 칸 안에 둔다.
    surface: { position: 'relative', display: 'inline-grid', contain: 'layout paint', overflow: 'hidden', maxWidth: '100%', verticalAlign: 'bottom', perspective: '300px', fontVariantNumeric: 'tabular-nums' },
    layer,
    previous: { ...layer, position: 'absolute', inset: 0, whiteSpace: 'nowrap', visibility: 'hidden', pointerEvents: 'none' },
};

RollingFieldValue.propTypes = {
    value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    children: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    modalOpen: PropTypes.bool,
    motionKey: PropTypes.number,
    order: PropTypes.number,
    onMotionChange: PropTypes.func,
};

export default RollingFieldValue;
