const KEY = 'reserve.security-return';
const LIFETIME = 5 * 60 * 1000;
const TARGETS = new Set(['setup-password', 'change-password', 'unlink', 'email', 'social', 'mfa']);

// 폼 복귀에만 쓰는 탭별 정보예요. 서버의 본인 확인·소유권 검증을 대신하지 않아요.
export function saveSecurityReturn(memberId, target) {
    if (memberId == null || !TARGETS.has(target)) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ memberId: String(memberId), target, createdAt: Date.now() })); }
    catch { /* 저장이 막혀도 인증 요청은 계속할 수 있어요. */ }
}

export function takeSecurityReturn(memberId) {
    try {
        const raw = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        const value = JSON.parse(raw);
        const age = Date.now() - value?.createdAt;
        return memberId != null && value?.memberId === String(memberId) && TARGETS.has(value.target)
            && Number.isFinite(value.createdAt) && age >= 0 && age <= LIFETIME ? value : null;
    } catch { return null; }
}

export function revealSecurityPanel(elementOrRead, reducedMotion) {
    let second;
    const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
            const element = typeof elementOrRead === 'function' ? elementOrRead() : elementOrRead;
            if (!element?.isConnected) return;
            element.scrollIntoView?.({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
            element.focus?.({ preventScroll: true });
        });
    });
    return () => { cancelAnimationFrame(first); if (second != null) cancelAnimationFrame(second); };
}
