import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = postcss.parse(readFileSync(resolve(cwd(), 'src/styles/global/feature-surfaces.css'), 'utf8'));

function declarations(selector, media = null) {
    const result = {};
    css.walkRules(rule => {
        if (!rule.selectors.includes(selector)) return;
        const parentMedia = rule.parent.type === 'atrule' ? rule.parent.params : null;
        if (parentMedia !== media) return;
        rule.walkDecls(declaration => { result[declaration.prop] = declaration.value; });
    });
    return result;
}

describe('messenger interaction roles', () => {
    it('keeps unread badges red and overlays message actions without reserving an extra column', () => {
        for (const selector of ['.reserve-messenger-unread', '.reserve-messenger-footer-badge']) {
            expect(declarations(selector).background).toBe('color-mix(in srgb, var(--c-error, #f04452) 50%, #000)');
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
        expect(declarations('.reserve-chat-attachment-preview:hover::after').opacity).toBe('0.2');
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
            background: 'var(--c-gray-100, #f2f4f6)', color: 'var(--c-text-secondary, #4e5968)',
        });
        expect(declarations('.reserve-messenger-mobile-back:hover')).toEqual({});
        expect(declarations('.reserve-messenger-mobile-back:hover', hoverMedia).background).toBe('var(--c-gray-50, #f9fafb)');
        expect(declarations(".reserve-messenger-list-refresh:hover:not([aria-disabled='true'])")).toEqual({});
        expect(declarations(".reserve-messenger-list-refresh:hover:not([aria-disabled='true'])", hoverMedia).background)
            .toBe('var(--c-gray-50, #f9fafb)');
        expect(declarations('.reserve-messenger-footer-tab:hover').background).toBe('transparent');
        expect(declarations('.reserve-messenger-support-question:hover:not(:disabled)')).toMatchObject({
            color: 'var(--c-text-primary, #191f28)', 'border-color': 'var(--c-gray-400, #b5b8bd)',
        });
        for (const selector of [
            '.reserve-chat-close:active',
            '.reserve-messenger-mobile-back:active',
            ".reserve-messenger-list-refresh:active:not([aria-disabled='true'])",
            '.reserve-messenger-footer-tab:active',
        ]) {
            expect(declarations(selector)).toMatchObject({ opacity: '0.7' });
            expect(declarations(selector)).not.toHaveProperty('transform');
        }
    });

    it('keeps CTA press feedback and keyboard focus while removing blue mouse focus outlines', () => {
        expect(declarations('.reserve-messenger-primary-action:active').transform).toBe('scale(0.98)');
        expect(declarations('.reserve-chat-send:active:not(:disabled)').transform).toBe('scale(0.96)');
        expect(declarations('.reserve-messenger .reserve-btn:active:not(:disabled)')).toEqual({});
        expect(declarations('.reserve-chat-composer:focus-within')).toMatchObject({
            'border-color': 'var(--c-gray-500, #8b95a1)', 'box-shadow': 'none',
        });
        for (const selector of [
            '.reserve-chat-close:focus-visible',
            '.reserve-messenger-mobile-back:focus-visible',
            '.reserve-chat-send:focus-visible',
        ]) {
            expect(declarations(selector).outline).toBe('2px solid var(--c-text-secondary, #4e5968)');
        }
        expect(declarations('.reserve-messenger-primary-action:focus-visible').outline)
            .toBe('2px solid var(--c-text-secondary, #4e5968)');
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
    });
});
