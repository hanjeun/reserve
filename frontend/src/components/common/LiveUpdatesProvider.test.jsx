import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { advanceSession } from '../../api/sessionScope';
import useLiveUpdatesStatus from '../../hooks/useLiveUpdatesStatus';
import LiveUpdatesProvider from './LiveUpdatesProvider';

const state = vi.hoisted(() => ({ sessionRevision: 0, isLoggedIn: true,
    expireSession: vi.fn(), checkAuth: vi.fn(), refresh: vi.fn() }));
vi.mock('../../store/useAuthStore', () => {
    const useAuth = selector => selector(state);
    useAuth.getState = () => state;
    return { default: useAuth };
});
vi.mock('../../hooks/liveUpdateQueries', async original => ({ ...await original(),
    createLiveQueryRefresh: () => state.refresh }));

const connections = [];
class Stream {
    constructor(url, options) {
        this.url = url; this.options = options; this.listeners = new Map();
        this.close = vi.fn(); connections.push(this);
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    emit(name, data) { this.listeners.get(name)?.({ data: JSON.stringify(data) }); }
}
const ready = stream => stream.emit('ready', { epoch: 'server', revision: 0,
    domains: ['FEED', 'NEWS', 'unknown'], serverTime: new Date().toISOString() });
const update = (revision, entityId = 8) => ({ eventId: `server:${revision}`, epoch: 'server', revision,
    domain: 'FEED', entityId, operation: 'UPDATED' });
const Probe = () => {
    const value = useLiveUpdatesStatus();
    return <output>{JSON.stringify(value)}</output>;
};
let client;
const ui = key => <QueryClientProvider client={client}>
    <LiveUpdatesProvider key={key}><Probe /></LiveUpdatesProvider>
</QueryClientProvider>;
const status = () => JSON.parse(screen.getByRole('status').textContent);
const tick = async ms => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', Stream);
    state.sessionRevision = 0; state.isLoggedIn = true; state.authRestoring = false;
    state.refresh.mockClear(); state.expireSession.mockClear(); connections.length = 0;
    state.checkAuth.mockReset().mockResolvedValue({ id: 7 });
    advanceSession();
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('waits for authentication restoration and keeps anonymous streams credentialless', () => {
    state.authRestoring = true;
    const rendered = render(ui('restoring'));
    expect(connections).toHaveLength(0);
    state.authRestoring = false;
    state.isLoggedIn = false;
    rendered.rerender(ui('restoring'));
    expect(connections).toHaveLength(1);
    expect(connections[0].url).toMatch(/updates\/public\/events$/);
    expect(connections[0].options).toEqual({ withCredentials: false });
});
it('uses one credentialed stream and enables only server-advertised supported domains after ready', async () => {
    render(ui('account'));
    expect(connections).toHaveLength(1);
    expect(connections[0].url).toMatch(/\/api\/(?:v1\/)?updates\/events$/);
    expect(connections[0].options).toEqual({ withCredentials: true });
    expect(status()).toEqual({ present: true, connected: false, domains: [] });
    act(() => connections[0].emit('ready', { domains: ['FEED'] }));
    expect(status().domains).toEqual([]);
    act(() => ready(connections[0]));
    expect(status()).toEqual({ present: true, connected: true, domains: ['FEED', 'NEWS'] });
    await tick(250);
    expect(state.refresh).toHaveBeenCalledWith([], true);
});
it.each([null, false, [], { epoch: '', domains: [] }])('ignores malformed ready payload %j without breaking the page', data => {
    render(ui('account'));
    expect(() => act(() => connections[0].emit('ready', data))).not.toThrow();
    expect(status()).toEqual({ present: true, connected: false, domains: [] });
    expect(state.refresh).not.toHaveBeenCalled();
});

it('coalesces signals and rejects duplicates and stale versions per entity without losing another entity', async () => {
    render(ui('account'));
    act(() => ready(connections[0])); await tick(250); state.refresh.mockClear();
    act(() => {
        connections[0].emit('update', update(5));
        connections[0].emit('update', update(5));
        connections[0].emit('update', update(4));
        connections[0].emit('update', update(3, 9));
        connections[0].emit('update', { ...update(6), epoch: 'old-server', eventId: 'old-server:6' });
    });
    expect(state.refresh).not.toHaveBeenCalled();
    await tick(250);
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(state.refresh).toHaveBeenCalledWith([update(5), update(3, 9)], false);
});

it('ignores all events from an old account scope, including session termination', async () => {
    const view = render(ui('A'));
    const old = connections[0];
    act(() => ready(old)); await tick(250); state.refresh.mockClear();
    advanceSession(); state.sessionRevision = 1; state.isLoggedIn = false;
    act(() => {
        old.emit('update', update(1)); old.emit('session-ended', {}); old.onerror();
    });
    await tick(250);
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.expireSession).not.toHaveBeenCalled();
    view.rerender(ui('B'));
    expect(old.close).toHaveBeenCalled();
    expect(connections).toHaveLength(2);
    expect(connections[1].url).toMatch(/\/updates\/public\/events$/);
    expect(status().domains).toEqual([]);
    act(() => connections[1].emit('session-ended', {}));
    expect(state.expireSession).toHaveBeenCalledTimes(1);
});

