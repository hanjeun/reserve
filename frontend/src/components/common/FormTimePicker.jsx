/**
 * RESERVE Design System - FormTimePicker Component
 *
 * 사용법:
 * <FormTimePicker placeholder="시간 선택" />
 * <FormTimePicker.RangePicker />   // 영업시간, 브레이크타임 등
 */

import React from 'react';
import PropTypes from 'prop-types';
import { TimePicker } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { colors, radius, heights } from '../../styles/tokens';
import { pickerSuffix, hasPickerValue } from './pickerSuffix';

const baseStyle = (disabled, extra = {}) => ({
    width: '100%',
    height: heights.input,
    borderRadius: radius.lg,
    backgroundColor: disabled ? colors.gray[100] : colors.gray[50],
    border: 'none',
    ...extra,
});

const FormTimePicker = ({ placeholder = '시간 선택', disabled = false, format = 'HH:mm', style, ...rest }) => (
    <TimePicker
        placeholder={placeholder}
        disabled={disabled}
        format={format}
        variant="filled"
        size="large"
        style={baseStyle(disabled, style)}
        suffixIcon={pickerSuffix(ClockCircleOutlined, hasPickerValue(rest.value), disabled)}
        {...rest}
    />
);

/**
 * 시간 범위 선택 (영업시간, 브레이크타임 등)
 *
 * [접근성] Ant Design v6 RangePicker는 두 개의 input을 렌더링하므로
 * id를 단순 문자열로 받으면 label for 연결이 끊김.
 * { start: id } 형태로 변환해 start input에만 연결.
 */
FormTimePicker.RangePicker = ({ disabled = false, format = 'HH:mm', style, id, ...rest }) => (
    <TimePicker.RangePicker
        disabled={disabled}
        format={format}
        variant="filled"
        size="large"
        style={baseStyle(disabled, style)}
        suffixIcon={pickerSuffix(ClockCircleOutlined, hasPickerValue(rest.value), disabled)}
        id={id ? { start: id } : undefined}
        {...rest}
    />
);

FormTimePicker.propTypes = {
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    format: PropTypes.string,
    style: PropTypes.object,
};

FormTimePicker.RangePicker.propTypes = {
    disabled: PropTypes.bool,
    format: PropTypes.string,
    style: PropTypes.object,
    id: PropTypes.string,
};

export default FormTimePicker;
