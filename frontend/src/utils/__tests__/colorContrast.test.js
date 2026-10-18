import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { ACCENT_OPTIONS } from '../../hooks/useTheme';
import { foregroundForSurface } from '../colorContrast';

const luminance = hex => {
    const linear = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map(channel => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const ratio = (background, foreground) => {
    const a = luminance(background), b = luminance(foreground);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const accents = ACCENT_OPTIONS.flatMap(option => ['light', 'darkMode'].map(mode => ({
    name: `${option.value} ${mode}`, ...option[mode],
})));

describe('theme foreground contrast', () => {
    it.each(accents)('keeps readable button text for $name', accent => {
        expect(accent.foreground).toBe('#ffffff');
        expect(ratio(accent.solid, accent.foreground)).toBeGreaterThanOrEqual(4.5);
        expect(ratio(accent.solidHover, accent.foreground)).toBeGreaterThanOrEqual(4.5);
    });

    it('uses white text on a dark surface and dark text on a light surface', () => {
        expect(foregroundForSurface('#1a1f27')).toBe('#ffffff');
        expect(foregroundForSurface('#ffffff')).toBe('#16181c');
    });

    it('keeps the initial CSS palette and semantic filled surfaces readable before theme initialization', () => {
        const css = postcss.parse(readFileSync('src/styles/theme.css', 'utf8'));
        for (const selector of [':root', "[data-theme='dark']"]) {
            const values = {};
            css.walkRules(rule => { if (rule.selector === selector) rule.walkDecls(decl => { values[decl.prop] = decl.value; }); });
            for (const role of ['primary', 'success', 'error']) {
                const background = values[role === 'primary' ? '--c-primary-solid' : `--c-${role}`];
                expect(ratio(background, values[`--c-${role}-fg`])).toBeGreaterThanOrEqual(4.5);
            }
        }
    });
});
