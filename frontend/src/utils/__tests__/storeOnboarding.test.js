import { describe, expect, it } from 'vitest';
import {
    STORE_ONBOARDING_DOMAINS, STORE_ONBOARDING_DEFAULTS, onboardingSteps, onboardingFieldRules,
    onboardingPreviewDestination, migrateOnboardingDraft, normalizeOnboardingSubmission,
} from '../storeOnboarding';
import { buildStoreFormData } from '../form';
import { hydrateStoreFormValues, serializeStoreFormValues } from '../storeDraftStorage';

const defaults = values => ({ ...STORE_ONBOARDING_DEFAULTS, ...values });
const validated = values => onboardingSteps(defaults(values), 'edit').flatMap(step => step.fields);

describe('onboarding domain policy and compatibility', () => {
    it('has nine domains and assigns each field to exactly one owner', () => {
        expect(STORE_ONBOARDING_DOMAINS).toHaveLength(9);
        const names = STORE_ONBOARDING_DOMAINS.flatMap(domain => domain.fields.map(field => field.name));
        expect(new Set(names).size).toBe(names.length);
        expect(onboardingPreviewDestination('예약 마감', defaults(), 'edit')).toBe('booking-policy');
        expect(onboardingPreviewDestination('결제 마감', defaults({ noShowDeposit: 1000 }), 'edit')).toBe('deposit');
        expect(onboardingPreviewDestination('환불 정책', defaults({ noShowDeposit: 1000 }), 'edit')).toBe('refund');
    });

    it('does not require a cutoff, payment fields or refund fields for a free reservation edit', () => {
        expect(onboardingFieldRules('bookingDeadlineHours', defaults())).toEqual([]);
        for (const name of ['noShowDeposit', 'paymentTimeoutMinutes', 'fullRefundDays']) expect(validated({ bookingDeadlineHours: null })).not.toContain(name);
        expect(normalizeOnboardingSubmission(defaults({ bookingDeadlineHours: null, allowLatePayment: true }), 'edit'))
            .toMatchObject({ bookingDeadlineHours: 0, noShowDeposit: 0, allowLatePayment: false });
    });

    it('requires late-payment expiry only for the enabled paid timing branch', () => {
        expect(validated({ noShowDeposit: 1000, allowLatePayment: false })).not.toContain('paymentTimeoutMinutes');
        expect(validated({ noShowDeposit: 1000, allowLatePayment: true })).toContain('paymentTimeoutMinutes');
        expect(validated({ noShowDeposit: 1000, _depositEnabled: false, allowLatePayment: true })).not.toContain('paymentTimeoutMinutes');
        expect(validated({ noShowDeposit: 1000, fullRefundDays: 0 })).not.toContain('partialRefundDays');
    });

    it('validates sessions and breaks only in the booking modes that actually use them', () => {
        expect(validated({ bookingType: 'SESSION' })).toContain('sessionTimes');
        expect(validated({ bookingType: 'SESSION' })).not.toContain('breakTimes');
        expect(validated({ bookingType: 'DAY' })).not.toContain('sessionTimes');
        const waiting = validated({ reservationEnabled: false, noShowDeposit: 1000 });
        for (const name of ['noShowDeposit', 'breakTimes', 'sessionTimes', 'maxCapacityPerSlot']) expect(waiting).not.toContain(name);
        expect(waiting).toContain('times');
    });

    it('preserves hidden paid settings on an edit but creates waiting-only stores without a deposit', () => {
        const values = defaults({ reservationEnabled: false, waitingIntakeMode: 'ON_SITE', noShowDeposit: 1000 });
        expect(normalizeOnboardingSubmission(values, 'edit').noShowDeposit).toBe(1000);
        expect(normalizeOnboardingSubmission(values, 'create').noShowDeposit).toBe(0);
        expect(normalizeOnboardingSubmission({ ...values, _depositEnabled: false }, 'edit').noShowDeposit).toBe(0);
    });

    it('maps a legacy operation step and history while retaining explicit clears and removing invented undefined dates', () => {
        const restored = migrateOnboardingDraft({ _onboardingStep: 'operation', _onboardingHistory: ['industry', 'booking'],
            closedDates: undefined, times: undefined, operatingPeriod: null, closedDays: [], bookingDeadlineHours: null }, 'edit');
        expect(restored).toMatchObject({ _onboardingStep: 'operation', _onboardingHistory: ['industry', 'booking'],
            operatingPeriod: null, closedDays: [], bookingDeadlineHours: 0, _onboardingVersion: 2 });
        expect(restored).not.toHaveProperty('closedDates');
        expect(restored).not.toHaveProperty('times');
    });

    it('does not turn omitted fields into explicit clears during draft serialization or multipart submission', () => {
        const fields = ['closedDates', 'closedDays', 'times', 'breakTimes', 'operatingPeriod', 'sessionTimes'];
        const roundtrip = hydrateStoreFormValues(serializeStoreFormValues({ name: '부분 수정' }));
        for (const field of fields) expect(roundtrip).not.toHaveProperty(field);
        const payload = buildStoreFormData(roundtrip);
        for (const field of ['closedDates', 'closedDays', 'openDate', 'closeDate', 'maxCapacityPerSlot', 'breakStartTime', 'breakEndTime', 'bookingDeadlineHours']) {
            expect(payload.has(field)).toBe(false);
        }
        const cleared = buildStoreFormData({ closedDates: [], closedDays: [], operatingPeriod: null, breakTimes: null, maxCapacityPerSlot: null });
        for (const field of ['closedDates', 'closedDays', 'openDate', 'closeDate', 'maxCapacityPerSlot', 'breakStartTime', 'breakEndTime']) expect(cleared.get(field)).toBe('');
    });
});
