/**
 * RESERVE Design System - FormTextArea Component
 * 
 * 사용법:
 * <FormTextArea placeholder="가게를 소개해주세요" />
 * <FormTextArea rows={6} />
 */

import React from 'react';
import { Input } from 'antd';
import { colors, radius } from '../../styles/tokens';

const { TextArea } = Input;

const TEXTAREA_PADDING = '10px 12px'; // 상하 여유 확보 + FormInput 좌우와 통일

const FormTextArea = ({ 
    rows = 4,
    placeholder,
    disabled = false,
    maxLength,
    showCount = false,
    style,
    ...rest 
}) => {
    const wrapperStyle = {
        borderRadius: radius.lg,
        backgroundColor: disabled ? colors.gray[100] : colors.gray[50],
        border: 'none',
        ...style,
    };

    // showCount 사용 시 AntD가 wrapper <div>로 감싸므로
    // 실제 <textarea>에 padding을 직접 적용해야 FormInput과 정렬이 맞음
    return (
        <TextArea
            rows={rows}
            placeholder={placeholder}
            disabled={disabled}
            variant="filled"
            style={wrapperStyle}
            styles={{ textarea: { padding: TEXTAREA_PADDING } }}
            maxLength={maxLength}
            showCount={showCount}
            {...rest}
        />
    );
};

export default FormTextArea;
