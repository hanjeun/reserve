import React from 'react';
import PropTypes from 'prop-types';
import { Input } from 'antd';
import { colors, radius } from '../../styles/tokens';

const { TextArea } = Input;

const TEXTAREA_PADDING = '10px 12px';

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
        // AntD의 외부 카운터가 다음 필드와 겹치지 않도록 공간을 확보한다.

        marginBottom: showCount ? 22 : 0,
        ...style,
    };

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

FormTextArea.propTypes = {
    rows: PropTypes.number,
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    maxLength: PropTypes.number,
    showCount: PropTypes.bool,
    style: PropTypes.object,
};

export default FormTextArea;
