const KEY = 'reserve:oauth-login-feedback';
const MAX_AGE_MS = 30_000;

/* OAuth 문서 전환에는 수명이 짧은 로그인 결과 정보만 전달한다. */
export function rememberLoginFeedback(user) {
    if (user?.id == null || !user.role || user.termsAgreed === false) return;
    try {
        sessionStorage.setItem(KEY, JSON.stringify({ id: user.id, role: user.role, at: Date.now() }));
    } catch { /* 저장소 차단으로 인증·이동을 막지 않는다. */ }
}

/* 표시 전에 소비해 재마운트나 다른 계정에서 로그인 인사를 반복하지 않는다. */
export function consumeLoginFeedback(user) {
    try {
        const saved = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
        if (!saved || user?.id == null || user.termsAgreed === false) return false;
        const receipt = JSON.parse(saved);
        const age = Date.now() - receipt.at;
        return receipt.id === user.id && receipt.role === user.role
            && Number.isFinite(receipt.at) && age >= 0 && age <= MAX_AGE_MS;
    } catch { return false; }
}
