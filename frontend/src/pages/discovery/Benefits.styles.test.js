import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const stylesheet = postcss.parse(readFileSync(resolve('src/styles/global/feature-surfaces.css'), 'utf8'));

// These are stylesheet source contracts, not browser pixel or hover measurements.
const styleAtWidth = (selector, width, { reducedMotion = false, hover = false } = {}) => {
    const style = {};
    stylesheet.walkRules(rule => {
        if (!rule.selectors.includes(selector)) return;
        for (let parent = rule.parent; parent; parent = parent.parent) {
            if (parent.type !== 'atrule' || parent.name !== 'media') continue;
            const min = parent.params.match(/min-width:\s*(\d+)px/);
            const max = parent.params.match(/max-width:\s*(\d+)px/);
            if (min && width < Number(min[1]) || max && width > Number(max[1])) return;
            if (/prefers-reduced-motion:\s*reduce\b/.test(parent.params) && !reducedMotion) return;
            if (/prefers-reduced-motion:\s*no-preference\b/.test(parent.params) && reducedMotion) return;
            if (/hover:\s*hover\b|pointer:\s*fine\b/.test(parent.params) && !hover) return;
        }
        rule.nodes.filter(node => node.type === 'decl').forEach(node => { style[node.prop] = node.value; });
    });
    return style;
};

