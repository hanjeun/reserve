import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { admissionPollingTiming, createAdmissionPollingCoordinator, readAdmissionStatus } from './admissionPollingCoordinator';

const NOW = Date.parse('2026-10-23T00:00:00Z');
const TICKET = '11111111-1111-4111-8111-111111111111';
const REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const status = changes => ({ campaignId: 'sale-1', state: 'WAITING', position: 3, expiresAt: 0,
    serverTime: Date.now(), heartbeatTimeoutSeconds: 30, pollAfterSeconds: 4, ...changes });
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

describe('bounded admission polling coordination', () => {
    let channels;
    let messages;
    let held;
    let locks;
    let coordinators;
    let allLocksBusy;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        channels = []; messages = []; held = new Set(); coordinators = []; allLocksBusy = false;
        class Channel {
            constructor(name) { this.name = name; this.listeners = new Set(); this.closed = false; channels.push(this); }
            addEventListener(_type, listener) { this.listeners.add(listener); }
            postMessage(data) {
                messages.push(data);
                Promise.resolve().then(() => {
                    channels.filter(channel => channel !== this && !channel.closed && channel.name === this.name)
                        .forEach(channel => channel.listeners.forEach(listener => listener({ data })));
                });
            }
            close() { this.closed = true; this.listeners.clear(); }
        }
        locks = { request: vi.fn(async (name, _options, callback) => {
            if (allLocksBusy || held.has(name)) return callback(null);
            held.add(name);
            try { return await callback({ name }); }
            finally { held.delete(name); }
        }) };
        vi.stubGlobal('navigator', { locks });
        vi.stubGlobal('BroadcastChannel', Channel);
        vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async (_algorithm, data) => createHash('sha256').update(data).digest()) } });
    });
    afterEach(() => {
        coordinators.forEach(coordinator => coordinator.dispose());
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    function create(changes = {}) {
        const coordinator = createAdmissionPollingCoordinator({ owner: { userId: '7', role: 'USER' },
            campaignId: 'sale-1', ticket: TICKET, verifiedStatus: status(), ...changes });
        coordinators.push(coordinator);
        return coordinator;
    }
    function deliver(data, channel = channels[0]) {
        channel.listeners.forEach(listener => listener({ data }));
    }
    const envelope = (channel, changes = {}) => ({ version: 1, scope: channel.name.split(':')[1],
        observedAt: Date.now(), status: status(), ...changes });

    it('deduplicates simultaneous periodic reads without broadcasting credentials, tickets, or request IDs', async () => {
        const first = create(); const second = create();
        await flush();
        const firstFetch = vi.fn(async () => ({ ...status(), ticket: TICKET, requestId: REQUEST, token: 'private-token' }));
        const secondFetch = vi.fn(async () => status());
        const results = await Promise.all([first.read(firstFetch, status()), second.read(secondFetch, status())]);
        expect(firstFetch.mock.calls.length + secondFetch.mock.calls.length).toBe(1);
        expect(results.map(result => result.source).sort()).toEqual(['remote', 'server']);
        expect(results.find(result => result.source === 'remote').status).toEqual(status());
        expect(JSON.stringify(messages)).not.toMatch(/private-token|requestId|ticket/);
        expect(JSON.stringify(messages)).not.toContain(REQUEST);
        expect(channels[0].name).toMatch(/^reserve-admission-poll-v1:[0-9a-f]{64}$/);
        expect(channels[0].name).not.toContain(TICKET);
        expect(localStorage.length).toBe(0);
    });

    it.each([
        { owner: { userId: '8', role: 'USER' } },
        { owner: { userId: '7', role: 'BUSINESS' } },
        { campaignId: 'sale-2', verifiedStatus: status({ campaignId: 'sale-2' }) },
        { ticket: 'different-opaque-continuity-id' },
    ])('isolates a different member, role, campaign, or ticket %#', async changes => {
        const first = create(); const second = create(changes);
        await flush();
        const a = vi.fn(async () => status());
        const b = vi.fn(async () => status({ campaignId: changes.campaignId || 'sale-1' }));
        await Promise.all([first.read(a, status()), second.read(b, status())]);
        expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce();
        expect(channels[0].name).not.toBe(channels[1].name);
    });

    it('shares an anonymous epoch only with itself and isolates a new epoch and logged-in owner', async () => {
        const first = create({ owner: 'anonymous-epoch-1' });
        const same = create({ owner: 'anonymous-epoch-1' });
        const changed = create({ owner: 'anonymous-epoch-2' });
        const member = create();
        await flush();
        const reads = [first, same, changed, member].map(() => vi.fn(async () => status()));
        await Promise.all([first, same, changed, member].map((coordinator, i) => coordinator.read(reads[i], status())));
        expect(reads.reduce((count, read) => count + read.mock.calls.length, 0)).toBe(3);
        expect(channels[0].name).toBe(channels[1].name);
        expect(new Set(channels.map(channel => channel.name)).size).toBe(3);
    });

    it('rejects stale, future, mismatched, and malformed shared snapshots', async () => {
        const coordinator = create(); await flush();
        const channel = channels[0];
        [
            { scope: 'wrong-scope' }, { observedAt: NOW - 1 }, { observedAt: NOW + 1 },
            { status: status({ campaignId: 'wrong-campaign' }) }, { status: status({ state: 'UNKNOWN' }) },
            { status: status({ position: -1 }) }, { status: status({ serverTime: NOW - 1 }) },
            { status: status({ serverTime: NOW + 60000 }) }, { status: status({ expiresAt: '100' }) },
            { status: status({ heartbeatTimeoutSeconds: 1 }) }, { status: status({ pollAfterSeconds: 1000 }) },
        ].forEach(change => deliver(envelope(channel, change)));
        const fetchStatus = vi.fn(async () => status());
        expect((await coordinator.read(fetchStatus, status())).source).toBe('server');
        expect(fetchStatus).toHaveBeenCalledOnce();
    });

    it('reuses a recent allowlisted snapshot but fetches after its heartbeat cadence expires', async () => {
        const coordinator = create(); await flush();
        deliver(envelope(channels[0], { status: status({ secret: 'excluded', requestId: REQUEST }) }));
        await vi.advanceTimersByTimeAsync(1000);
        const fetchStatus = vi.fn(async () => status());
        const shared = await coordinator.read(fetchStatus, status());
        expect(shared).toEqual({ status: status({ serverTime: NOW }), source: 'remote', observedAt: NOW });
        expect(fetchStatus).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(3000);
        expect((await coordinator.read(fetchStatus, status())).source).toBe('server');
        expect(fetchStatus).toHaveBeenCalledOnce();
    });

    it('does not regress a newer admitted snapshot when an overlapping slow reader returns older data', async () => {
        const coordinator = create(); await flush();
        let resolveStatus;
        const read = coordinator.read(() => new Promise(resolve => { resolveStatus = resolve; }), status());
        await flush();
        await vi.advanceTimersByTimeAsync(1000);
        deliver(envelope(channels[0], { status: status({ state: 'ADMITTED', expiresAt: NOW + 180000 }) }));
        resolveStatus(status({ serverTime: NOW }));
        expect(await read).toMatchObject({ source: 'remote', observedAt: NOW + 1000, status: { state: 'ADMITTED' } });
        expect(messages).toEqual([]);
    });

    it('shares service mode changes with opaque continuity while excluding a changed continuity identifier', async () => {
        const continuityId = 'a'.repeat(64);
        const initial = status({ campaignId: 'service-entry', state: 'ADMITTED', expiresAt: NOW + 86400000,
            absoluteExpiresAt: NOW + 3600000, mode: 'CORE', continuityId,
            heartbeatTimeoutSeconds: 86400, pollAfterSeconds: 60 });
        const coordinator = create({ campaignId: 'service-entry', ticket: continuityId, verifiedStatus: initial });
        await flush();
        deliver(envelope(channels[0], { status: { ...initial, mode: 'OFF', state: 'BYPASS', expiresAt: 0,
            continuityId: 'b'.repeat(64) } }));
        const fetchStatus = vi.fn(async () => initial);
        expect((await coordinator.read(fetchStatus, initial)).source).toBe('server');
        await vi.advanceTimersByTimeAsync(1000);
        deliver(envelope(channels[0], { status: { ...initial, mode: 'OFF', state: 'BYPASS', expiresAt: 0,
            continuityId: null, serverTime: Date.now() } }));
        const result = await coordinator.read(fetchStatus, initial);
        expect(result).toMatchObject({ source: 'remote', status: { mode: 'OFF', state: 'BYPASS', continuityId: null,
            absoluteExpiresAt: NOW + 3600000, heartbeatTimeoutSeconds: 86400, pollAfterSeconds: 60 } });
        expect(fetchStatus).toHaveBeenCalledOnce();
    });

    it.each(['hidden', 'closed'])('lets a visible follower take over after the current reader is %s', async reason => {
        let visible = true;
        const first = create({ isVisible: () => visible }); const second = create();
        await flush();
        const controller = new AbortController();
        const firstFetch = vi.fn(() => new Promise(() => {}));
        const secondFetch = vi.fn(async () => status());
        const leader = first.read(firstFetch, { ...status(), signal: controller.signal });
        const rejected = expect(leader).rejects.toMatchObject({ name: 'AbortError' });
        await flush();
        const follower = second.read(secondFetch, status());
        await flush();
        if (reason === 'hidden') { visible = false; document.dispatchEvent(new Event('visibilitychange')); }
        else first.dispose();
        await rejected;
        await vi.advanceTimersByTimeAsync(2000);
        expect((await follower).source).toBe('server');
        expect(firstFetch.mock.calls[0][0].aborted).toBe(true);
        expect(secondFetch).toHaveBeenCalledOnce();
    });

    it('falls back to a bounded direct read when another tab holds a stalled lock', async () => {
        allLocksBusy = true;
        const coordinator = create(); await flush();
        const fetchStatus = vi.fn(async () => status());
        const read = coordinator.read(fetchStatus, status());
        await flush();
        await vi.advanceTimersByTimeAsync(1999);
        expect(fetchStatus).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect((await read).source).toBe('server');
        expect(fetchStatus).toHaveBeenCalledOnce();
        expect(locks.request).toHaveBeenCalledTimes(2);
    });

    it('aborts follower waits and suppresses late callbacks and broadcasts across session disposal', async () => {
        let current = true;
        const coordinator = create({ isCurrent: () => current }); await flush();
        let resolveStatus;
        const fetchStatus = vi.fn(() => new Promise(resolve => { resolveStatus = resolve; }));
        const read = coordinator.read(fetchStatus, status());
        const rejected = expect(read).rejects.toMatchObject({ name: 'AbortError' });
        await flush();
        current = false; coordinator.dispose();
        await rejected;
        resolveStatus(status({ state: 'ADMITTED', expiresAt: NOW + 180000 }));
        await flush();
        expect(messages).toEqual([]);
        expect(channels.every(channel => channel.closed)).toBe(true);
        expect(held.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);

        allLocksBusy = true;
        const follower = create(); await flush();
        const fetchFollower = vi.fn();
        const waiting = follower.read(fetchFollower, status());
        const waitingRejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
        await flush(); follower.dispose(); await waitingRejected;
        await vi.advanceTimersByTimeAsync(10000);
        expect(fetchFollower).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['locks', 'channel', 'crypto', 'rejected-lock', 'unverified'])('keeps independent server reads when coordination is unavailable: %s', async unavailable => {
        if (unavailable === 'locks') vi.stubGlobal('navigator', {});
        if (unavailable === 'channel') vi.stubGlobal('BroadcastChannel', undefined);
        if (unavailable === 'crypto') vi.stubGlobal('crypto', {});
        if (unavailable === 'rejected-lock') locks.request.mockRejectedValue(new Error('denied'));
        const first = create(unavailable === 'unverified' ? { verifiedStatus: null } : {});
        const second = create(unavailable === 'unverified' ? { verifiedStatus: null } : {});
        await flush();
        const a = vi.fn(async () => status()); const b = vi.fn(async () => status());
        await Promise.all([first.read(a, status()), second.read(b, status())]);
        expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce();
        expect(messages).toEqual([]);
    });

    it('does not wait for stalled hashing and times out a status reader that ignores abort', async () => {
        crypto.subtle.digest.mockImplementation(() => new Promise(() => {}));
        const coordinator = create();
        const fetchStatus = vi.fn(() => new Promise(() => {}));
        const read = coordinator.read(fetchStatus, status());
        const rejected = expect(read).rejects.toMatchObject({ admissionPollingTimeout: true });
        await flush();
        expect(fetchStatus).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(5000);
        await rejected;
        expect(fetchStatus.mock.calls[0][0].aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps compatibility defaults and bounds reservation retries within the heartbeat budget', async () => {
        expect(admissionPollingTiming()).toMatchObject({ heartbeatTimeoutSeconds: 90, pollAfterSeconds: 4 });
        const minimum = admissionPollingTiming({ heartbeatTimeoutSeconds: 30, pollAfterSeconds: 20 });
        expect(minimum).toMatchObject({ pollAfterSeconds: 10, requestTimeoutMs: 5000, failoverWaitMs: 2000, retryCapMs: 3000 });
        expect(minimum.requestTimeoutMs + minimum.failoverWaitMs + minimum.retryCapMs).toBeLessThanOrEqual(10000);
        expect(admissionPollingTiming({ heartbeatTimeoutSeconds: 900, pollAfterSeconds: 60 }))
            .toMatchObject({ heartbeatTimeoutSeconds: 900, pollAfterSeconds: 60 });
        expect(admissionPollingTiming({ heartbeatTimeoutSeconds: 86400, pollAfterSeconds: 60 }))
            .toMatchObject({ heartbeatTimeoutSeconds: 86400, pollAfterSeconds: 60 });
        const controller = new AbortController(); controller.abort();
        const fetchStatus = vi.fn();
        await expect(readAdmissionStatus(fetchStatus, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchStatus).not.toHaveBeenCalled();
    });
});
