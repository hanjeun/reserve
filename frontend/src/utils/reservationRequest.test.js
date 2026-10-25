import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reservationRequestAttempt, reservationRequestId, completeReservationRequest } from './reservationRequest';

const payload = { storeId: 10, reservationDate: '2030-01-01', reservationTime: '12:00', guestCount: 1, specialRequest: '개인 요청 내용', skipPayment: false };
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('recovers the same request after a module reload without storing form content', async () => {
    const id = await reservationRequestId('reload-user', payload);
    const stored = sessionStorage.getItem('reserve:reservation-request:reload-user');
    expect(stored).not.toContain(payload.specialRequest);
    expect(stored).not.toContain(payload.reservationDate);
    expect(JSON.parse(stored)).toEqual({ hash: expect.stringMatching(/^[0-9a-f]{64}$/), requestId: id });
    vi.resetModules();
    const fresh = await import('./reservationRequest');
    expect(await fresh.reservationRequestId('reload-user', payload)).toBe(id);
});

it('isolates accounts, changes a new payload key, and clears a confirmed result', async () => {
    const a = await reservationRequestId('scope-a', payload);
    expect(await reservationRequestId('scope-a', payload)).toBe(a);
    expect(await reservationRequestId('scope-b', payload)).not.toBe(a);
    expect(await reservationRequestId('scope-a', { ...payload, guestCount: 2 })).not.toBe(a);
    completeReservationRequest('scope-a');
    expect(sessionStorage.getItem('reserve:reservation-request:scope-a')).toBeNull();
});

it('keeps retries available when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const id = await reservationRequestId('storage-blocked', payload);
    expect(await reservationRequestId('storage-blocked', payload)).toBe(id);
});

it('keeps LAN HTTP preview retries in memory without persisting plaintext form data', async () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const id = await reservationRequestId('lan-preview', payload);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await reservationRequestId('lan-preview', payload)).toBe(id);
    expect(sessionStorage.length).toBe(0);
});

it('reports reuse only for an existing matching request and preserves the string ID wrapper', async () => {
    const first = await reservationRequestAttempt('attempt-reuse', payload);
    expect(first).toEqual({ requestId: expect.any(String), reused: false });
    expect(await reservationRequestAttempt('attempt-reuse', payload)).toEqual({ ...first, reused: true });
    expect(await reservationRequestId('attempt-reuse', payload)).toBe(first.requestId);
    expect(await reservationRequestAttempt('attempt-reuse', { ...payload, guestCount: 2 }))
        .toEqual({ requestId: expect.not.stringMatching(first.requestId), reused: false });
    completeReservationRequest('attempt-reuse');
    expect((await reservationRequestAttempt('attempt-reuse', payload)).reused).toBe(false);
});

it('recognizes persisted recovery metadata after F5 while discarding an invalid request UUID', async () => {
    const first = await reservationRequestAttempt('attempt-f5', payload);
    vi.resetModules();
    const fresh = await import('./reservationRequest');
    expect(await fresh.reservationRequestAttempt('attempt-f5', payload)).toEqual({ ...first, reused: true });
    const record = JSON.parse(sessionStorage.getItem('reserve:reservation-request:attempt-f5'));
    sessionStorage.setItem('reserve:reservation-request:invalid-attempt', JSON.stringify({ ...record, requestId: '-'.repeat(36) }));
    const invalid = await fresh.reservationRequestAttempt('invalid-attempt', payload);
    expect(invalid.reused).toBe(false);
    expect(invalid.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

it('persists the actual campaign submission key for recovery after the campaign is disabled', async () => {
    const scope = 'campaign-disabled';
    const first = await reservationRequestAttempt(scope, payload);
    const submitted = '11111111-1111-4111-8111-111111111111';
    expect(first.requestId).not.toBe(submitted);
    await reservationRequestAttempt(scope, payload, submitted);
    vi.resetModules();
    const fresh = await import('./reservationRequest');
    await expect(fresh.reservationRequestAttempt(scope, payload)).resolves.toEqual({ requestId: submitted, reused: true });
    await expect(fresh.reservationRequestAttempt(scope, { ...payload, reservationTime: '12:00:00' })).resolves.toEqual({ requestId: submitted, reused: true });
    expect(sessionStorage.getItem('reserve:reservation-request:campaign-disabled')).not.toContain(payload.specialRequest);
    await expect(fresh.reservationRequestAttempt(scope, payload, 'invalid')).rejects.toThrow('예약 요청 번호');
    await expect(fresh.reservationRequestAttempt(scope, payload)).resolves.toEqual({ requestId: submitted, reused: true });
});
