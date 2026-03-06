/**
 * RESERVE Design System - FormSelect Component
 * 
 * 사용법:
 * <FormSelect placeholder="선택">
 *     <FormSelect.Option value="한식">한식</FormSelect.Option>
 * </FormSelect>
 * 
 * 또는 options prop 사용:
 * <FormSelect 
 *     placeholder="선택" 
 *     options={[{ value: '한식', label: '한식' }]} 
 * />
 */

import React from 'react';
import { Select } from 'antd';
import { colors, radius, heights } from '../../styles/tokens';

const FormSelect = ({ 
    placeholder,
    disabled = false,
    options,
    children,
    style,
    ...rest 
}) => {
    const selectStyle = {
        width: '100%',
        ...style,
    };

    // CSS로 높이 및 배경 적용
    const selectClassName = 'reserve-form-select';

    return (
        <>
            <Select
                placeholder={placeholder}
                disabled={disabled}
                variant="filled"
                style={selectStyle}
                options={options}
                className={selectClassName}
                {...rest}
            >
                {children}
            </Select>
            <style>{`
                .${selectClassName} .ant-select-selector {
                    height: ${heights.input} !important;
                    border-radius: ${radius.lg} !important;
                    background-color: ${disabled ? colors.gray[100] : colors.gray[50]} !important;
                    border: none !important;
                    display: flex !important;
                    align-items: center !important;
                }
                .${selectClassName} .ant-select-selection-item,
                .${selectClassName} .ant-select-selection-placeholder {
                    line-height: ${heights.input} !important;
                }
            `}</style>
        </>
    );
};

// Option을 직접 export
FormSelect.Option = Select.Option;

export default FormSelect;
