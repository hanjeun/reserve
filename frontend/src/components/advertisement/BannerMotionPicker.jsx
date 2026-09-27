import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { BANNER_MOTION_PRESETS, normalizeBannerMotionKey } from '../../constants';

const motionClass = key => key.toLowerCase().replaceAll('_', '-');

/** 저장 가능한 모션 두 개를 실제 축소 애니메이션으로 보여주는 선택 관문. */
const BannerMotionPicker = ({ value, onChange }) => {
    const selected = normalizeBannerMotionKey(value);
    const [replay, setReplay] = useState(0);

    const select = key => {
        onChange(key);
        setReplay(current => current + 1);
    };

    return (
        <div className="reserve-ad-motion-picker" role="radiogroup" aria-label="배너 등장 효과">
            {BANNER_MOTION_PRESETS.map(option => {
                const checked = selected === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        className={`reserve-ad-motion-option${checked ? ' is-selected' : ''}`}
                        onClick={() => select(option.value)}
                    >
                        <span className="reserve-ad-motion-stage" aria-hidden="true">
                            <span
                                key={`${option.value}-${checked ? replay : 0}`}
                                className={`reserve-ad-motion-demo${checked ? ` reserve-ad-motion-demo--${motionClass(option.value)}` : ''}`}
                            >
                                <span className="reserve-ad-motion-demo-image" />
                                <span className="reserve-ad-motion-demo-copy"><i /><i /></span>
                            </span>
                        </span>
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                    </button>
                );
            })}
        </div>
    );
};

BannerMotionPicker.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
};

export default BannerMotionPicker;
