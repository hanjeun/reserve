import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const stylesheet = postcss.parse(readFileSync(resolve('src/styles/global/feature-surfaces.css'), 'utf8'));

const styleAtWidth = (selector, width) => {
    const style = {};
    stylesheet.walkRules(rule => {
        if (!rule.selectors.includes(selector)) return;
        for (let parent = rule.parent; parent; parent = parent.parent) {
            if (parent.type !== 'atrule' || parent.name !== 'media') continue;
            const min = parent.params.match(/min-width:\s*(\d+)px/);
            const max = parent.params.match(/max-width:\s*(\d+)px/);
            if (min && width < Number(min[1]) || max && width > Number(max[1])) return;
        }
        rule.nodes.filter(node => node.type === 'decl').forEach(node => { style[node.prop] = node.value; });
    });
    return style;
};

describe('home recommendation rows reuse the store list row', () => {
    it.each([[320, 1], [390, 1], [575, 1], [576, 1], [768, 1], [899, 1], [900, 2], [960, 2], [1248, 2]])('keeps %ipx recommendations in %i columns', (width, columns) => {
        const grid = styleAtWidth('.reserve-discovery-store-list', width);
        expect(grid.display).toBe('grid');
        expect(grid['grid-template-columns']).toBe(`repeat(${columns}, minmax(0, 1fr))`);
        const gap = Number.parseFloat(styleAtWidth('.reserve-discovery-recommended', width)['--reserve-home-recommendation-gap']);
        const gutter = width < 360 ? 16 : width < 768 ? 20 : 24;
        const available = Math.min(width, 1248) - 2 * gutter;
        const cardWidth = (available - (columns - 1) * gap) / columns;
        expect(cardWidth * columns + (columns - 1) * gap).toBeCloseTo(available);
    });

    it('reuses the store list row sizes instead of a home-only card', () => {
        // 사진 크기·간격은 가게 목록(.reserve-store-list-rows)의 변수를 그대로 쓴다.
        expect(styleAtWidth('.reserve-store-list-rows', 390)['--reserve-store-list-image-size']).toBe('80px');
        expect(styleAtWidth('.reserve-store-list-rows', 900)['--reserve-store-list-image-size']).toBe('96px');
        expect(styleAtWidth('.reserve-discovery-store', 390)).toEqual({});
        expect(styleAtWidth('.reserve-discovery-store-media', 390)).toEqual({});
    });
});

describe('discovery banner motion policy', () => {
    it('never transforms a banner or its snap track on press or hover', () => {
        const transforms = [];
        stylesheet.walkRules(rule => {
            if (rule.selectors.some(selector => /\.reserve-discovery-banner(?:-track)?(?=[:\s]|$)/.test(selector))) {
                rule.walkDecls('transform', declaration => transforms.push(declaration.value));
            }
        });
        // reduced-motion can explicitly reset transforms; geometry-changing effects cannot return.
        expect(transforms.every(value => value === 'none')).toBe(true);
    });

    it('lifts shortcut images on fine hover without resizing the pressed link or carousel', () => {
        const hoverTransforms = [];
        const pressTransforms = [];
        stylesheet.walkRules(rule => {
            if (rule.selectors.includes('.reserve-discovery-shortcut:hover img')) {
                rule.walkDecls('transform', declaration => {
                    expect(rule.parent.type).toBe('atrule');
                    expect(rule.parent.params).toBe('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
                    hoverTransforms.push(declaration.value);
                });
            }
            if (rule.selectors.some(selector => /^\.reserve-discovery-shortcut:active(?=[:\s]|$)/.test(selector))) {
                rule.walkDecls('transform', declaration => pressTransforms.push(declaration.value));
            }
        });
        expect(hoverTransforms).toEqual(['translateY(-2px)']);
        expect(pressTransforms).toEqual(['none']);
        expect(styleAtWidth('.reserve-discovery-shortcut:active', 390).color).toBe('var(--c-text-primary, #191f28)');
    });
});

describe('discovery recommendation separator', () => {
    it('uses a thin neutral edge rather than the former four-pixel section stripe', () => {
        expect(styleAtWidth('.reserve-discovery-home', 390)['--reserve-home-divider-size']).toBe('1px');
        expect(styleAtWidth('.reserve-discovery-recommended', 390)['border-top'])
            .toBe('var(--reserve-home-divider-size) solid var(--c-bg-subtle, #f8f9fa)');
    });
});
