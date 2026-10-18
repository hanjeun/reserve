import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import useWaitingEvents from '../useWaitingEvents';
const state = vi.hoisted(() => ({ revision: 1, loggedIn: true, expireSession: vi.fn() }));
vi.mock('../../store/useAuthStore', () => {
    const read = () => ({ sessionRevision: state.revision, isLoggedIn: state.loggedIn, expireSession: state.expireSession });
    const hook = selector => selector(read()); hook.getState = read; return { default: hook };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); state.revision = 1; state.loggedIn = true; state.expireSession.mockReset(); });
function Subscriber() { useWaitingEvents(); return null; }
it('refreshes authenticated waiting caches on events and closes the old account stream', () => {
    const streams = [];
    class FakeSource {
        listeners = {}; close = vi.fn();
        constructor(url, options) { this.url = url; this.options = options; streams.push(this); }
        addEventListener(name, listener) { this.listeners[name] = listener; }
    }
    vi.stubGlobal('EventSource', FakeSource);
    const client = new QueryClient(); const invalidate = vi.spyOn(client, 'invalidateQueries');
    const tree = () => <QueryClientProvider client={client}><Subscriber /></QueryClientProvider>;
    const view = render(tree());
    expect(streams[0].url).toMatch(/\/api\/(?:v1\/)?waiting\/events$/);
    expect(streams[0].options).toEqual({ withCredentials: true });
    streams[0].listeners['waiting-changed'](); expect(invalidate).toHaveBeenCalledWith({ queryKey: ['waiting', 1] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['waiting-stores'] });
    state.revision = 2; view.rerender(tree()); expect(streams[0].close).toHaveBeenCalledTimes(1);
    invalidate.mockClear(); streams[0].listeners['waiting-changed'](); expect(invalidate).not.toHaveBeenCalled();
    view.unmount(); expect(streams[1].close).toHaveBeenCalledTimes(1);
});

function fixture() {
    const streams = [];
    class FakeSource {
        listeners = {}; close = vi.fn();
        constructor() { streams.push(this); }
        addEventListener(name, listener) { this.listeners[name] = listener; }
    }
    vi.stubGlobal('EventSource', FakeSource);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = render(<QueryClientProvider client={client}><Subscriber /></QueryClientProvider>);
    return { streams, invalidate, view };
}

it('expires a revoked session and stops all late events or reconnection', async () => {
    vi.useFakeTimers();
    const { streams, invalidate, view } = fixture();
    act(() => streams[0].listeners['session-ended']());
    expect(state.expireSession).toHaveBeenCalledTimes(1);
    act(() => { streams[0].listeners.ready(); streams[0].listeners['waiting-changed'](); streams[0].onerror(); });
    await act(() => vi.advanceTimersByTimeAsync(35_000));
    expect(invalidate).not.toHaveBeenCalled();
    expect(streams).toHaveLength(1);
    expect(streams[0].close).toHaveBeenCalledTimes(1);
    view.unmount();
});

it('ignores a replaced connection while transport failure preserves the session', async () => {
    vi.useFakeTimers();
    const { streams, invalidate, view } = fixture();
    act(() => streams[0].onerror());
    expect(state.expireSession).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(streams).toHaveLength(2);
    invalidate.mockClear();
    act(() => { streams[0].listeners['session-ended'](); streams[0].listeners.ready(); streams[0].onerror(); });
    expect(state.expireSession).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(streams[1].close).not.toHaveBeenCalled();
    view.unmount();
});
