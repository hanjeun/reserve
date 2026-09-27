import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useStoreData from '../useStoreData';
import storeService from '../../services/storeService';

vi.mock('../../services/storeService', () => ({
    default: { getStoreById: vi.fn(), getStoreForEdit: vi.fn() },
}));

const renderStoreData = (storeId, options) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return renderHook(() => useStoreData(storeId, options), { wrapper });
};

describe('useStoreData failure boundary', () => {
    it('retains the normalized HTTP status so DataState can distinguish a missing store from a temporary failure', async () => {
        const missing = Object.assign(new Error('정보를 찾을 수 없습니다.'), { status: 404 });
        storeService.getStoreById.mockRejectedValueOnce(missing);

        const { result } = renderStoreData(12);

        await waitFor(() => expect(result.current.error).toBe(missing));
        expect(result.current.error.status).toBe(404);
        expect(result.current.store).toBeNull();
        expect(typeof result.current.refetch).toBe('function');
    });
});
