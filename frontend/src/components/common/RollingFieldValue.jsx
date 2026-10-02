import React, { useLayoutEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import useReducedMotion from '../../hooks/useReducedMotion';
import { transitions } from '../../styles/tokens';

/** Only the visible value rolls; form state and the accessible current label update immediately. */
const RollingFieldValue = ({ value, children, modalOpen = false }) => {
    const currentRef = useRef(null);
    const previousRef = useRef(null);
    const snapshotRef = useRef({ value, text: children, modalOpen });
    const reducedMotion = useReducedMotion();

    useLayoutEffect(() => {
        const before = snapshotRef.current;
        snapshotRef.current = { value, text: children, modalOpen };
        const current = currentRef.current;
        const previous = previousRef.current;
        const clearPrevious = () => {
            previous.textContent = '';
            previous.style.visibility = 'hidden';
        };
        clearPrevious();
        if (reducedMotion || typeof current.animate !== 'function'
            || !Number.isFinite(value) || value === before.value) return undefined;

        const comparable = Number.isFinite(before.value);
        const direction = comparable ? Math.sign(value - before.value) : 1;
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
        ], timing);
        incoming.onfinish = clearPrevious;
        return () => {
            incoming.onfinish = null;
            incoming.cancel();
            outgoing.cancel();
            clearPrevious();
        };
    }, [value, children, reducedMotion, modalOpen]);

    return (
        <span className="reserve-rolling-field-value" style={styles.surface}>
            <span ref={currentRef} style={styles.layer}>{children}</span>
            <span ref={previousRef} aria-hidden="true" style={styles.previous} />
        </span>
    );
};

const layer = { gridArea: '1 / 1', backfaceVisibility: 'hidden' };
const styles = {
    surface: { display: 'inline-grid', overflow: 'hidden', maxWidth: '100%', verticalAlign: 'bottom', perspective: '300px', fontVariantNumeric: 'tabular-nums' },
    layer,
    previous: { ...layer, visibility: 'hidden', pointerEvents: 'none' },
};

RollingFieldValue.propTypes = {
    value: PropTypes.number,
    children: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    modalOpen: PropTypes.bool,
};

export default RollingFieldValue;
