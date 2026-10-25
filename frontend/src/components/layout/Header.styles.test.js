import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const stylesheet = postcss.parse(readFileSync(resolve('src/styles/global/feature-surfaces.css'), 'utf8'));

function styleAtWidth(selector, width) {
    const style = {};
    stylesheet.walkRules(rule => {
        if (!rule.selectors.includes(selector)) return;
        for (let parent = rule.parent; parent; parent = parent.parent) {
            if (parent.type !== 'atrule' || parent.name !== 'media') continue;
            const min = parent.params.match(/min-width:\s*(\d+)px/);
            const max = parent.params.match(/max-width:\s*(\d+)px/);
            if ((min && width < Number(min[1])) || (max && width > Number(max[1]))) return;
        }
        rule.nodes.filter(node => node.type === 'decl').forEach(node => { style[node.prop] = node.value; });
    });
    return style;
}

describe('result query header source contracts', () => {
    it('keeps the full guest wordmark and compact spacing on narrow back-header routes', () => {
        expect(styleAtWidth('.reserve-header-is-guest.reserve-header-has-back .reserve-header-logo-wordmark', 320)['font-size']).toBe('18px');
        expect(styleAtWidth('.reserve-header-is-guest.reserve-header-has-back .reserve-header-inner', 320)['padding-inline']).toBe('12px');
        expect(styleAtWidth('.reserve-header-is-guest.reserve-header-has-back .reserve-header-actions', 320).gap).toBe('0');
        expect(styleAtWidth('.reserve-header-is-guest.reserve-header-has-back .reserve-header-logo-wordmark', 390)['font-size']).toBeUndefined();
    });

    it.each([320, 390, 767, 768, 960, 1248])('목록 검색어와 무관하게 워드마크를 유지한다 (%ipx)', width => {
        expect(styleAtWidth('.reserve-header-logo-wordmark', width).display).toBe('block');
        expect(styleAtWidth('.reserve-header-has-query .reserve-header-logo', width).display).toBeUndefined();
        expect(styleAtWidth('.reserve-header-has-query .reserve-header-inner', width).display).toBeUndefined();
        expect(styleAtWidth('.reserve-header-query', width)).toEqual({});
    });

    it('keeps a 44px clickable search icon and neutral keyboard focus indicators', () => {
        expect(styleAtWidth('.reserve-search-page', 390)['--reserve-search-action-size']).toBe('44px');
        expect(styleAtWidth('.reserve-search-icon', 390).cursor).toBe('pointer');
        expect(styleAtWidth('.reserve-search-icon:focus-visible', 390).outline).toBe('var(--reserve-focus-ring)');
    });

    it('keeps the search link neutral and closes only the mobile search-to-login gutter', () => {
        const mobileLogin = styleAtWidth('.reserve-header-is-guest .reserve-header-guest-actions .reserve-btn--ghost', 390);
        expect(styleAtWidth('.reserve-header-search:hover', 390).color).toBe('var(--c-text-primary, #191f28)');
        expect(styleAtWidth('.reserve-header-is-guest .reserve-header-actions', 390).gap).toBe('0');
        expect(mobileLogin['min-width']).toBe('44px');
        expect(mobileLogin['padding-left']).toBe('0');
        expect(mobileLogin['padding-right']).toBe('13px');
        expect(styleAtWidth('.reserve-header-guest-actions', 960).gap).toBe('12px');
    });

    it('keeps the contextual back control visible on desktop as well as mobile', () => {
        expect(styleAtWidth('.reserve-header-back', 390).display).toBe('grid');
        expect(styleAtWidth('.reserve-header-back', 1440).display).toBe('grid');
    });

    it.each([390, 768, 960, 1248, 1440])('keeps the discovery tab surface full width with aligned inner content (%ipx)', width => {
        const nav = styleAtWidth('.reserve-discovery-top-nav', width);
        const inner = styleAtWidth('.reserve-discovery-top-nav-inner', width);
        expect(nav.width).toBe('100%');
        expect(nav['border-bottom']).toBe('1px solid var(--c-border-light, #f2f4f6)');
        expect(nav.background).toBe('var(--c-header-bg, rgba(255, 255, 255, 0.9))');
        expect(inner['max-width']).toBe('1248px');
        expect(inner['padding-inline']).toBe(width >= 768 ? '24px' : 'var(--reserve-home-gutter, 20px)');
    });
});
