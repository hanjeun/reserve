import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StoreDetail from './StoreDetail';
import { useStoreData } from '../../hooks';

vi.mock('../../api/axios', () => ({ default: {} }));
vi.mock('../../components/store', () => ({ BookingCalendar: () => null }));
vi.mock('../../components/review', () => ({ ReviewList: () => null }));
vi.mock('../../hooks', () => ({
    useStoreData: vi.fn(),
    useMessage: () => ({ message: {} }),
    usePayment: () => ({ pay: vi.fn(), paying: false }),
    useWindowWidth: () => 1280,
    useStoreDetailActions: () => ({}),
    useStoreImageHint: () => null,
}));

const renderAt = (path) => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/store/:id" element={<StoreDetail />} /></Routes>
    </MemoryRouter>,
);

const idle = { store: null, loading: false, error: null, refetch: vi.fn() };

describe('store detail for an address that is not a store', () => {
    beforeEach(() => { useStoreData.mockReturnValue(idle); });

    it('does not send a non-numeric id to the API and shows the not-found state without a retry', () => {
        renderAt('/store/abc');

        expect(useStoreData).toHaveBeenCalledWith(null);
        expect(screen.getByText('요청하신 가게를 찾을 수 없어요.')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull();
    });

    it('treats a deleted or sanctioned store (404) as not found rather than a server feature error', () => {
        useStoreData.mockReturnValue({ ...idle, error: Object.assign(new Error('매장을 찾을 수 없어요.'), { status: 404 }) });
        renderAt('/store/999');

        expect(useStoreData).toHaveBeenCalledWith('999');
        expect(screen.getByRole('alert')).toHaveTextContent('요청하신 가게 정보를 찾을 수 없어요.');
        expect(screen.getByRole('alert').querySelector('.reserve-state-illustration img'))
            .toHaveAttribute('src', expect.stringContaining('not-found-512.webp'));
        expect(screen.getByRole('button', { name: '가게 목록으로' })).toBeInTheDocument();
        expect(screen.queryByText(/기능을 찾지 못했습니다/)).toBeNull();
        expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull();
    });

    it('keeps the retryable error state for a temporary server failure', () => {
        useStoreData.mockReturnValue({ ...idle, error: Object.assign(new Error('서버 오류'), { status: 503 }) });
        renderAt('/store/12');

        expect(screen.getByRole('alert')).toHaveTextContent('서버에서 가게 정보를 처리하지 못했어요');
        expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeInTheDocument();
    });
});
