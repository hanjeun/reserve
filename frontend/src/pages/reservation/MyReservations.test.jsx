import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import MyReservations from './MyReservations';

const mocks = vi.hoisted(() => ({
    read: vi.fn(),
    auth: { sessionRevision: 1, isLoggedIn: true, user: { id: 7 } },
    message: { message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }, confirm: vi.fn() },
}));
vi.mock('../../hooks/useReservations', () => ({ default: mocks.read }));
vi.mock('../../hooks/useMessage', () => ({ default: () => mocks.message }));
vi.mock('../../hooks/usePayment', () => ({ default: () => ({ pay: vi.fn(), paying: false }) }));
vi.mock('../../store/useAuthStore', () => {
    const hook = selector => selector ? selector(mocks.auth) : mocks.auth;
    hook.getState = () => mocks.auth;
    hook.subscribe = () => () => {};
    return { default: hook };
});
vi.mock('../../components/waiting/MyWaiting', () => ({ default: () => null }));
vi.mock('../../components/reservation/QrCodeModal', () => ({ default: () => null }));
vi.mock('../../components/reservation/ReservationDetailModal', () => ({ default: () => null }));
vi.mock('../../hooks/useLiveUpdatesStatus', () => ({ default: () => ({ connected: true, domains: ['RESERVATION'] }) }));

const row = (id, storeName) => ({ id, storeName, storeId: id, status: 'CONFIRMED', reservationCode: `R-${id}`,
    reservationDate: '2030-01-01', reservationTime: '12:00:00', guestCount: 1, depositAmount: 0, depositPaid: false });
const reply = overrides => ({ reservations: [row(9, '서버 첫 예약'), row(24, '서버 둘째 예약')], total: 41, totalPages: 3,
    loading: false, refetching: false, error: null, hasData: true, refetch: vi.fn(), cancelReservation: vi.fn(), ...overrides });
const params = () => new URLSearchParams(screen.getByTestId('reservation-location').textContent);
function LocationProbe() {
    return <output data-testid="reservation-location">{useLocation().search}</output>;
}
const show = path => render(<MemoryRouter initialEntries={[path]}><MyReservations /><LocationProbe /></MemoryRouter>);

beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.read.mockReturnValue(reply());
});

it('uses the server count and order, preserves pages across view changes, and resets every server filter to page one', async () => {
    const { container } = show('/my-reservations?view=list&page=3&status=CONFIRMED&sort=oldest&waitingPage=2');
    await waitFor(() => expect(mocks.read).toHaveBeenLastCalledWith({ page: 2, size: 15, status: 'CONFIRMED', sort: 'oldest', search: undefined }));
    expect(screen.getByText('41건')).toBeInTheDocument();
    expect([...container.querySelectorAll('[data-list-item-id]')].map(element => element.dataset.listItemId))
        .toEqual(['reservation:9', 'reservation:24']);
    fireEvent.click(screen.getByTitle('2'));
    await waitFor(() => expect(mocks.read.mock.lastCall[0].page).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: '사진형 보기로 전환' }));
    await waitFor(() => expect(params().get('view')).toBe('cards'));
    expect(params().get('page')).toBe('2');

    fireEvent.click(screen.getByRole('button', { name: '예약 정렬' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '방문일 빠른순' }));
    await waitFor(() => expect(mocks.read.mock.lastCall[0]).toMatchObject({ page: 0, sort: 'visit' }));
    fireEvent.click(screen.getByRole('button', { name: '예약 상태' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '승인 대기' }));
    await waitFor(() => expect(mocks.read.mock.lastCall[0]).toMatchObject({ page: 0, status: 'PENDING' }));
    fireEvent.click(screen.getByTitle('2'));
    fireEvent.change(screen.getByPlaceholderText('가게명, 예약번호로 검색'), { target: { value: '예약번호' } });
    await waitFor(() => expect(mocks.read.mock.lastCall[0]).toMatchObject({ page: 0, search: '예약번호' }));
    expect(params().get('waitingPage')).toBe('2');
});

it('returns to the last existing page after a server-side removal empties the requested page', async () => {
    mocks.read.mockReturnValue(reply({ reservations: [], total: 15, totalPages: 1 }));
    show('/my-reservations?view=list&page=3');
    await waitFor(() => expect(params().get('page')).toBe('1'));
    expect(mocks.read.mock.lastCall[0].page).toBe(0);
});
