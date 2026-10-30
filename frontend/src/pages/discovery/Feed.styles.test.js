import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const read = file => readFileSync(resolve('src', file), 'utf8');
const stylesheets = ['styles/global/feature-surfaces.css', 'styles/global/feed.css']
    .map(file => postcss.parse(read(file)));

// 소스의 배치 계약을 비교하며 브라우저의 픽셀 측정으로 해석하지 않아요.
const styleAtWidth = (selectors, width, initial = {}) => {
    const style = { ...initial };
    for (const stylesheet of stylesheets) stylesheet.walkRules(rule => {
        if (!rule.selectors.some(selector => selectors.includes(selector))) return;
        for (let parent = rule.parent; parent; parent = parent.parent) {
            if (parent.type !== 'atrule' || parent.name !== 'media') continue;
            const min = parent.params.match(/min-width:\s*(\d+)px/);
            const max = parent.params.match(/max-width:\s*(\d+)px/);
            if (min && width < Number(min[1]) || max && width > Number(max[1])) return;
        }
        for (const node of rule.nodes.filter(node => node.type === 'decl')) {
            style[node.prop] = node.value;
            if (node.prop === 'padding') {
                const values = node.value.split(/\s+/);
                style['padding-top'] = values[0];
                style['padding-bottom'] = values[2] || values[0];
            }
        }
    });
    return style;
};

const number = value => Number.parseFloat(value) || 0;
const toolbarOffsets = (style, controlHeight) => {
    const top = number(style['padding-top']);
    const bottom = number(style['padding-bottom']);
    const border = number(style['border-bottom']);
    const height = Math.max(controlHeight + top + bottom + border, number(style['min-height']));
    return {
        controlTop: top + (height - top - bottom - border - controlHeight) / 2,
        contentTop: height + number(style['margin-bottom']),
    };
};

describe('feed directory toolbar alignment source contracts', () => {
    it('aligns the control row and following content with discovery and waiting at each breakpoint', () => {
        const referencePages = ['pages/store/StoreList.jsx', 'pages/discovery/Waiting.jsx'];
        for (const width of [320, 359, 390, 575, 576, 767, 768, 1280]) {
            const controlHeight = number(styleAtWidth(['.reserve-icon-tool'], width).height);
            expect(controlHeight).toBeGreaterThan(0);
            const feedPage = styleAtWidth(['.reserve-benefits-page', '.reserve-feed-directory'], width);
            const feedToolbar = toolbarOffsets(styleAtWidth(['.reserve-feed-directory-tools'], width), controlHeight);
            for (const file of referencePages) {
                const padding = read(file).match(/<PageContainer[\s\S]*?paddingTop="([^"]+)"[\s\S]*?className="reserve-explore-page"/)?.[1];
                expect(padding).toBeTruthy();
                const page = styleAtWidth(['.reserve-explore-page'], width, { 'padding-top': padding });
                const toolbar = toolbarOffsets(styleAtWidth(['.reserve-explore-filters'], width), controlHeight);
                expect(number(feedPage['padding-top']) + feedToolbar.controlTop).toBe(number(page['padding-top']) + toolbar.controlTop);
                expect(number(feedPage['padding-top']) + feedToolbar.contentTop).toBe(number(page['padding-top']) + toolbar.contentTop);
            }
        }
    });

    it('shares the directory frame and toolbar rules with the loading skeleton', () => {
        for (const file of ['pages/discovery/Feed.jsx', 'components/feed/FeedSkeleton.jsx']) {
            expect(read(file)).toMatch(/className="[^"]*\breserve-feed-directory\b[^"]*"/);
            expect(read(file)).toContain('className="reserve-feed-directory-tools"');
        }
    });
});
