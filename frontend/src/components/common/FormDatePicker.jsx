/**
 * RESERVE Design System - FormDatePicker Component
 * 
 * 사용법:
 * <FormDatePicker placeholder="날짜 선택" />
 * <FormDatePicker.RangePicker />   // 광고 노출 기간 등
 */

import React from 'react';
import PropTypes from 'prop-types';
import { DatePicker } from 'antd';
import { colors, radius, heights } from '../../styles/tokens';

const baseStyle = (disabled, extra = {}) => ({
    width: '100%',
    height: heights.input,
    borderRadius: radius.lg,
    backgroundColor: disabled ? colors.gray[100] : colors.gray[50],
    border: 'none',
    ...extra,
});

const FormDatePicker = ({ 
    placeholder = "날짜 선택",
    disabled = false,
    format = "YYYY-MM-DD",
    style,
    ...rest 
}) => (
    <DatePicker
        placeholder={placeholder}
        disabled={disabled}
        format={format}
        variant="filled"
        size="large"
        style={baseStyle(disabled, style)}
        {...rest}
    />
);

/**
 * 날짜 범위 선택 (광고 노출 기간 등)
 *
 * [접근성] Ant Design v6 RangePicker는 두 개의 input을 렌더링하므로
 * id를 단순 문자열로 받으면 label for 연결이 끊김. FormTimePicker.RangePicker와 동일하게
 * { start: id } 형태로 변환해 start input에만 연결.
 */
FormDatePicker.RangePicker = ({ disabled = false, format = 'YYYY-MM-DD', style, id, ...rest }) => (
    <DatePicker.RangePicker
        disabled={disabled}
        format={format}
        variant="filled"
        size="large"
        style={baseStyle(disabled, style)}
        id={id ? { start: id } : undefined}
        {...rest}
    />
);

FormDatePicker.propTypes = {
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    format: PropTypes.string,
    style: PropTypes.object,
};

FormDatePicker.RangePicker.propTypes = {
    disabled: PropTypes.bool,
    format: PropTypes.string,
    style: PropTypes.object,
    id: PropTypes.string,
};

export default FormDatePicker;
