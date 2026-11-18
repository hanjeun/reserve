import { act, cleanup, render } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { advanceSession } from '../../api/sessionScope';
import LiveUpdatesProvider from './LiveUpdatesProvider';

const auth = vi.hoisted(() => ({ sessionRevision: 1, isLoggedIn: false, authRestoring: false }));
vi.mock('../../store/useAuthStore', () => {
    const hook = select => select(auth);
    hook.getState = () => auth;
    return { default: hook };
});
const streams = [];
class Stream {
    constructor() { this.listeners = {}; this.close = vi.fn(); streams.push(this); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    ready(revision = 0) {
        this.listeners.ready({ data: JSON.stringify({ epoch: 'synthetic', revision, revisionTracksGaps: true,
            domains: ['WAITING', 'STORE'], serverTime: new Date().toISOString() }) });
    }
}
let client;
const tick = ms => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
function show(queryKey, read) {
    function Probe() { useQuery({ queryKey, queryFn: read }); return null; }
    render(<QueryClientProvider client={client}><LiveUpdatesProvider><Probe /></LiveUpdatesProvider></QueryClientProvider>);
}
beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T00:00:00Z'));
    vi.stubGlobal('EventSource', Stream); streams.length = 0;
    onlineManager.setOnline(true); advanceSession();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([
    [['reservations', 'my', {}], 10_000],
    [['waiting', 1, 'my', 7], 15_000],
    [['waiting', 1, 7], 30_000],
    [['feed', 'interactions', 'notifications', 'count'], 30_000],
])('uses one fallback timer for %j at %sms from the completed read', async (key, interval) => {
    const read = vi.fn().mockResolvedValue({ content: [{ status: 'PENDING' }] });
    show(key, read);
    await act(async () => { await import('./LiveUpdatesConnection'); });
    await tick(0);
    expect(read).toHaveBeenCalledTimes(1);
    await tick(interval - 1); expect(read).toHaveBeenCalledTimes(1);
    await tick(251); expect(read).toHaveBeenCalledTimes(2);
    await tick(interval - 1); expect(read).toHaveBeenCalledTimes(2);
    await tick(251); expect(read).toHaveBeenCalledTimes(3);
});

it('switches to the healthy-stream period and coalesces return with ready while pausing hidden pages', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get');
    const read = vi.fn().mockResolvedValue({ content: [] });
    show(['waiting', 1, 'my', 7], read); await tick(0);
    act(() => streams[0].ready()); await tick(250);
    expect(read).toHaveBeenCalledTimes(1);
    await tick(59_749); expect(read).toHaveBeenCalledTimes(1);
    await tick(251); expect(read).toHaveBeenCalledTimes(2);
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await tick(90_000); expect(read).toHaveBeenCalledTimes(2);
    hidden.mockReturnValue(false);
    act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        streams.at(-1).ready(1);
    });
    await tick(250); expect(read).toHaveBeenCalledTimes(3);
});

it('shares the first in-flight read and reconciles only the reconnect with a possible gap', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get');
    let finish;
    const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
        .mockResolvedValue({ content: [] });
    show(['stores', 'list', {}], read);
    act(() => streams[0].ready());
    await tick(250);
    await act(async () => finish({ content: [] }));
    await tick(250);
    expect(read).toHaveBeenCalledTimes(1);

    for (const revision of [0, 1]) {
        hidden.mockReturnValue(true);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        hidden.mockReturnValue(false);
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
            streams.at(-1).ready(revision);
        });
        await tick(250);
        expect(read).toHaveBeenCalledTimes(1 + revision);
    }
});

it('pauses offline reads and resumes the applied query once the network returns', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const read = vi.fn().mockResolvedValue({ content: [] });
    show(['waiting', 1, 'my', 7], read); await tick(0);
    expect(read).toHaveBeenCalledTimes(1);
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('offline')));
    await tick(60_000); expect(read).toHaveBeenCalledTimes(1);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    await tick(250); expect(read).toHaveBeenCalledTimes(2);
});
