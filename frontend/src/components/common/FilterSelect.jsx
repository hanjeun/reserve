/**
 * RESERVE Design System - FilterSelect
 *
 * **목록·툴바 위에 놓이는 조작 도구용 셀렉트.** 흰 면 + 옅은 테두리.
 * 폼에 값을 입력하는 셀렉트는 이게 아니라 `FormSelect`(회색 채움)를 쓴다.
 *
 * ┌─ 어느 쪽을 써야 하나 ─────────────────────────────────────────────┐
 * │ FormSelect   … "값을 적어 넣는 칸". 가게 등록 카테고리, 마이페이지 글꼴 │
 * │ FilterSelect … "목록을 조작하는 도구". 별점순, 예약관리 필터, 기간 선택 │
 * └──────────────────────────────────────────────────────────────────┘
 * 입력칸이 아닌 것을 채움형으로 칠하면 폼처럼 보여 위계가 무너지고,
 * 반대로 입력칸을 흰 면으로 두면 옆의 FormInput들과 톤이 어긋난다.
 *
 * ★ 이 컴포넌트가 존재하는 이유 (2026-08-04 신설)
 *   예전에는 순수 AntD `<Select>` 에 `className="reserve-filter-select"` 를
 *   **개발자가 기억해서 붙여야** 했다. 그리고 실제로 두 번 잊었다 —
 *   StoreList의 "별점순"과 StatisticsTab의 가게 선택이 클래스 없이 렌더돼
 *   전역 Select 토큰(회색)을 그대로 받아 회색으로 떨어져 있었다.
 *   StatisticsTab 주석에는 "FilterToolbar와 정확히 일치하도록 맞춘다"고 적혀 있었는데
 *   **의도만 있고 구현이 없던** 상태였다.
 *
 *   교훈: 규칙을 주석·클래스명에 두면 반드시 새는다. 컴포넌트 이름으로 강제해야 한다.
 *   이제 "필터냐 폼이냐"는 import 하는 순간 결정되고, 클래스명을 외울 필요가 없다.
 *
 * 실제 색 규칙은 `index.css` 의 "필터용 Select" 블록에 있다(전역 정책이므로 그곳이 맞다).
 * 이 파일은 그 클래스를 붙여주는 얇은 관문 역할만 한다 — 여기에 <style> 태그를 넣지 말 것.
 * 컴포넌트 안에 전역 CSS를 넣으면 그 컴포넌트를 안 쓰는 화면에는 규칙이 아예 존재하지 않는다.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Select } from 'antd';

const FILTER_CLASS = 'reserve-filter-select';

const FilterSelect = ({ className, size = 'large', ...rest }) => (
    <Select
        // 호출측이 준 className 을 버리지 않고 뒤에 이어 붙인다 —
        // 폭·정렬용 유틸 클래스를 함께 쓰는 경우가 있다.
        className={className ? `${FILTER_CLASS} ${className}` : FILTER_CLASS}
        // 필터는 툴바에 놓이므로 large 가 기본이다(예약관리·광고관리 탭과 동일).
        // 필요하면 호출측이 덮을 수 있게 prop 으로 받는다.
        size={size}
        {...rest}
    />
);

FilterSelect.Option = Select.Option;

FilterSelect.propTypes = {
    className: PropTypes.string,
    size: PropTypes.oneOf(['small', 'middle', 'large']),
};

export default FilterSelect;
