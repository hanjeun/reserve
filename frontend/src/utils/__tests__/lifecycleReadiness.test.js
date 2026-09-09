import { describe, expect, it } from 'vitest';
import { canCloseStore, canWithdrawMember } from '../lifecycleReadiness';

describe.each([
    ['canClose', canCloseStore],
    ['canWithdraw', canWithdrawMember],
])('lifecycle readiness: %s', (field, allowed) => {
    it('allows only explicit boolean true, never missing or malformed data', () => {
        for (const value of [null, undefined, {}, { [field]: false }, { [field]: 'true' }, { [field]: 1 },
            { unresolvedReservations: 0, activeAdvertisements: 0, openPaymentIssues: 0 }]) {
            expect(allowed(value)).toBe(false);
        }
        expect(allowed({ [field]: true })).toBe(true);
    });
});
