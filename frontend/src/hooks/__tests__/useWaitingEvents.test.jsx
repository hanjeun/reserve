import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import useWaitingEvents from '../useWaitingEvents';
const state = vi.hoisted(() => ({ revision: 1, loggedIn: true }));
vi.mock('../../store/useAuthStore', () => {
    const read = () => ({ sessionRevision: state.revision, isLoggedIn: state.loggedIn });
    const hook = selector => selector(read()); hook.getState = read; return { default: hook };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); state.revision = 1; state.loggedIn = true; });
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
    state.revision = 2; view.rerender(tree()); expect(streams[0].close).toHaveBeenCalledTimes(1);
    invalidate.mockClear(); streams[0].listeners['waiting-changed'](); expect(invalidate).not.toHaveBeenCalled();
    view.unmount(); expect(streams[1].close).toHaveBeenCalledTimes(1);
});
