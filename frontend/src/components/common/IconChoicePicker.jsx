import { useId } from 'react';
import PropTypes from 'prop-types';
import { Tooltip } from 'antd';
import ChoiceIllustration from './ChoiceIllustration';
import RollingFieldValue from './RollingFieldValue';

/** Industry and setup choices share tooltip, focus, selection and press feedback. */
export default function IconChoicePicker({ value, selectedValue, onChange, options, id, label, disabled, showDescription = false }) {
    const descriptionId = useId();
    const selected = selectedValue === undefined ? value : selectedValue;
    const selectedIndex = options.findIndex(option => option.value === selected);
    const description = options[selectedIndex]?.description;
    return <>
        <div id={id} className="reserve-service-domain-picker" role="group" aria-label={label}
            style={{ '--reserve-choice-columns': options.length }}>
            {options.map(option => {
                return <Tooltip key={option.value} title={option.description || `${label} · ${option.label}`} trigger={['hover', 'focus']}>
                    <button type="button" disabled={disabled} className="reserve-service-domain-option"
                        aria-label={option.label} aria-pressed={selected === option.value}
                        aria-describedby={option.description ? `${descriptionId}-${option.value}` : undefined}
                        onPointerDown={event => { event.currentTarget.dataset.pointerFocus = 'true'; }}
                        onKeyDown={event => { delete event.currentTarget.dataset.pointerFocus; }}
                        onBlur={event => { delete event.currentTarget.dataset.pointerFocus; }}
                        onClick={() => onChange?.(option.value)}>
                        <span className="reserve-service-domain-option__media" aria-hidden="true">
                            <ChoiceIllustration name={option.asset} fallback={option.icon} />
                        </span>
                        <span className="reserve-service-domain-option__label">{option.shortLabel || option.label}</span>
                        {option.description && <span id={`${descriptionId}-${option.value}`} className="reserve-discovery-visually-hidden">{option.description}</span>}
                    </button>
                </Tooltip>;
            })}
        </div>
        {showDescription && <p className="reserve-onboarding-choice-description" aria-live="polite">
            <RollingFieldValue value={description || ''} order={selectedIndex < 0 ? undefined : selectedIndex}>{description || ''}</RollingFieldValue>
        </p>}
    </>;
}
IconChoicePicker.propTypes = {
    value: PropTypes.string, selectedValue: PropTypes.string, onChange: PropTypes.func,
    options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.string.isRequired,
        shortLabel: PropTypes.string, description: PropTypes.string, asset: PropTypes.string, icon: PropTypes.node })).isRequired,
    id: PropTypes.string, label: PropTypes.string.isRequired, disabled: PropTypes.bool, showDescription: PropTypes.bool,
};
