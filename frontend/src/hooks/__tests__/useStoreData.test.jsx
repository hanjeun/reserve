import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useStoreData from '../useStoreData';
import storeService from '../../services/storeService';

vi.mock('../../services/storeService', () => ({
    default: { getStoreById: vi.fn(), getStoreForEdit: vi.fn() },
}));

const renderStoreData = (storeId, options) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return renderHook(() => useStoreData(storeId, options), { wrapper });
};

describe('useStoreData failure boundary', () => {
    beforeEach(() => vi.resetAllMocks());

    it.each([404, 410])('retains status %s and hides a cached store once the server says it is missing', async (status) => {
        const missing = Object.assign(new Error('정보를 찾을 수 없습니다.'), { status });
        storeService.getStoreById.mockResolvedValueOnce({ id: 12, name: '가게' }).mockRejectedValue(missing);

        const { result } = renderStoreData(12);
        await waitFor(() => expect(result.current.store?.id).toBe(12));
        await act(async () => { await result.current.refetch(); });

        await waitFor(() => expect(result.current.error).toBe(missing));
        expect(result.current.error.status).toBe(status);
        expect(result.current.store).toBeNull();
        expect(storeService.getStoreById).toHaveBeenCalledTimes(2);
        expect(typeof result.current.refetch).toBe('function');
    });

    it.each([401, 403])('hides previously loaded edit data after access is denied with %s', async (status) => {
        const denied = Object.assign(new Error('접근 권한이 없습니다.'), { status });
        storeService.getStoreForEdit.mockResolvedValueOnce({ id: 12, ownerId: 7 }).mockRejectedValueOnce(denied);

        const { result } = renderStoreData(12, { forEdit: true });
        await waitFor(() => expect(result.current.store?.id).toBe(12));
        await act(async () => { await result.current.refetch(); });

        await waitFor(() => expect(result.current.error).toBe(denied));
        expect(result.current.store).toBeNull();
        expect(storeService.getStoreForEdit).toHaveBeenCalledTimes(2);
        expect(storeService.getStoreById).not.toHaveBeenCalled();
    });

    it('keeps cached store data when a refresh fails temporarily', async () => {
        const store = { id: 12, name: '가게' };
        const unavailable = Object.assign(new Error('일시적인 서버 오류'), { status: 503 });
        storeService.getStoreById.mockResolvedValueOnce(store).mockRejectedValue(unavailable);

        const { result } = renderStoreData(12);
        await waitFor(() => expect(result.current.store).toEqual(store));
        await act(async () => { await result.current.refetch(); });

        await waitFor(() => expect(result.current.error).toBe(unavailable));
        expect(result.current.store).toEqual(store);
    });

    it('never requests invalid store IDs, including a manual refetch', async () => {
        for (const storeId of ['abc', '-1', '0', '9007199254740992', null]) {
            const { result, unmount } = renderStoreData(storeId, { forEdit: true });
            expect(result.current.loading).toBe(false);
            expect(result.current.store).toBeNull();
            await act(async () => { await result.current.refetch(); });
            unmount();
        }
        expect(storeService.getStoreById).not.toHaveBeenCalled();
        expect(storeService.getStoreForEdit).not.toHaveBeenCalled();
    });

    it.each([[401, 1], [403, 1], [422, 1], [429, 2], [500, 2], [undefined, 2]])(
        'retries status %s only when the failure can be temporary', async (status, requests) => {
            const error = Object.assign(new Error('서버에 연결할 수 없습니다.'), { status });
            storeService.getStoreById.mockRejectedValue(error);
            const { result } = renderStoreData(12);
            await waitFor(() => expect(result.current.error).toBe(error));
            expect(storeService.getStoreById).toHaveBeenCalledTimes(requests);
        },
    );
});
