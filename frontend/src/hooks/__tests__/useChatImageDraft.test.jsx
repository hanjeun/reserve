import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import useChatImageDraft from '../useChatImageDraft';
import useAuthStore from '../../store/useAuthStore';
import chatService from '../../services/chatService';

vi.mock('../../services/chatService', () => ({ default: { getImageConfig: vi.fn().mockResolvedValue({ enabled: true }) } }));
describe('chat photo draft scope', () => {
    it('distinguishes a pending image setting from a confirmed disabled feature', async () => {
        useAuthStore.setState({ isLoggedIn: true, sessionRevision: 99 });
        let resolveConfig;
        chatService.getImageConfig.mockReturnValueOnce(new Promise(resolve => { resolveConfig = resolve; }));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
        const hook = renderHook(() => useChatImageDraft('A'), { wrapper });
        expect(hook.result.current.loading).toBe(true);
        expect(hook.result.current.enabled).toBe(false);
        await act(async () => resolveConfig({ enabled: false }));
        await waitFor(() => expect(hook.result.current.loading).toBe(false));
        expect(hook.result.current.enabled).toBe(false);
        hook.unmount(); client.clear();
        useAuthStore.setState({ isLoggedIn: false });
    });
    it('never restores an old account photo into a new room or session', async () => {
        useAuthStore.setState({ isLoggedIn: true, sessionRevision: 100 });
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
        const hook = renderHook(({ room }) => useChatImageDraft(room), { wrapper, initialProps: { room: 'A' } });
        await waitFor(() => expect(hook.result.current.enabled).toBe(true));
        const photo = new File(['image'], 'photo.png', { type: 'image/png' });
        act(() => hook.result.current.choose(photo));
        const oldRestore = hook.result.current.restore;
        hook.rerender({ room: 'B' });
        expect(hook.result.current.file).toBeNull();
        act(() => hook.result.current.clear());
        act(() => oldRestore(photo));
        expect(hook.result.current.file).toBeNull();
        act(() => useAuthStore.setState({ sessionRevision: 101 }));
        act(() => oldRestore(photo));
        expect(hook.result.current.file).toBeNull();
        hook.unmount(); client.clear();
        useAuthStore.setState({ isLoggedIn: false });
    });
});
