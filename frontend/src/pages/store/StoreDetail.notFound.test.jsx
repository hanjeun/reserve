import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StoreDetail from './StoreDetail';
import { useStoreData } from '../../hooks';
import useAuthStore from '../../store/useAuthStore';

vi.mock('../../api/axios', () => ({ default: {} }));
vi.mock('../../components/store', () => ({ BookingCalendar: () => null }));
vi.mock('../../components/review', () => ({ ReviewList: () => null }));
vi.mock('../../components/waiting/WaitingJoin', () => ({ default: () => null }));
vi.mock('../../components/common/PhotoGallery', () => ({ default: () => null }));
vi.mock('../../components/common', async importOriginal => ({ ...await importOriginal(), FavoriteButton: () => null, KakaoMap: () => null }));
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
    beforeEach(() => {
        useStoreData.mockReturnValue(idle);
        useAuthStore.setState({ user: null, isLoggedIn: false, isLoggingOut: false });
    });

    it.each([
        { user: null, isLoggedIn: false, isLoggingOut: false, chat: false },
        { user: { id: 99 }, isLoggedIn: false, isLoggingOut: false, chat: false },
        { user: { id: 99 }, isLoggedIn: true, isLoggingOut: true, chat: false },
        { user: { id: 99 }, isLoggedIn: true, isLoggingOut: false, chat: true },
    ])('shows private store chat only in the signed-in state while keeping the phone action ($isLoggedIn, $isLoggingOut)', ({ chat, ...auth }) => {
        useAuthStore.setState(auth);
        useStoreData.mockReturnValue({ ...idle, store: { id: 12, ownerId: 7, name: '합성 가게', phone: '02-1234-5678', reservationEnabled: false } });
        renderAt('/store/12');
        expect(Boolean(screen.queryByRole('button', { name: '가게에 채팅 문의하기' }))).toBe(chat);
        expect(screen.getByRole('link', { name: '가게에 전화하기 02-1234-5678' })).toHaveAttribute('href', 'tel:0212345678');
    });

    it('does not send a non-numeric id to the API and shows the not-found state without a retry', () => {
        renderAt('/store/abc');

        expect(useStoreData).toHaveBeenCalledWith(null, { reservationId: null });
        expect(screen.getByText('요청하신 가게를 찾을 수 없어요.')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull();
    });

    it('treats a deleted or sanctioned store (404) as not found rather than a server feature error', () => {
        useStoreData.mockReturnValue({ ...idle, error: Object.assign(new Error('매장을 찾을 수 없어요.'), { status: 404 }) });
        renderAt('/store/999');

        expect(useStoreData).toHaveBeenCalledWith('999', { reservationId: null });
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
