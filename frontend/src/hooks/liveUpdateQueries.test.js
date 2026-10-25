import { QueryCache, QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    clearDeniedQueryData, createLiveQueryRefresh, isBlockingListReadError, isLiveReadQuery, liveUpdateMatches,
    nextNewsBoundary, parseLiveUpdate,
} from './liveUpdateQueries';

const clients = [];
const client = options => {
    const value = new QueryClient({ defaultOptions: { queries: { retry: false } }, ...options });
    clients.push(value);
    return value;
};
const query = (...queryKey) => ({ queryKey });
const signal = (values = {}) => ({ eventId: 'server:1', epoch: 'server', revision: 1,
    domain: 'NEWS', entityId: 8, operation: 'UPDATED', ...values });
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
afterEach(() => { clients.forEach(value => value.clear()); clients.length = 0; });

describe('metadata update routing', () => {
    it('rejects malformed or incompatible signals', () => {
        expect(parseLiveUpdate(JSON.stringify(signal()))).toEqual(signal());
        for (const invalid of ['{', null, signal({ domain: 'PAYMENT' }), signal({ entityId: -1 }),
            signal({ eventId: 'another:1' }), signal({ revision: 1.5 }), signal({ storeId: '7' }),
            signal({ entityId: 0 }), signal({ targetType: 'PAYMENT' }), signal({ epoch: '', eventId: ':1' })]) {
            expect(parseLiveUpdate(invalid)).toBeNull();
        }
    });

    it('uses the real waiting key and the affected store, without querying another board', () => {
        const event = signal({ domain: 'WAITING', entityId: 7, storeId: 7 });
        expect(liveUpdateMatches(query('waiting', 2, 7), event)).toBe(true);
        expect(liveUpdateMatches(query('waiting', 2, 9), event)).toBe(false);
        expect(liveUpdateMatches(query('waiting', 2, 'my', 4), event)).toBe(true);
        expect(liveUpdateMatches(query('waiting-stores', {}), event)).toBe(true);
    });

    it('refreshes public news counts without making audit-bearing application reads for a like', () => {
        const event = signal({ targetType: 'NEWS' });
        expect(liveUpdateMatches(query('public-promotions', 'detail', 8), event)).toBe(true);
        expect(liveUpdateMatches(query('public-promotions', 'detail', 9), event)).toBe(false);
        expect(liveUpdateMatches(query('store-news', 'application', 8), event)).toBe(false);
        expect(liveUpdateMatches(query('store-news', 'applications', {}), event)).toBe(false);
        expect(liveUpdateMatches(query('store-news', 'application', 8), signal())).toBe(true);
    });

    it('refreshes saved-feed membership and removes unavailable liked content and notifications', () => {
        expect(liveUpdateMatches(query('feed', 'posts', { favoriteOnly: true }), signal({ domain: 'FAVORITE' }))).toBe(true);
        const removed = signal({ domain: 'FEED', operation: 'DELETED' });
        expect(liveUpdateMatches(query('feed', 'interactions', 'mine', {}), removed)).toBe(true);
        expect(liveUpdateMatches(query('feed', 'interactions', 'notifications', 'count'), removed)).toBe(true);
        expect(liveUpdateMatches(query('feed', 'interactions', 'comments', 9), removed)).toBe(false);
        // 검수의 UPDATED는 내용을 숨길 수 있으며 targetType만 있는 신호는 건수 갱신이다.
        for (const domain of ['FEED', 'COMMENT']) {
            const changed = signal({ domain });
            expect(liveUpdateMatches(query('feed', 'interactions', 'notifications', 'count'), changed)).toBe(true);
            expect(liveUpdateMatches(query('feed', 'interactions', 'notifications', 'count'), { ...changed, targetType: 'POST' })).toBe(false);
        }
        expect(liveUpdateMatches(query('feed', 'interactions', 'mine', {}), signal({ domain: 'FEED' }))).toBe(true);
    });

    it('never refreshes edit forms, QR issuance, payment, statistics or general admin audit queries', () => {
        for (const key of [
            ['stores', 'detail', 8, 'edit'], ['reservations', 'qrToken', 8], ['reservations', 'calendar', 8, '2026-10'],
            ['payments', 'status', 8], ['stores', 'statistics', 8, 'month'], ['admin', 'auditLogs'],
            ['admin', 'feed', 'comment-report', 8], ['store-news', 'config'],
            ['feed', 'me', 'profile'],
        ]) expect(isLiveReadQuery({ queryKey: key }), String(key)).toBe(false);
        expect(liveUpdateMatches(query('feed', 'me', 'profile'), signal({ domain: 'FEED' }))).toBe(false);
        expect(liveUpdateMatches(query('feed', 'me', 'posts', {}), signal({ domain: 'FEED' }))).toBe(true);
    });
});

