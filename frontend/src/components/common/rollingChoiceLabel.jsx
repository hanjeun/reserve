import React from 'react';
import RollingFieldValue from './RollingFieldValue';

function optionOrder(value, { options, children, fieldNames } = {}) {
    const valueKey = fieldNames?.value ?? 'value';
    const groupKey = fieldNames?.options ?? 'options';
    const entries = [];
    const collect = items => items.forEach(item => {
        const option = React.isValidElement(item) ? item.props : item;
        if (!option) return;
        if (Array.isArray(option[groupKey])) collect(option[groupKey]);
        else if (option.children && option.value === undefined && React.isValidElement(item)) collect(React.Children.toArray(option.children));
        else entries.push(option[valueKey]);
    });
    collect(options ?? React.Children.toArray(children));
    const index = entries.findIndex(entry => entry === value);
    return index < 0 ? undefined : index;
}

// 복합 라벨은 마크업을 유지하고 일반 라벨만 필드 전환을 공유한다.
export function renderRollingChoiceLabel({ value, label }, choices) {
    if (!['string', 'number'].includes(typeof label)) return label;
    return <RollingFieldValue value={value} order={optionOrder(value, choices)}>{label}</RollingFieldValue>;
}
