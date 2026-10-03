import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { radius } from './tokens';

const parse = file => postcss.parse(readFileSync(resolve(cwd(), `src/styles/global/${file}`), 'utf8'));
const declarations = rule => Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
const findRule = (root, selector, media) => {
    let found;
    root.walkRules(rule => {
        if (rule.selectors.includes(selector)
            && (!media || rule.parent.type === 'atrule' && rule.parent.params === media)) found = rule;
    });
    return found;
};

describe('scoped UI interaction styles', () => {
    it('does not overlay theme-colored AntD progress bars on the white carousel indicators', () => {
        const css = parse('navigation-and-media.css');
        const overlay = findRule(css, '.reserve-carousel .slick-dots li::after');
        expect(declarations(overlay).display).toBe('none');
        expect(overlay.nodes.find(node => node.prop === 'display').important).toBe(true);
        expect(declarations(findRule(css, '.reserve-carousel .slick-dots li.slick-active button')).background).toBe('#fff');
    });

    it('leaves profile image cropping to the shared account Avatar', () => {
        const css = parse('feature-surfaces.css');
        expect(findRule(css, '.reserve-messenger-settings-avatar img')).toBeUndefined();
        expect(declarations(findRule(css, '.reserve-messenger-settings-avatar'))).toEqual({ 'flex-shrink': '0', 'line-height': '0' });
    });

    it('zooms card photos only for a fine hover pointer and retains reduced-motion protection', () => {
        const css = parse('components-and-forms.css');
        const selector = '.reserve-card.ant-card-hoverable:hover .reserve-card-image';
        const zoom = findRule(css, selector, '(hover: hover) and (pointer: fine)');
        expect(declarations(zoom).transform).toBe('scale(1.05)');
        css.walkRules(selector, rule => { expect(rule.parent.type).toBe('atrule'); });
        expect(declarations(findRule(css, selector, '(prefers-reduced-motion: reduce)')).transform).toBe('none');
    });

    it('clips each normal gallery slide without targeting the original-image preview', () => {
        const css = parse('feature-surfaces.css');
        expect(declarations(findRule(css, '.reserve-store-gallery .ant-image'))).toMatchObject({
            'border-radius': radius.xl, overflow: 'hidden', 'clip-path': `inset(0 round ${radius.xl})`,
        });
        expect(declarations(findRule(css, '.reserve-store-gallery .ant-image-img'))['border-radius']).toBe('inherit');
    });

    it('does not apply route entry motion to any page that still contains data skeletons', () => {
        const css = parse('discovery-motion.css');
        for (const direction of ['right', 'left']) {
            const child = ' > :not(.reserve-route-skeleton):not(.reserve-data-skeleton):not(:has(.reserve-skeleton-block:not(.reserve-skeleton-block--local)))';
            const parent = `.reserve-route-entry--from-${direction}`;
            const selector = `${parent}:not([data-skeleton-shown="true"])${child}`;
            expect(declarations(findRule(css, selector, '(prefers-reduced-motion: no-preference)')).animation).toContain(`reserve-discovery-page-from-${direction}`);
            expect(findRule(css, `${parent}${child}`, '(prefers-reduced-motion: no-preference)')).toBeUndefined();
            expect(declarations(findRule(css, `${parent}${child}`, '(prefers-reduced-motion: reduce)')).animation).toBe('none');
        }
    });

    it('shares existing press feedback with date fields, guest steps and store links while preserving reduced motion', () => {
        const buttons = parse('components-and-forms.css');
        const surfaces = parse('feature-surfaces.css');
        const date = '.reserve-cal-trigger:not(.reserve-form-time-trigger)';
        const step = '.reserve-guest-count-step';
        const pressed = findRule(buttons, '.reserve-btn--secondary:active:not(:disabled)');
        for (const selector of [date, step]) {
            expect(findRule(buttons, `${selector}:active:not(:disabled)`)).toBe(pressed);
            expect(declarations(findRule(surfaces, selector, '(prefers-reduced-motion: reduce)')).transition).toBe('none');
            expect(declarations(findRule(surfaces, `${selector}:active`, '(prefers-reduced-motion: reduce)')).transform).toBe('none');
        }
        expect(pressed.selectors).not.toContain('.rsv-tap-btn:active:not(:disabled)');
        const link = 'a.reserve-store-list-row-link[href]';
        const normalRule = selector => surfaces.nodes.find(node => node.type === 'rule' && node.selectors.includes(selector));
        const card = declarations(normalRule('.reserve-store-card-shell:has(.reserve-store-card-hit:active)'));
        expect(declarations(normalRule(`${link}:active`)).opacity).toBe(card.opacity);
        expect(declarations(normalRule(`${link}:active`)).transform).toBeUndefined();
        expect(declarations(normalRule(link))).toMatchObject({ transition: 'opacity 0.12s ease', '-webkit-tap-highlight-color': 'transparent' });
        expect(declarations(findRule(surfaces, link, '(prefers-reduced-motion: reduce)')).transition).toBe('none');
        expect(declarations(normalRule('.reserve-store-list-row-link:active')).opacity).toBeUndefined();
    });

    it('fills the mobile message route dynamically without changing the home viewport or removing the safe area', () => {
        const css = parse('feature-surfaces.css');
        const mobile = '(max-width: 767.98px)';
        expect(declarations(findRule(css, '.reserve-app-layout--messages', mobile))).toMatchObject({ height: '100dvh', 'min-height': '0' });
        expect(declarations(findRule(css, '.reserve-app-layout--messages > .ant-layout-content', mobile))).toMatchObject({ flex: '1', 'min-height': '0', overflow: 'hidden' });
        expect(declarations(findRule(css, '.reserve-messenger--page', mobile))).toMatchObject({ height: '100%', 'min-height': '0' });
        expect(declarations(findRule(css, '.reserve-messenger-footer')).padding).toContain('env(safe-area-inset-bottom, 0px)');
    });
});
