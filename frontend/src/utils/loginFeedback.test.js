import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeLoginFeedback, rememberLoginFeedback } from './loginFeedback';

const user = { id: 7, role: 'USER', termsAgreed: true };
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

describe('OAuth login feedback receipt', () => {
    it('is consumed once for the verified account without storing a name or token', () => {
        rememberLoginFeedback({ ...user, name: '회원', token: 'must-not-be-stored' });
        expect(sessionStorage.getItem('reserve:oauth-login-feedback')).not.toContain('회원');
        expect(sessionStorage.getItem('reserve:oauth-login-feedback')).not.toContain('must-not-be-stored');
        expect(consumeLoginFeedback(user)).toBe(true);
        expect(consumeLoginFeedback(user)).toBe(false);
    });
    it('discards receipts for another account, role, anonymous or pending agreement', () => {
        for (const viewer of [{ ...user, id: 8 }, { ...user, role: 'ADMIN' }, null, { ...user, termsAgreed: false }]) {
            rememberLoginFeedback(user);
            expect(consumeLoginFeedback(viewer)).toBe(false);
            expect(consumeLoginFeedback(user)).toBe(false);
        }
    });
    it('discards expired and future-dated feedback', () => {
        vi.spyOn(Date, 'now').mockReturnValue(100_000);
        rememberLoginFeedback(user);
        vi.mocked(Date.now).mockReturnValue(130_001);
        expect(consumeLoginFeedback(user)).toBe(false);
        rememberLoginFeedback(user);
        vi.mocked(Date.now).mockReturnValue(100_000);
        expect(consumeLoginFeedback(user)).toBe(false);
    });
    it('does not interrupt login when stored data is malformed or storage is unavailable', () => {
        sessionStorage.setItem('reserve:oauth-login-feedback', '{bad');
        expect(consumeLoginFeedback(user)).toBe(false);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        expect(() => rememberLoginFeedback(user)).not.toThrow();
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        expect(consumeLoginFeedback(user)).toBe(false);
    });
});
