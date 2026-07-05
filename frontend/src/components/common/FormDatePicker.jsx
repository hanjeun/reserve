/**
 * RESERVE Design System - FormDatePicker Component
 * 
 * 사용법:
 * <FormDatePicker placeholder="날짜 선택" />
 */

import React from 'react';
import PropTypes from 'prop-types';
import { DatePicker } from 'antd';
import { colors, radius, heights } from '../../styles/tokens';

const FormDatePicker = ({ 
    placeholder = "날짜 선택",
    disabled = false,
    format = "YYYY-MM-DD",
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
        <DatePicker
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

FormDatePicker.propTypes = {
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    format: PropTypes.string,
    style: PropTypes.object,
};

export default FormDatePicker;
