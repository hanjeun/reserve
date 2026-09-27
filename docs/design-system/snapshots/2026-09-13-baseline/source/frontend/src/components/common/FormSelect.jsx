/**
 * RESERVE Design System - FormSelect
 *
 * **폼에 값을 입력하는 셀렉트.** 채움형 회색 — FormInput·FormTextArea·FormDatePicker·FormTimePicker와
 * 같은 톤이고 높이도 같다(54px).
 * 목록·툴바 위의 조작 도구라면 이게 아니라 `FilterSelect`(흰 면 + 테두리)를 쓴다.
 *
 * 사용법:
 *   <FormSelect placeholder="선택" options={[{ value: '한식', label: '한식' }]} />
 *   <FormSelect placeholder="선택">
 *       <FormSelect.Option value="한식">한식</FormSelect.Option>
 *   </FormSelect>
 *
 * ★ 스타일은 이 파일에 없다 — `index.css` 의 "폼 입력용 Select" 블록에 있다.
 *   2026-08-04에 이 파일 안의 <style> 태그를 걷어냈다. 컴포넌트 안에 전역 CSS를 넣으면
 *   그 컴포넌트를 안 쓰는 화면에는 규칙이 존재하지 않게 되고, 이 프로젝트는 이미 그 함정에
 *   두 번 빠졌다(필터 Select 색, 카드 hover 그림자).
 *   전역 정책은 index.css, 컴포넌트 지역 스타일만 인라인 — 이 경계를 지킨다.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Select } from 'antd';

/** index.css 의 `.ant-select.reserve-form-select` 규칙과 짝이다. 한쪽만 고치지 말 것. */
const FORM_CLASS = 'reserve-form-select';

const FormSelect = ({ placeholder, disabled = false, options, children, style, className, ...rest }) => (
    <Select
        placeholder={placeholder}
        disabled={disabled}
        variant="filled"
        style={{ width: '100%', ...style }}
        options={options}
        // 호출측 className 을 버리지 않고 이어 붙인다(폭·정렬용 유틸 클래스와 함께 쓰는 경우가 있다).
        className={className ? `${FORM_CLASS} ${className}` : FORM_CLASS}
        {...rest}
    >
        {children}
    </Select>
);

FormSelect.Option = Select.Option;

FormSelect.propTypes = {
    placeholder: PropTypes.string,
    disabled: PropTypes.bool,
    options: PropTypes.array,
    children: PropTypes.node,
    style: PropTypes.object,
    className: PropTypes.string,
};

export default FormSelect;
