const KEY = 'reserve:oauth-login-feedback';
const MAX_AGE_MS = 30_000;

/** Carry only a short-lived identity receipt across the OAuth document replacement. */
export function rememberLoginFeedback(user) {
    if (user?.id == null || !user.role || user.termsAgreed === false) return;
    try {
        sessionStorage.setItem(KEY, JSON.stringify({ id: user.id, role: user.role, at: Date.now() }));
    } catch { /* A blocked storage area must not prevent authentication or navigation. */ }
}

/** Consume before presenting so remounts cannot repeat it or greet another account. */
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
