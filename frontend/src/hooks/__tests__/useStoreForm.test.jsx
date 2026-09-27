import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoreForm } from '../useStoreForm';
import useAuthStore from '../../store/useAuthStore';
import { saveStoreDraft } from '../../utils/storeDraftStorage';

vi.mock('../../utils/storeDraftStorage', () => ({
    deleteStoreDraft: vi.fn().mockResolvedValue(undefined),
    fingerprintStoreDraftBase: vi.fn(() => 'base'),
    hydrateDraftImages: vi.fn(() => ({ files: [], objectUrls: [] })),
    hydrateStoreFormValues: vi.fn((values) => values),
    makeStoreDraftKey: vi.fn(({ userId, mode, storeId }) => (
        userId == null ? null : `member:${userId}:store:${mode}:${storeId ?? 'new'}`
    )),
    purgeExpiredStoreDrafts: vi.fn().mockResolvedValue(0),
    readStoreDraft: vi.fn().mockResolvedValue(null),
    saveStoreDraft: vi.fn().mockResolvedValue({ savedAt: 1 }),
}));

const form = {
    getFieldsValue: vi.fn(() => ({ name: '테스트 가게' })),
    setFieldsValue: vi.fn(),
};

const wrapper = ({ children }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
        <QueryClientProvider client={client}>
            <AntApp>
                <MemoryRouter>{children}</MemoryRouter>
            </AntApp>
        </QueryClientProvider>
    );
};

describe('useStoreForm draft scheduling', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        useAuthStore.setState({
            user: { id: 7, role: 'BUSINESS' },
            isLoggedIn: true,
        });
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('saves after one second of idle time', async () => {
        const { result } = renderHook(() => useStoreForm({ form }), { wrapper });

        act(() => result.current.handleValuesChange());
        await act(async () => { vi.advanceTimersByTime(999); });
        expect(saveStoreDraft).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1);
            await Promise.resolve();
        });
        expect(saveStoreDraft).toHaveBeenCalledTimes(1);
    });

    it('flushes within five seconds while input keeps changing', async () => {
        const { result } = renderHook(() => useStoreForm({ form }), { wrapper });

        act(() => result.current.handleValuesChange());
        for (let elapsed = 900; elapsed <= 4500; elapsed += 900) {
            await act(async () => { vi.advanceTimersByTime(900); });
            act(() => result.current.handleValuesChange());
        }
        expect(saveStoreDraft).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(500);
            await Promise.resolve();
        });
        expect(saveStoreDraft).toHaveBeenCalledTimes(1);
    });
});
