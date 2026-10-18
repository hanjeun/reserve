import { describe, expect, it, vi } from 'vitest';
import { installWorkspacePopGuard } from './workspacePopGuard';

function browserAt(initial) {
    let index = initial;
    let listener;
    const delivered = [];
    const browser = {
        history: {
            get state() { return { idx: index }; },
            go(delta) {
                const target = index + delta;
                if (target < 0 || target === index) return;
                index = target;
                let stopped = false;
                listener?.({ state: { idx: index }, stopImmediatePropagation: () => { stopped = true; } });
                if (!stopped) delivered.push(target);
            },
        },
        addEventListener: (_, next) => { listener = next; },
        removeEventListener: () => { listener = null; },
    };
    return { browser, delivered, current: () => index };
}
function leaveDecision() {
    let answer;
    const requestLeave = vi.fn(action => new Promise(resolve => {
        answer = allowed => { if (allowed) action(); resolve(allowed); };
    }));
    return { requestLeave, answer: value => answer(value) };
}

describe('workspace POP draft boundary', () => {
    it('restores the original URL before asking and keeps both route and history on cancel', async () => {
        const history = browserAt(3);
        const decision = leaveDecision();
        installWorkspacePopGuard({ browser: history.browser, shouldBlock: () => true, requestLeave: decision.requestLeave });
        history.browser.history.go(-2);
        expect(history.current()).toBe(3);
        expect(history.delivered).toEqual([]);
        expect(decision.requestLeave).toHaveBeenCalledTimes(1);
        decision.answer(false);
        await Promise.resolve();
        history.browser.history.go(-1);
        expect(history.current()).toBe(3);
        expect(decision.requestLeave).toHaveBeenCalledTimes(2);
        decision.answer(false);
    });

    it('replays the exact destination once after approval, including a multi-entry jump', async () => {
        const history = browserAt(4);
        const decision = leaveDecision();
        installWorkspacePopGuard({ browser: history.browser, shouldBlock: () => true, requestLeave: decision.requestLeave });
        history.browser.history.go(-3);
        decision.answer(true);
        await Promise.resolve();
        expect(history.current()).toBe(1);
        expect(history.delivered).toEqual([1]);
        expect(decision.requestLeave).toHaveBeenCalledTimes(1);
    });

    it('does not stack confirmation when Back is pressed again before answering', async () => {
        const history = browserAt(2);
        const decision = leaveDecision();
        installWorkspacePopGuard({ browser: history.browser, shouldBlock: () => true, requestLeave: decision.requestLeave });
        history.browser.history.go(-1);
        history.browser.history.go(-1);
        expect(history.current()).toBe(2);
        expect(decision.requestLeave).toHaveBeenCalledTimes(1);
        decision.answer(true);
        await Promise.resolve();
        expect(history.delivered).toEqual([1]);
    });

    it('leaves clean Back/Forward untouched and removes the listener on disposal', () => {
        const history = browserAt(1);
        const requestLeave = vi.fn();
        const guard = installWorkspacePopGuard({ browser: history.browser, shouldBlock: () => false, requestLeave });
        history.browser.history.go(-1);
        guard.sync();
        history.browser.history.go(1);
        expect(history.delivered).toEqual([0, 1]);
        guard.dispose();
        history.browser.history.go(-1);
        expect(history.delivered).toEqual([0, 1, 0]);
        expect(requestLeave).not.toHaveBeenCalled();
    });

    it('cannot replay a pending move after the session provider is disposed', async () => {
        const history = browserAt(2);
        const decision = leaveDecision();
        const guard = installWorkspacePopGuard({ browser: history.browser, shouldBlock: () => true, requestLeave: decision.requestLeave });
        history.browser.history.go(-1);
        guard.dispose();
        decision.answer(true);
        await Promise.resolve();
        expect(history.current()).toBe(2);
        expect(history.delivered).toEqual([]);
    });
});
