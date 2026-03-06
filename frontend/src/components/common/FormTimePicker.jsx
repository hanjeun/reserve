/**
 * RESERVE Design System - FormTimePicker Component
 * 
 * 사용법:
 * <FormTimePicker placeholder="시간 선택" />
 * <FormTimePicker.RangePicker /> // 영업시간 등
 */

import React from 'react';
import { TimePicker } from 'antd';
import { colors, radius, heights } from '../../styles/tokens';

const FormTimePicker = ({ 
    placeholder = "시간 선택",
    disabled = false,
    format = "HH:mm",
    style,
    ...rest 
}) => {
    const pickerStyle = {
        width: '100%',
        height: heights.input,
        borderRadius: radius.lg,
        backgroundColor: disabled ? colors.gray[100] : colors.gray[50],
        border: 'none',
        ...style,
    };

    return (
        <TimePicker
            placeholder={placeholder}
            disabled={disabled}
            format={format}
            variant="filled"
            size="large"
            style={pickerStyle}
            {...rest}
        />
    );
};

/**
 * 시간 범위 선택 (영업시간 등)
 */
FormTimePicker.RangePicker = ({ 
    disabled = false,
    format = "HH:mm",
    style,
    ...rest 
}) => {
    const pickerStyle = {
        width: '100%',
        height: heights.input,
        borderRadius: radius.lg,
        backgroundColor: disabled ? colors.gray[100] : colors.gray[50],
        border: 'none',
        ...style,
    };

    return (
        <TimePicker.RangePicker
            disabled={disabled}
            format={format}
            variant="filled"
            size="large"
            style={pickerStyle}
            {...rest}
        />
    );
};

export default FormTimePicker;
