import { useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import FormInput from './FormInput';
import RollingFieldValue from './RollingFieldValue';

/** Only an explicit choice replacement rolls; typing keeps the native input and caret. */
export default function RollingFormInput({ value, replacementKey = 0, replacementOrder, ...props }) {
    const host = useRef(null);
    const onMotionChange = useCallback(rolling => {
        const surface = host.current;
        if (!surface) return;
        if (rolling) surface.dataset.rolling = 'true';
        else delete surface.dataset.rolling;
    }, []);
    return <div ref={host} className="reserve-rolling-form-input">
        <FormInput {...props} value={value} />
        <span className="reserve-rolling-form-input__text" aria-hidden="true">
            <RollingFieldValue value={value ?? ''} motionKey={replacementKey} order={replacementOrder} onMotionChange={onMotionChange}>
                {String(value ?? '')}
            </RollingFieldValue>
        </span>
    </div>;
}
RollingFormInput.propTypes = { value: PropTypes.string, replacementKey: PropTypes.number, replacementOrder: PropTypes.number };
