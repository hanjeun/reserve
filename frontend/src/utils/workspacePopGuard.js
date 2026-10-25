/*
 * POP 이동을 확인하는 동안 현재 URL과 폼을 유지한다. 승인 시 목적지로 한 번만 이동하고 문서 이탈은 beforeunload가 보호한다.
 */
export function installWorkspacePopGuard({ browser, shouldBlock, requestLeave }) {
    let acceptedIndex = browser.history.state?.idx;
    let pending = null;
    let replayIndex = null;
    let disposed = false;
    const onPop = event => {
        const targetIndex = event.state?.idx;
        if (replayIndex === targetIndex && replayIndex !== null) { replayIndex = null; return; }
        if (pending) {
            event.stopImmediatePropagation();
            if (targetIndex !== pending.origin) {
                if (Number.isInteger(targetIndex)) browser.history.go(pending.origin - targetIndex);
                return;
            }
            if (pending.confirming) return;
            acceptedIndex = pending.origin;
            pending.confirming = true;
            const attempt = pending;
            void requestLeave(() => {
                if (disposed || pending !== attempt) return;
                replayIndex = attempt.target;
                pending = null;
                browser.history.go(attempt.target - attempt.origin);
            }).finally(() => { if (pending === attempt) pending = null; });
            return;
        }
        if (!shouldBlock() || !Number.isInteger(acceptedIndex) || !Number.isInteger(targetIndex) || targetIndex === acceptedIndex) return;
        event.stopImmediatePropagation();
        pending = { origin: acceptedIndex, target: targetIndex, confirming: false };
        browser.history.go(acceptedIndex - targetIndex);
    };
    browser.addEventListener('popstate', onPop, true);
    return {
        sync: () => { acceptedIndex = browser.history.state?.idx; },
        dispose: () => { disposed = true; pending = null; browser.removeEventListener('popstate', onPop, true); },
    };
}
