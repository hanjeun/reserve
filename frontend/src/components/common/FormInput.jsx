/**
 * RESERVE Design System - FormInput Component
 * 
 * 사용법:
 * <FormInput placeholder="이메일 주소" />
 * <FormInput type="password" placeholder="비밀번호" />
 * <FormInput type="number" suffix="원" />
 * <FormInput disabled />
 */

import React from 'react';
import { Input, InputNumber } from 'antd';
import { colors, radius, heights } from '../../styles/tokens';

const FormInput = ({ 
    type = 'text',
    placeholder,
    disabled = false,
    suffix,
    prefix,
    maxLength,
    id,
    style,
    ...rest 
}) => {
    const baseStyle = {
        borderRadius: radius.lg,
        height: heights.input,
        backgroundColor: disabled ? colors.gray[100] : colors.gray[50],
        border: 'none',
        paddingLeft: 12,
        paddingRight: 12,
        ...style,
    };

    // 비밀번호 타입
    if (type === 'password') {
        return (
            <Input.Password
                id={id}
                placeholder={placeholder}
                disabled={disabled}
                variant="filled"
                style={baseStyle}
                maxLength={maxLength}
                {...rest}
            />
        );
    }

    if (type === 'number') {
        return (
            <InputNumber
                id={id}
                placeholder={placeholder}
                disabled={disabled}
                variant="filled"
                style={{ ...baseStyle, width: '100%' }}
                suffix={suffix}
                prefix={prefix}
                {...rest}
            />
        );
    }

    return (
        <Input
            id={id}
            type={type}
            placeholder={placeholder}
            disabled={disabled}
            variant="filled"
            style={baseStyle}
            suffix={suffix}
            prefix={prefix}
            maxLength={maxLength}
            {...rest}
        />
    );
};

/**
 * 버튼과 결합된 Input (이메일 인증 등)
 * 
 * 사용법:
 * <FormInput.WithButton 
 *     placeholder="이메일" 
 *     buttonText="코드발송" 
 *     onButtonClick={handleSend}
 *     buttonLoading={loading}
 * />
 */
FormInput.WithButton = ({ 
    placeholder,
    disabled = false,
    buttonText,
    buttonLoading = false,
    buttonDisabled = false,
    buttonStyle,
    onButtonClick,
    verified = false,
    style,
    value,
    onChange,
    id,
    ...rest 
}) => {
    const inputStyle = {
        borderRadius: `${radius.lg} 0 0 ${radius.lg}`,
        height: heights.input,
        backgroundColor: disabled ? colors.gray[100] : colors.gray[50],
        border: 'none',
        flex: 1,
        ...style,
    };

    const btnStyle = {
        borderRadius: `0 ${radius.lg} ${radius.lg} 0`,
        height: heights.input,
        fontWeight: 700,
        padding: '0 20px',
        border: 'none',
        backgroundColor: verified ? colors.success.main : (buttonDisabled ? colors.gray[200] : colors.primary.main),
        color: '#fff',
        fontSize: '14px',
        ...buttonStyle,
    };

    return (
        <div style={{ display: 'flex', gap: 0 }}>
            <Input
                id={id}
                placeholder={placeholder}
                disabled={disabled || verified}
                variant="filled"
                style={inputStyle}
                value={value}
                onChange={onChange}
                {...rest}
            />
            <button
                type="button"
                onClick={onButtonClick}
                disabled={buttonDisabled || buttonLoading || verified}
                style={btnStyle}
            >
                {buttonLoading ? <span style={spinStyle} /> : buttonText}
            </button>
        </div>
    );
};

const spinStyle = {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.4)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'reserve-spin 0.6s linear infinite',
};

export default FormInput;
