import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = postcss.parse(readFileSync(resolve(cwd(), 'src/styles/global/feature-surfaces.css'), 'utf8'));
const iconCss = postcss.parse(readFileSync(resolve(cwd(), 'src/styles/global/icons.css'), 'utf8'));
const iconTokens = postcss.parse(readFileSync(resolve(cwd(), 'src/styles/tokens/icon-controls.css'), 'utf8'));

function declarations(selector, media = null, source = css) {
    const result = {};
    source.walkRules(rule => {
        if (!rule.selectors.some(value => typeof selector === 'function' ? selector(value) : value === selector)) return;
        const parentMedia = rule.parent.type === 'atrule' ? rule.parent.params : null;
        if (parentMedia !== media) return;
        rule.walkDecls(declaration => { result[declaration.prop] = declaration.value; });
    });
    return result;
}
const iconDeclarations = (control, suffix, media = null) => declarations(selector =>
    selector.startsWith(':is(') && selector.includes(control) && selector.endsWith(suffix), media, iconCss);
const iconPress = "):active:not(:disabled):not([aria-disabled='true'])";
const iconHover = "):hover:not(:disabled):not([aria-disabled='true'])::before";

describe('messenger interaction roles', () => {
    it('keeps unread badges red and overlays message actions without reserving an extra column', () => {
        for (const scope of ['.reserve-messenger', '.reserve-messenger-launcher-wrap']) {
            expect(declarations(scope)['--reserve-messenger-unread-bg'])
                .toBe('var(--c-error-solid, #c93643)');
        }
        for (const selector of ['.reserve-messenger-unread', '.reserve-messenger-footer-badge']) {
            expect(declarations(selector).background).toBe('var(--reserve-messenger-unread-bg)');
        }
        expect(declarations('.reserve-chat-message-meta > .reserve-chat-message-actions').position).toBe('absolute');
        expect(declarations('.reserve-chat-message-meta > .reserve-chat-message-time').position).toBe('absolute');
        expect(declarations('.reserve-chat-message-row:hover .reserve-chat-message-meta > .reserve-chat-message-time',
            '(hover: hover) and (pointer: fine)').visibility).toBe('hidden');
    });
    it('spans the stable footer row during both conversation transitions', () => {
        expect(declarations('.reserve-messenger-footer')['grid-row']).toBe('2');
        for (const selector of ['.reserve-messenger--panel > .reserve-messenger-thread',
            '.reserve-messenger.is-opening-thread > .reserve-messenger-thread',
            '.reserve-messenger.is-returning-to-list > .reserve-messenger-thread']) {
            expect(declarations(selector)['grid-area']).toBe('1 / 1 / -1 / 2');
        }
        expect(declarations('.reserve-chat-attachment-preview:hover::after', '(hover: hover) and (pointer: fine)').opacity).toBe('0.2');
        expect(declarations('.reserve-messenger-thread-heading .reserve-messenger-thread-avatar:hover::after').opacity).toBe('0.16');
    });
    it('opens threads with the same smooth duration and easing as returning to the list', () => {
        const entering = declarations('.reserve-messenger.is-opening-thread > .reserve-messenger-thread').animation;
        const leaving = declarations('.reserve-messenger.is-returning-to-list > .reserve-messenger-thread').animation;
        expect(entering).toBe(leaving.replace('reserve-messenger-thread-back-out', 'reserve-messenger-thread-in'));
        expect(entering).not.toContain('reverse');
        const listOut = css.nodes.find(node => node.type === 'atrule' && node.params === 'reserve-messenger-list-out');
        expect(listOut.nodes.find(node => node.selector === 'to').nodes.find(node => node.prop === 'opacity').value).toBe('0');
        expect(entering).toContain('0.26s cubic-bezier(0.4, 0, 0.2, 1)');
        expect(declarations('.reserve-messenger.is-opening-thread > .reserve-messenger-thread', '(prefers-reduced-motion: reduce)')['animation-duration'])
            .toBe('0.01ms');
    });

    it('uses neutral hover and press feedback without shrinking navigation controls', () => {
        const hoverMedia = '(hover: hover) and (pointer: fine)';
        expect(declarations('.reserve-chat-close:hover')).toEqual({});
        expect(declarations('.reserve-chat-close:hover', hoverMedia)).toMatchObject({
            background: 'transparent', color: 'var(--c-text-secondary, #4e5968)',
        });
        expect(declarations('.reserve-messenger-mobile-back:hover')).toEqual({});
        expect(declarations('.reserve-messenger-mobile-back:hover', hoverMedia).background).toBe('transparent');
        expect(declarations(".reserve-messenger-list-refresh:hover:not([aria-disabled='true'])")).toEqual({});
        expect(declarations(".reserve-messenger-list-refresh:hover:not([aria-disabled='true'])", hoverMedia).background)
            .toBe('transparent');
        expect(declarations('.reserve-messenger-footer-tab:hover').background).toBe('transparent');
        expect(declarations('.reserve-messenger-support-question:hover:not(:disabled)')).toMatchObject({
            color: 'var(--c-text-primary, #191f28)', 'border-color': 'var(--c-gray-400, #b5b8bd)',
        });
        for (const selector of [
            '.reserve-chat-close:active',
            '.reserve-messenger-mobile-back:active',
            ".reserve-messenger-list-refresh:active:not([aria-disabled='true'])",
        ]) {
            expect(declarations(selector)).not.toHaveProperty('transform');
        }
        for (const control of ['.reserve-chat-close', '.reserve-messenger-mobile-back', '.reserve-messenger-list-refresh']) {
            expect(iconDeclarations(control, iconPress)['--reserve-icon-current-scale']).toBe('var(--reserve-icon-active-scale)');
            expect(iconDeclarations(control, iconHover, hoverMedia).opacity).toBe('1');
        }
        expect(declarations('.reserve-messenger-footer-tab:active').opacity).toBe('0.7');
    });

    it('keeps CTA press feedback and keyboard focus while removing blue mouse focus outlines', () => {
        expect(declarations('.reserve-messenger-primary-action:active').transform).toBe('scale(0.98)');
        expect(declarations('.reserve-chat-send:active:not(:disabled)')).not.toHaveProperty('transform');
        expect(iconDeclarations('.reserve-chat-send', iconPress)['--reserve-icon-current-scale']).toBe('var(--reserve-icon-active-scale)');
        expect(iconDeclarations('.reserve-chat-send', ' .anticon').scale).toBe('var(--reserve-icon-current-scale)');
        expect(declarations(':root', null, iconTokens)['--reserve-icon-active-scale']).toBe('0.96');
        expect(declarations('.reserve-messenger .reserve-btn:active:not(:disabled)')).toEqual({});
        expect(declarations('.reserve-chat-composer:focus-within')).toMatchObject({
            'border-color': 'var(--c-gray-500, #8b95a1)', 'box-shadow': 'none',
        });
        for (const selector of [
            '.reserve-chat-close:focus-visible',
            '.reserve-messenger-mobile-back:focus-visible',
            '.reserve-chat-send:focus-visible',
        ]) {
            expect(declarations(selector).outline).toBe('var(--reserve-focus-ring)');
        }
        expect(declarations('.reserve-messenger-primary-action:focus-visible').outline)
            .toBe('var(--reserve-focus-ring)');
    });

    it('stops press motion in reduced-motion mode', () => {
        const reduced = '(prefers-reduced-motion: reduce)';
        expect(declarations('.reserve-messenger-primary-action:active', reduced).transform).toBe('none');
        expect(declarations('.reserve-chat-send:active:not(:disabled)', reduced).transform).toBe('none');
        expect(declarations('.reserve-messenger-primary-action', reduced).transition).toBe('none');
        // 기본 회전은 공통 RefreshButton과 같은 Ant Design SyncOutlined spin을 사용한다.
        expect(declarations('.reserve-messenger-list-refresh.is-refreshing .anticon')).not.toHaveProperty('animation');
        expect(declarations('.reserve-messenger-list-refresh.is-refreshing .anticon', reduced).animation)
            .toBe('none');
        expect(declarations(':root', reduced, iconTokens)).toMatchObject({
            '--reserve-icon-active-scale': '1', '--reserve-icon-press-transition': 'none',
        });
    });
});