it('reconciles after transport failure without logging the member out and ignores the replaced stream', async () => {
    render(ui('account'));
    const old = connections[0];
    act(() => ready(old)); await tick(250); state.refresh.mockClear();
    act(() => old.onerror());
    expect(status()).toEqual({ present: true, connected: false, domains: ['FEED', 'NEWS'] });
    expect(state.expireSession).not.toHaveBeenCalled();
    await tick(6_000);
    expect(state.checkAuth).toHaveBeenCalledExactlyOnceWith(true, { rethrowTransient: true, timeout: 8000 });
    expect(connections).toHaveLength(2);
    act(() => { old.emit('update', update(1)); old.emit('session-ended', {}); });
    expect(state.refresh).not.toHaveBeenCalled();
    act(() => ready(connections[1]));
    await tick(250);
    expect(state.refresh).toHaveBeenCalledWith([], true);
    state.refresh.mockClear();
    await tick(54_000);
    expect(state.refresh).toHaveBeenCalledWith([], true, { periodic: true });
    expect(state.expireSession).not.toHaveBeenCalled();
});

it('waits for session renewal and coalesces repeated failures and visibility changes', async () => {
    let finish;
    state.checkAuth.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    render(ui('account'));
    act(() => { connections[0].onerror(); connections[0].onerror(); });
    await tick(6_000);
    expect(state.checkAuth).toHaveBeenCalledOnce();
    expect(connections).toHaveLength(1);
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(connections).toHaveLength(1);
    await act(async () => finish({ id: 7 }));
    expect(connections).toHaveLength(2);
    expect(state.checkAuth).toHaveBeenCalledOnce();
});

it('ends private reconnects after confirmed expiry and uses only the public stream', async () => {
    const view = render(ui('account'));
    state.checkAuth.mockImplementationOnce(async () => {
        state.isLoggedIn = false; state.sessionRevision = advanceSession();
        return null;
    });
    act(() => connections[0].onerror());
    await tick(6_000);
    expect(connections).toHaveLength(1);
    view.rerender(ui('account'));
    expect(connections).toHaveLength(2);
    expect(connections[1].url).toMatch(/updates\/public\/events$/);
    expect(connections[1].options.withCredentials).toBe(false);
    await tick(70_000);
    expect(connections).toHaveLength(2);
});

it('backs off a transient session-check failure without logging out or reopening an unchecked stream', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    state.checkAuth.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
    render(ui('account'));
    act(() => connections[0].onerror());
    await tick(5_000);
    expect(connections).toHaveLength(1);
    expect(state.expireSession).not.toHaveBeenCalled();
    await tick(9_999);
    expect(state.checkAuth).toHaveBeenCalledOnce();
    await tick(1);
    expect(state.checkAuth).toHaveBeenCalledTimes(2);
    expect(connections).toHaveLength(2);
});

it.each(['unmount', 'account-switch'])('ignores a late session probe after %s', async action => {
    let finish;
    state.checkAuth.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(ui('account'));
    act(() => connections[0].onerror());
    await tick(6_000);
    if (action === 'unmount') view.unmount();
    else {
        state.isLoggedIn = false; state.sessionRevision = advanceSession();
        view.rerender(ui('account'));
    }
    const count = connections.length;
    await act(async () => finish({ id: 7 }));
    await tick(70_000);
    expect(connections).toHaveLength(count);
});

it('keeps polling when EventSource construction fails and recovers through the session gate', async () => {
    let blocked = true;
    vi.stubGlobal('EventSource', class extends Stream {
        constructor(...args) {
            if (blocked) throw new DOMException('blocked', 'SecurityError');
            super(...args);
        }
    });
    render(ui('account'));
    expect(connections).toHaveLength(0);
    expect(status().connected).toBe(false);
    blocked = false;
    await tick(6_000);
    expect(state.checkAuth).toHaveBeenCalledOnce();
    expect(connections).toHaveLength(1);
});

it('reconnects anonymously without attempting session renewal', async () => {
    state.isLoggedIn = false;
    render(ui('anonymous'));
    act(() => connections[0].onerror());
    await tick(6_000);
    expect(state.checkAuth).not.toHaveBeenCalled();
    expect(connections).toHaveLength(2);
    expect(connections[1].options.withCredentials).toBe(false);
});

it('marks healthy-stream fallback as periodic while retaining signals in the same batch', async () => {
    render(ui('account'));
    act(() => ready(connections[0])); await tick(250); state.refresh.mockClear();
    await tick(59_750);
    act(() => connections[0].emit('update', update(1)));
    await tick(250);
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(state.refresh).toHaveBeenCalledWith([update(1)], true, { periodic: true });
});

it.each([-125, 0, 125])('preserves full reconciliation when ready arrives %sms around a periodic tick', async offset => {
    render(ui('account'));
    act(() => ready(connections[0])); await tick(250); state.refresh.mockClear();
    await tick(59_750 + offset);
    act(() => ready(connections[0]));
    await tick(250);
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(state.refresh).toHaveBeenCalledWith([], true);
});

it('pauses hidden pages, reconciles on return, and closes subscriptions on unmount', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const view = render(ui('account'));
    const first = connections[0];
    act(() => ready(first)); await tick(250); state.refresh.mockClear();
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(first.close).toHaveBeenCalled();
    await tick(60_500);
    expect(state.refresh).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(connections).toHaveLength(2);
    await tick(250);
    expect(state.refresh).toHaveBeenCalledWith([], true);
    view.unmount(); state.refresh.mockClear();
    expect(connections[1].close).toHaveBeenCalled();
    await tick(60_500);
    expect(state.refresh).not.toHaveBeenCalled();
});
