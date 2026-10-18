/**
 * BrowserRouter의 POP 이벤트가 폼을 해제하기 전에 기존 history 항목으로 돌아온다.
 * 취소하면 URL·컴포넌트를 유지하고, 승인하면 원래 목적지로 한 번만 이동한다.
 * 새 문서로 나가는 이동은 브라우저 beforeunload가 보호한다.
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
