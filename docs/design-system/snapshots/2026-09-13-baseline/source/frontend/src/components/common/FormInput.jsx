/**
 * RESERVE Design System - FormInput Component
 * 
 * 사용법:
 * <FormInput placeholder="이메일 주소" />
 * <FormInput type="password" placeholder="비밀번호" />
 * <FormInput type="number" suffix="원" />
 * <FormInput disabled />
 * <FormInput maxLength={40} showCount />
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Input, InputNumber } from 'antd';
import { colors, radius, heights } from '../../styles/tokens';
import { fontSize } from '../../styles/tokens';

const FormInput = ({ 
    type = 'text',
    placeholder,
    disabled = false,
    suffix,
    prefix,
    maxLength,
    showCount = false,
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
        fontSize: fontSize.lg,  // 입력 텍스트·placeholder 크기 고정(16px) — 호출부 size prop과 무관하게 항상 동일
        // showCount일 때 AntD가 카운터를 wrapper 밖으로 절대위치로 붙여서 표시하므로, 바로 다음 요소(모달 footer 등)를
        // 침범하지 않도록 FormTextArea와 동일하게 여유 공간을 미리 확보해둠
        marginBottom: showCount ? 22 : 0,
        ...style,
    };

    // 비밀번호 타입
    if (type === 'password') {
        return (
            <Input.Password
                id={id}
                className="reserve-form-field"
                placeholder={placeholder}
                disabled={disabled}
                variant="filled"
                style={baseStyle}
                maxLength={maxLength}
                showCount={showCount}
                {...rest}
            />
        );
    }

    if (type === 'number') {
        return (
            <InputNumber
                id={id}
                className="reserve-form-field"
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
            className="reserve-form-field"
            type={type}
            placeholder={placeholder}
            disabled={disabled}
            variant="filled"
            style={baseStyle}
            suffix={suffix}
            prefix={prefix}
            maxLength={maxLength}
            showCount={showCount}
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
    className,
    buttonAriaLabel,
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
    const buttonLabel = buttonAriaLabel
        ?? (typeof buttonText === 'string' ? buttonText : undefined);

    return (
        <div className="reserve-form-field-with-button" style={{ display: 'flex', gap: 0 }}>
            <Input
                id={id}
                className={['reserve-form-field', className].filter(Boolean).join(' ')}
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
                className="reserve-form-field-button"
                aria-label={buttonLoading && buttonLabel ? `${buttonLabel} 처리 중` : buttonLabel}
                aria-busy={buttonLoading || undefined}
                style={btnStyle}
            >
                {buttonLoading ? <span className="reserve-form-field-button-spin" aria-hidden="true" /> : buttonText}
            </button>
        </div>
    );
};

FormInput.propTypes = {
    type: PropTypes.oneOf(['text', 'password', 'number', 'email']),
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    suffix: PropTypes.node,
    prefix: PropTypes.node,
    maxLength: PropTypes.number,
    showCount: PropTypes.bool,
    id: PropTypes.string,
    style: PropTypes.object,
};

FormInput.WithButton.propTypes = {
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    buttonText: PropTypes.node,
    buttonLoading: PropTypes.bool,
    buttonDisabled: PropTypes.bool,
    buttonStyle: PropTypes.object,
    onButtonClick: PropTypes.func,
    verified: PropTypes.bool,
    style: PropTypes.object,
    value: PropTypes.string,
    onChange: PropTypes.func,
    id: PropTypes.string,
    className: PropTypes.string,
    buttonAriaLabel: PropTypes.string,
};

export default FormInput;
