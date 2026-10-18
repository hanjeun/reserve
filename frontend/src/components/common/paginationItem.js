import { cloneElement, createElement, isValidElement } from 'react';
import { LeftOutlined, RightOutlined, DoubleLeftOutlined, DoubleRightOutlined, MoreOutlined } from './icons';

export function renderPaginationItem(_page, type, original) {
    if (!isValidElement(original)) return original;
    if (type === 'prev' || type === 'next') {
        const Icon = type === 'prev' ? LeftOutlined : RightOutlined;
        return cloneElement(original, {}, createElement(Icon, { 'aria-hidden': true }));
    }
    if (type === 'jump-prev' || type === 'jump-next') {
        const container = original.props.children;
        if (!isValidElement(container)) return original;
        const Icon = type === 'jump-prev' ? DoubleLeftOutlined : DoubleRightOutlined;
        return cloneElement(original, {}, cloneElement(container, {},
            createElement(Icon, { className: 'ant-pagination-item-link-icon', 'aria-hidden': true }),
            createElement('span', { className: 'ant-pagination-item-ellipsis', 'aria-hidden': true }, createElement(MoreOutlined))));
    }
    return original;
}
