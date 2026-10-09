import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import StoreListViewToggle from './StoreListViewToggle';
import StoreListRowSkeleton from './StoreListRowSkeleton';

const stylesheet = postcss.parse(readFileSync('src/styles/global/feature-surfaces.css', 'utf8'));
const styleAtWidth = (selector, width) => {
    const styles = {};
    stylesheet.walkRules(rule => {
        if (!rule.selectors.includes(selector)) return;
        for (let parent = rule.parent; parent; parent = parent.parent) {
            if (parent.type !== 'atrule' || parent.name !== 'media') continue;
            const min = parent.params.match(/min-width:\s*(\d+)px/);
            const max = parent.params.match(/max-width:\s*(\d+)px/);
            if (min && width < Number(min[1]) || max && width > Number(max[1])) return;
        }
        rule.nodes.filter(node => node.type === 'decl').forEach(node => { styles[node.prop] = node.value; });
    });
    return styles;
};

describe('store result layout pattern', () => {
    it('shows the next view action using existing Ant Design icons without changing the view on mount', async () => {
        const onChange = vi.fn();
        render(<StoreListViewToggle view="cards" onChange={onChange} />);
        const toggle = screen.getByRole('button', { name: '목록형 보기로 전환' });
        expect(toggle).toHaveAttribute('type', 'button');
        expect(toggle.querySelector('[data-icon="unordered-list"]')).toBeInTheDocument();
        expect(toggle.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
        await userEvent.setup().click(toggle);
        expect(onChange).toHaveBeenCalledExactlyOnceWith('list');
    });

    it('supports Enter/Space and retains keyboard focus while the action icon changes', async () => {
        function ControlledToggle() {
            const [view, setView] = useState('cards');
            return <StoreListViewToggle view={view} onChange={setView} />;
        }
        const user = userEvent.setup();
        render(<ControlledToggle />);
        await user.tab();
        await user.keyboard('{Enter}');
        const toggle = screen.getByRole('button', { name: '사진형 보기로 전환' });
        expect(toggle).toHaveFocus();
        expect(toggle.querySelector('[data-icon="appstore"]')).toBeInTheDocument();
        await user.keyboard(' ');
        expect(screen.getByRole('button', { name: '목록형 보기로 전환' })).toHaveFocus();
    });

    it('does not change views while its list is loading', async () => {
        const onChange = vi.fn();
        render(<StoreListViewToggle view="cards" onChange={onChange} disabled />);
        const toggle = screen.getByRole('button', { name: '목록형 보기로 전환' });
        expect(toggle).toBeDisabled();
        await userEvent.setup().click(toggle);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('uses the same bounded photo/body/meta skeleton classes without interactive placeholders', () => {
        const { container } = render(<StoreListRowSkeleton count={12} />);
        expect(container.querySelectorAll('.reserve-store-list-row')).toHaveLength(12);
        expect(container.querySelectorAll('.reserve-store-list-row-image')).toHaveLength(12);
        expect(container.querySelectorAll('.reserve-store-list-row-body')).toHaveLength(12);
        expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(12);
        expect(container.querySelector('button, a, img')).toBeNull();
    });

    it.each([320, 390, 960, 1248])('bounds rows and touch controls at %ipx without changing the original card grid', width => {
        const rows = styleAtWidth('.reserve-store-list-rows', width);
        expect(rows['grid-template-columns']).toBe('minmax(0, 1fr)');
        expect(rows['--reserve-store-list-image-size']).toBe(width < 768 ? '80px' : '96px');
        expect(rows['--reserve-store-list-image-radius']).toBe('14px');
        const image = styleAtWidth('.reserve-store-list-row-image', width);
        expect(image.width).toBe('var(--reserve-store-list-image-size)');
        expect(image.height).toBe(image.width);
        expect(image['aspect-ratio']).toBe('1 / 1');
        expect(styleAtWidth('.reserve-store-list-row-image img', width)['object-fit']).toBe('cover');
        expect(styleAtWidth('.reserve-store-list-row-body', width)['min-width']).toBe('0');
        expect(styleAtWidth('.reserve-store-identity-text', width)).toMatchObject({ 'flex-wrap': 'wrap', 'min-width': '0' });
        expect(styleAtWidth('.reserve-store-identity-text-ad', width)).toMatchObject({ color: 'var(--c-text-tertiary, #8b95a1)' });
        expect(styleAtWidth('.reserve-store-view-toggle', width)).toMatchObject({ width: '44px', height: '44px', background: 'transparent', color: 'var(--c-text-secondary)' });
        expect(styleAtWidth('.reserve-store-view-toggle:hover:not(:disabled)', width)).toMatchObject({ background: 'var(--c-gray-50, #f9fafb)', color: 'var(--c-text-primary)' });
        const hover = stylesheet.nodes.find(node => node.type === 'atrule'
            && node.params === '(hover: hover) and (pointer: fine)'
            && node.nodes.some(child => child.type === 'rule' && child.selectors.includes('.reserve-store-view-toggle:hover:not(:disabled)')))
            .nodes.find(node => node.type === 'rule' && node.selectors.includes('.reserve-store-view-toggle:hover:not(:disabled)'));
        expect(hover).toBeDefined();
        expect(image.background).toBe('transparent');
        expect(styleAtWidth('.rsv-store-grid', width)['grid-template-columns']).toBe(width < 552 ? '1fr' : width < 1080 ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)');
    });
});
