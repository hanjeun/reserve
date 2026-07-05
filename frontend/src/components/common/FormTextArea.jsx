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
        // showCount일 때 AntD가 카운터를 wrapper 밖으로 절대위치(하단 메운)로 붙여서, wrapper 자체는 그 공간을 안 차지함
        // → 바로 다음 요소(모달 footer 등)와 카운터가 시각적으로 겹치는 문제 방지를 위해 여유 공간 확보
        marginBottom: showCount ? 22 : 0,
        ...style,
    };

    // showCount 사용 시 AntD가 wrapper <div>로 감싸므로
    // 실제 <textarea>에 padding을 직접 적용해야 FormInput과 정렬이 맞음
    return (
        <TextArea
            rows={rows}
            className="reserve-form-field"
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