describe('landscape benefits banner layout source contracts', () => {
    it('keeps one full-width banner below 900px and two bounded desktop columns', () => {
        for (const width of [320, 359, 390, 575, 576, 768, 899, 900, 960, 1248]) {
            const grid = styleAtWidth('.reserve-benefit-list', width);
            const card = styleAtWidth('.reserve-benefit-row', width);
            expect(grid.display).toBe('grid');
            expect(grid['grid-template-columns']).toBe(width < 900 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))');
            expect(grid.gap).toBe(width < 576 ? '12px' : '16px');
            expect(card['min-width']).toBe('0');
            expect(card['box-sizing']).toBe('border-box');
            expect(card.position).toBe('relative');
            expect(card.width).toBe('100%');
            expect(card['grid-template-columns']).toBe('minmax(0, 1fr)');
        }
    });

    it('uses a landscape ratio with readable minimum heights and no fixed or maximum height', () => {
        for (const width of [320, 390, 575, 576, 768, 960]) {
            const card = styleAtWidth('.reserve-benefit-row', width);
            expect(card['min-height']).toBe('var(--reserve-benefit-banner-min-height)');
            expect(card['--reserve-benefit-banner-min-height']).toBe(width < 576 ? '120px' : width < 900 ? '164px' : '156px');
            expect(card['aspect-ratio']).toBeUndefined();
            expect(styleAtWidth('.reserve-benefit-row::before', width)['aspect-ratio']).toBe('var(--reserve-benefit-banner-ratio, 3.2 / 1)');
            expect(card.height).toBeUndefined();
            expect(card['max-height']).toBeUndefined();
        }
        const clippingHeights = [];
        stylesheet.walkRules(rule => {
            if (!rule.selectors.includes('.reserve-benefit-row')) return;
            rule.nodes.filter(node => node.type === 'decl' && ['height', 'max-height'].includes(node.prop))
                .forEach(node => clippingHeights.push(node.value));
        });
        expect(clippingHeights).toEqual([]);
    });

    it('places photographs behind the copy without participating in the banner layout', () => {
        for (const width of [320, 390, 575, 576, 768, 899, 900, 960, 1248]) {
            const media = styleAtWidth('.reserve-benefit-media', width);
            expect(media.position).toBe('absolute');
            expect(media.inset).toBe('0');
            expect(media.height).toBe('100%');
            expect(media['aspect-ratio']).toBeUndefined();
            expect(styleAtWidth('.reserve-benefit-row-copy', width).width).toBe('84%');
        }
    });

    it('keeps general store discovery in two compact mobile columns and three desktop columns', () => {
        for (const width of [320, 390, 575, 576, 768, 899, 900, 960, 1248]) {
            const grid = styleAtWidth('.reserve-benefit-store-grid', width);
            expect(grid.display).toBe('grid');
            expect(grid['grid-template-columns']).toBe(`repeat(${width < 900 ? 2 : 3}, minmax(0, 1fr))`);
            expect(grid.gap).toBe(width < 576 ? '20px 12px' : '24px 20px');
            expect(grid['align-items']).toBe('start');
        }
    });

    it('reduces narrow-screen padding and typography without shrinking the entire banner', () => {
        for (const width of [320, 359]) {
            const tokens = styleAtWidth('.reserve-benefit-row', width);
            expect(tokens['--reserve-benefit-banner-padding']).toBe('14px');
            expect(tokens['--reserve-benefit-store-size']).toBe('20px');
            expect(tokens['--reserve-benefit-description-size']).toBe('10px');
            expect(tokens['--reserve-benefit-ticket-size']).toBe('11px');
        }
        expect(styleAtWidth('.reserve-benefit-row', 360)['--reserve-benefit-banner-padding']).toBe('16px');
        expect(styleAtWidth('.reserve-benefit-row', 360)['--reserve-benefit-store-size']).toBe('22px');
    });

    it('keeps copy readable and contains long titles without losing the accessible link text', () => {
        for (const width of [320, 390, 575]) {
            const ticket = styleAtWidth('.reserve-benefit-ticket', width);
            expect(ticket['max-width']).toBe('100%');
            expect(ticket['overflow-wrap']).toBe('anywhere');
            expect(styleAtWidth('.reserve-benefit-ticket > span', width)['-webkit-line-clamp']).toBe('2');
            expect(styleAtWidth('.reserve-benefit-description', width)['white-space']).toBe('nowrap');
        }
        expect(styleAtWidth('.reserve-benefit-row', 576)['--reserve-benefit-store-size']).toBe('30px');
        expect(styleAtWidth('.reserve-benefit-row', 576)['--reserve-benefit-ticket-size']).toBe('14px');
        const tokens = styleAtWidth('.reserve-benefits-page', 390);
        expect(tokens['--reserve-benefit-photo-backdrop']).toBe('#1a1f27');
        expect(tokens['--reserve-benefit-ticket-bg']).toBe('#2272eb');
    });

    it('keeps placeholder art intrinsically 64px and exempt from normal photograph hover zoom', () => {
        const selector = '.reserve-benefit-media--placeholder .reserve-benefit-thumbnail';
        const placeholder = styleAtWidth(selector, 390);
        expect(placeholder.width).toBe('64px');
        expect(placeholder.height).toBe('64px');
        expect(placeholder['object-fit']).toBe('contain');
        const exemptHover = styleAtWidth('.reserve-benefit-row:hover .reserve-benefit-media--placeholder .reserve-benefit-thumbnail', 390, { hover: true }).transform;
        const zoomSelectors = [];
        stylesheet.walkRules(rule => {
            if (!rule.nodes.some(node => node.type === 'decl' && node.prop === 'transform' && /scale\(/.test(node.value))) return;
            rule.selectors.filter(value => value.includes('.reserve-benefit-row:hover') && value.includes('.reserve-benefit-thumbnail'))
                .forEach(value => zoomSelectors.push(value));
        });
        expect(zoomSelectors.every(value => value.includes(':not(.reserve-benefit-media--placeholder)') || exemptHover === 'none')).toBe(true);
    });

    it('limits hover motion to actual photos and disables it for reduced motion', () => {
        for (const width of [320, 576, 960]) {
            expect(styleAtWidth('.reserve-benefit-thumbnail', width).transition).toBe('transform 0.22s ease');
            expect(styleAtWidth('.reserve-benefit-thumbnail', width, { reducedMotion: true }).transition).toBe('none');
            const selector = '.reserve-benefit-row:hover .reserve-benefit-media:not(.reserve-benefit-media--placeholder) .reserve-benefit-thumbnail';
            expect(styleAtWidth(selector, width, { hover: true }).transform).toBe('scale(1.02)');
            expect(styleAtWidth(selector, width, { hover: true, reducedMotion: true }).transform).toBeUndefined();
            expect(styleAtWidth('.reserve-benefit-row:hover', width, { hover: true }).transform).toBeUndefined();
        }
    });

    it('does not retain obsolete campaign, menu card or row metadata selectors', () => {
        const obsoleteSelectors = [];
        stylesheet.walkRules(rule => {
            rule.selectors.filter(selector => /\.reserve-benefits-(?:campaign|content-card|content-links|intro)|\.reserve-benefit-row-meta/.test(selector))
                .forEach(selector => obsoleteSelectors.push(selector));
        });
        expect(obsoleteSelectors).toEqual([]);
    });
});
