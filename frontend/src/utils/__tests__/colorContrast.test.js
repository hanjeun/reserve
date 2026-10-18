import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it, vi } from 'vitest';
import { ACCENT_OPTIONS, initTheme } from '../../hooks/useTheme';
import { colors, semanticActionPalettes } from '../../styles/tokens/colors';
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
const tokenValue = (token, properties) => {
    const match = /^var\((--[a-z-]+),\s*(#[a-f\d]{6})\)$/i.exec(token);
    expect(match, token).not.toBeNull();
    return properties[match[1]] ?? match[2];
};

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

    it('keeps initial primary CSS and semantic solid/hover fallbacks readable before theme initialization', () => {
        const css = postcss.parse(readFileSync('src/styles/theme.css', 'utf8'));
        for (const selector of [':root', "[data-theme='dark']"]) {
            const values = {};
            css.walkRules(rule => { if (rule.selector === selector) rule.walkDecls(decl => { values[decl.prop] = decl.value; }); });
            expect(values['--c-primary-solid']).toMatch(/^#[a-f\d]{6}$/i);
            expect(values['--c-primary-solid-hover']).toMatch(/^#[a-f\d]{6}$/i);
            for (const role of ['primary', 'success', 'error']) {
                const foreground = tokenValue(colors[role].foreground, values);
                expect(foreground).toBe('#ffffff');
                for (const state of ['solid', 'solidHover']) {
                    expect(ratio(tokenValue(colors[role][state], values), foreground)).toBeGreaterThanOrEqual(4.5);
                }
            }
        }
        for (const palettes of Object.values(semanticActionPalettes)) {
            for (const palette of Object.values(palettes)) {
                expect(palette.foreground).toBe('#ffffff');
                expect(ratio(palette.solid, palette.foreground)).toBeGreaterThanOrEqual(4.5);
                expect(ratio(palette.solidHover, palette.foreground)).toBeGreaterThanOrEqual(4.5);
            }
        }
        for (const role of ['success', 'error']) {
            for (const state of ['foreground', 'solid', 'solidHover']) {
                expect(tokenValue(colors[role][state], {})).toBe(semanticActionPalettes.light[role][state]);
            }
        }
    });

    it('injects the semantic filled palette for either system theme before app rendering', () => {
        const root = document.documentElement;
        const previousStyle = root.getAttribute('style');
        const previousTheme = root.getAttribute('data-theme');
        const originalMatchMedia = window.matchMedia;
        let dark = false;
        const media = vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
            ...originalMatchMedia(query), matches: query === '(prefers-color-scheme: dark)' && dark,
        }));
        try {
            for (const mode of ['light', 'dark']) {
                dark = mode === 'dark';
                initTheme();
                expect(root.dataset.theme).toBe(mode);
                for (const role of ['success', 'error']) {
                    const palette = semanticActionPalettes[mode][role];
                    const foreground = root.style.getPropertyValue(`--c-${role}-fg`);
                    expect(foreground).toBe(palette.foreground);
                    for (const [state, suffix] of [['solid', 'solid'], ['solidHover', 'solid-hover']]) {
                        const background = root.style.getPropertyValue(`--c-${role}-${suffix}`);
                        expect(background).toBe(palette[state]);
                        expect(ratio(background, foreground)).toBeGreaterThanOrEqual(4.5);
                    }
                }
            }
        } finally {
            media.mockRestore();
            if (previousStyle === null) root.removeAttribute('style');
            else root.setAttribute('style', previousStyle);
            if (previousTheme === null) root.removeAttribute('data-theme');
            else root.setAttribute('data-theme', previousTheme);
        }
    });
});