describe('read freshness and private-cache boundaries', () => {
    it.each([
        [undefined, undefined, false], [undefined, [], false], [undefined, [{ id: 7 }], false],
        [{ status: 503 }, undefined, true], [{ status: 503 }, [], true], [{ status: 503 }, [{ id: 7 }], false],
        [{ response: { status: 401 } }, [{ id: 7 }], true], [{ status: 403 }, [{ id: 7 }], true],
        [{ status: 404 }, [{ id: 7 }], true], [{ status: 410 }, [{ id: 7 }], true],
    ])('distinguishes failed empty reads from cached rows without changing successful emptiness (%#)', (error, items, expected) => {
        expect(isBlockingListReadError(error, items)).toBe(expected);
    });

    it('keeps audit-bearing benefit reads out of periodic polling but preserves targeted events and reconnect reconciliation', async () => {
        const value = client();
        const keys = [
            ['public-promotions', 'list', {}],
            ['store-news', 'applications', { state: 'PENDING' }],
            ['store-news', 'application', 8],
            ['store-news', 'application', 9],
        ];
        const reads = keys.map(() => vi.fn().mockResolvedValue({ revision: 2 }));
        const stops = keys.map((key, index) => {
            value.setQueryData(key, { revision: 1 });
            return new QueryObserver(value, { queryKey: key, queryFn: reads[index], staleTime: Infinity }).subscribe(() => {});
        });
        const refresh = createLiveQueryRefresh(value, () => true);
        try {
            refresh([], true, { periodic: true });
            await vi.waitFor(() => expect(reads[0]).toHaveBeenCalledTimes(1));
            for (let index = 1; index < keys.length; index++) {
                expect(reads[index]).not.toHaveBeenCalled();
                expect(value.getQueryState(keys[index]).isInvalidated).toBe(false);
                expect(value.getQueryData(keys[index])).toEqual({ revision: 1 });
            }

            // 주기 갱신과 같은 배치의 수정도 해당 리뷰를 갱신한다.
            refresh([signal()], true, { periodic: true });
            await vi.waitFor(() => expect(value.getQueryData(keys[2])).toEqual({ revision: 2 }));
            expect(reads[2]).toHaveBeenCalledTimes(1);
            expect(reads[1]).toHaveBeenCalledTimes(1);
            expect(reads[3]).not.toHaveBeenCalled();

            refresh([], true);
            await vi.waitFor(() => {
                expect(reads[3]).toHaveBeenCalledTimes(1);
                expect(reads[1]).toHaveBeenCalledTimes(2);
                expect(reads[2]).toHaveBeenCalledTimes(2);
            });
        } finally { stops.forEach(stop => stop()); }
    });

    it.each([401, 403, 404, 410])('removes inaccessible entity data on %s without resetting the error or retrying', async status => {
        const value = client({ queryCache: new QueryCache({ onError: clearDeniedQueryData }) });
        const key = ['feed', 'post', 8];
        value.setQueryData(key, { body: 'formerly visible' });
        const read = vi.fn().mockRejectedValue({ response: { status } });
        const observer = new QueryObserver(value, { queryKey: key, queryFn: read, enabled: false });
        const stop = observer.subscribe(() => {});
        await observer.refetch();
        expect(value.getQueryData(key)).toBeUndefined();
        expect(value.getQueryState(key).status).toBe('error');
        expect(value.getQueryState(key).error.response.status).toBe(status);
        expect(read).toHaveBeenCalledTimes(1);
        stop();
    });

    it('retains existing data for a transient server failure', async () => {
        const value = client({ queryCache: new QueryCache({ onError: clearDeniedQueryData }) });
        const key = ['stores', 'list', {}];
        value.setQueryData(key, { content: [{ id: 7 }] });
        await value.fetchQuery({ queryKey: key, queryFn: async () => { throw { status: 503 }; } }).catch(() => {});
        expect(value.getQueryData(key)).toEqual({ content: [{ id: 7 }] });
        expect(value.getQueryState(key).status).toBe('error');
    });

    it.each([404, 410])('discards an unavailable QR token on %s without issuing a replacement automatically', async status => {
        const value = client({ queryCache: new QueryCache({ onError: clearDeniedQueryData }) });
        const key = ['reservations', 'qrToken', 8];
        value.setQueryData(key, { token: 'old-token' });
        const read = vi.fn().mockRejectedValue({ status });
        await value.fetchQuery({ queryKey: key, queryFn: read }).catch(() => {});
        expect(value.getQueryData(key)).toBeUndefined();
        expect(read).toHaveBeenCalledTimes(1);
        createLiveQueryRefresh(value, () => true)([], true);
        expect(read).toHaveBeenCalledTimes(1);
    });

    it('reads again after an already running request so a mid-request signal is not lost', async () => {
        const value = client(), first = deferred();
        const read = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue({ id: 8, version: 2 });
        const key = ['feed', 'post', 8];
        value.setQueryData(key, { id: 8, version: 0 });
        const observer = new QueryObserver(value, { queryKey: key, queryFn: read });
        const stop = observer.subscribe(() => {});
        expect(read).toHaveBeenCalledTimes(1);
        const refresh = createLiveQueryRefresh(value, () => true);
        refresh([signal({ domain: 'FEED' })]);
        refresh([signal({ domain: 'FEED', revision: 2, eventId: 'server:2' })]);
        expect(read).toHaveBeenCalledTimes(1);
        first.resolve({ id: 8, version: 1 });
        await vi.waitFor(() => expect(value.getQueryData(key)).toEqual({ id: 8, version: 2 }));
        expect(read).toHaveBeenCalledTimes(2);
        stop();
    });

    it('does not start a deferred follow-up after the account scope has changed', async () => {
        const value = client(), first = deferred();
        let current = true;
        const read = vi.fn(() => first.promise);
        const observer = new QueryObserver(value, { queryKey: ['feed', 'post', 8], queryFn: read });
        const stop = observer.subscribe(() => {});
        createLiveQueryRefresh(value, () => current)([signal({ domain: 'FEED' })]);
        current = false;
        first.resolve({ id: 8 });
        await first.promise;
        await new Promise(done => setTimeout(done, 0));
        expect(read).toHaveBeenCalledTimes(1);
        stop();
    });

    it('schedules only the next future boundary of active news reads', () => {
        const value = client();
        const now = Date.parse('2026-10-15T09:00:00Z');
        const key = ['public-promotions', 'list', {}];
        value.setQueryData(key, { content: [{ endsAt: '2026-10-15T10:00:00Z' },
            { startsAt: '2026-10-15T09:30:00Z', endsAt: '2026-10-15T11:00:00Z' }] });
        value.setQueryData(['store-news', 'detail', 2], { endsAt: '2026-10-15T09:05:00Z' });
        const observer = new QueryObserver(value, { queryKey: key, queryFn: vi.fn(), staleTime: Infinity });
        const stop = observer.subscribe(() => {});
        expect(nextNewsBoundary(value, now)).toBe(Date.parse('2026-10-15T09:30:00Z'));
        stop();
        expect(nextNewsBoundary(value, now)).toBeNull();
    });
});
