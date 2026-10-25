/*
 * @deprecated 호환용 선택기다. 목록 필터는 FilterMenu, 입력 선택은 FormSelect를 사용한다.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Select } from 'antd';
import ChoiceSelectInput from './ChoiceSelectInput';
import { renderRollingChoiceLabel } from './rollingChoiceLabel';

const FILTER_CLASS = 'reserve-filter-select';

const FilterSelect = ({ className, size, components, ...rest }) => (
    <Select
        // 호출부의 너비·정렬 클래스도 함께 적용한다.

        className={[FILTER_CLASS, className].filter(Boolean).join(' ')}
        size={size ?? 'large'}
        {...rest}
        labelRender={rest.labelRender ?? (choice => renderRollingChoiceLabel(choice, { options: rest.options, children: rest.children, fieldNames: rest.fieldNames }))}
        components={{ ...components, input: ChoiceSelectInput }}
    />
);

FilterSelect.propTypes = {
    className: PropTypes.string,
    size: PropTypes.oneOf(['small', 'middle', 'large']),
    components: PropTypes.object,
};

export default FilterSelect;
