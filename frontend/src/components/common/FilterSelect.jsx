/**
 * RESERVE Design System - FilterSelect
 *
 * @deprecated 과거 흰 면·테두리 필터의 호환용 컴포넌트. 현재 화면과 신규 구현에서는 사용하지 않는다.
 * 입력 없는 목록 필터는 `FilterMenu`의 기본 투명 메뉴를 사용한다.
 * 값을 입력하는 폼 선택 필드는 `FormSelect`의 회색 채움 디자인을 사용한다.
 * 과거 Select 스타일은 `styles/global/interactions.css`에 남아 있다.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Select } from 'antd';
import ChoiceSelectInput from './ChoiceSelectInput';
import { renderRollingChoiceLabel } from './rollingChoiceLabel';

const FILTER_CLASS = 'reserve-filter-select';

const FilterSelect = ({ className, size, components, ...rest }) => (
    <Select
        // 호출측이 준 className 을 버리지 않고 뒤에 이어 붙인다 —
        // 폭·정렬용 유틸 클래스를 함께 쓰는 경우가 있다.
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
