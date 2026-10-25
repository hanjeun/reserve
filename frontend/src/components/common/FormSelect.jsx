/*
 * 값을 입력하는 선택 필드는 공통 채움형을 쓰고 목록 필터와 구분한다. 전역 규칙은 공통 CSS에서 관리한다.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Select } from 'antd';
import ChoiceSelectInput from './ChoiceSelectInput';
import { renderRollingChoiceLabel } from './rollingChoiceLabel';

/** index.css 의 `.ant-select.reserve-form-select` 규칙과 짝이다. 한쪽만 고치지 말 것. */
const FORM_CLASS = 'reserve-form-select';

const FormSelect = ({ placeholder, disabled = false, options, children, style, className, components, ...rest }) => (
    <Select
        placeholder={placeholder}
        disabled={disabled}
        variant="filled"
        style={{ width: '100%', ...style }}
        options={options}
        // 호출측 className 을 버리지 않고 이어 붙인다(폭·정렬용 유틸 클래스와 함께 쓰는 경우가 있다).
        className={className ? `${FORM_CLASS} ${className}` : FORM_CLASS}
        {...rest}
        labelRender={rest.labelRender ?? (choice => renderRollingChoiceLabel(choice, { options, children, fieldNames: rest.fieldNames }))}
        components={{ ...components, input: ChoiceSelectInput }}
    >
        {children}
    </Select>
);

FormSelect.propTypes = {
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    options: PropTypes.array,
    children: PropTypes.node,
    style: PropTypes.object,
    className: PropTypes.string,
    components: PropTypes.object,
};

export default FormSelect;
