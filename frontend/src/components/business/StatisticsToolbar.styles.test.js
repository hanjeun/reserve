import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const stylesheet = postcss.parse(readFileSync(resolve('src/styles/global/store-listing-toolbar.css'), 'utf8'));
const statisticsTabSource = readFileSync(resolve('src/components/business/StatisticsTab.jsx'), 'utf8');

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

describe('business statistics toolbar source contract', () => {
    it('keeps the refresh slot mounted during the first store-list fetch', () => {
        expect(statisticsTabSource).toContain('const handleReload = storeId ? refetch : refetchStores;');
        expect(statisticsTabSource).toContain('onReload={handleReload}');
        expect(statisticsTabSource).not.toContain('onReload={storeId ? refetch : undefined}');
    });

    it('joins the range selector to refresh only on desktop statistics', () => {
        expect(styleAtWidth('.reserve-statistics-tab .reserve-filter-toolbar-controls', 1440).flex).toBe('1 1 auto');
        expect(styleAtWidth('.reserve-statistics-tab .reserve-filter-toolbar-extra', 1440)['margin-left']).toBe('auto');
        expect(styleAtWidth('.reserve-statistics-tab .reserve-filter-toolbar-refresh', 1440)['margin-left']).toBe('0');
        expect(styleAtWidth('.reserve-statistics-tab .reserve-filter-toolbar-controls', 768).gap).toBeUndefined();
        expect(styleAtWidth('.reserve-statistics-tab .reserve-filter-toolbar-extra', 768)['margin-left']).toBeUndefined();
    });

    it('gives the store menu a separate row on narrow screens', () => {
        const toolbar = '.reserve-filter-toolbar-primary:has(.reserve-filter-toolbar-extra)';
        const controls = '.reserve-filter-toolbar-controls:has(> .reserve-filter-toolbar-extra)';

        expect(styleAtWidth(toolbar, 390)['grid-template-columns']).toBe('minmax(0, 1fr) auto');
        expect(styleAtWidth(controls, 390).display).toBe('contents');
        expect(styleAtWidth(controls + ' > .reserve-filter-menu', 390)['grid-column']).toBe('1 / -1');
        expect(styleAtWidth(toolbar + ' .reserve-filter-toolbar-refresh', 390)['padding-left']).toBe('0');
        expect(styleAtWidth(toolbar, 768).display).toBeUndefined();
    });
});
