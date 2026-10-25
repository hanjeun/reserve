import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PersonalSearchHandoff from './PersonalSearchHandoff';
import useAuthStore from '../../store/useAuthStore';
import searchService from '../../services/searchService';

vi.mock('../../services/searchService', () => ({ default: { reservation: vi.fn(), waiting: vi.fn() } }));
vi.mock('../../components/reservation/ReservationDetailModal', () => ({ default: ({ reservation, open, onClose }) => open
    ? <div role="dialog">예약 {reservation.id}<button onClick={onClose}>상세 닫기</button></div> : null }));
vi.mock('../../components/waiting/WaitingDetailModal', () => ({ default: ({ detail, open, onClose }) => open
    ? <div role="dialog">웨이팅 {detail.entry.id}<button onClick={onClose}>상세 닫기</button></div> : null }));
function Probe() {
    const location = useLocation();
    const [, setParams] = useSearchParams();
    return <><output aria-label="상세 진입 URL">{location.search}</output><button onClick={() => setParams(current => {
        const next = new URLSearchParams(current); next.set('sort', 'oldest'); return next;
    })}>정렬 변경</button></>;
}
const login = (id = 7, sessionRevision = 31) => useAuthStore.setState({ user: { id, role: 'USER', termsAgreed: true },
    isLoggedIn: true, authRestoring: false, isLoggingOut: false, sessionRevision });
function show(path) {
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } });
    return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
        <PersonalSearchHandoff /><Probe />
    </MemoryRouter></QueryClientProvider>) };
}
const params = () => new URLSearchParams(screen.getByLabelText('상세 진입 URL').textContent);

beforeEach(() => {
    vi.clearAllMocks(); login();
    searchService.reservation.mockResolvedValue({ id: 9, memberId: 7 });
    searchService.waiting.mockResolvedValue({ entry: { id: 12 }, storeName: '선택한 가게', teamsAhead: 2 });
});
describe('one-time personal search handoff', () => {
    it('reads the exact authorized reservation, consumes only its hint and does not reopen after closing', async () => {
        show('/my-reservations?reservationId=9&page=2&status=CONFIRMED&view=cards');
        expect(await screen.findByRole('dialog')).toHaveTextContent('예약 9');
        expect(searchService.reservation).toHaveBeenCalledExactlyOnceWith(9, expect.any(AbortSignal));
        expect(params().has('reservationId')).toBe(false);
        expect(params().get('page')).toBe('2'); expect(params().get('status')).toBe('CONFIRMED'); expect(params().get('view')).toBe('cards');
        fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
        fireEvent.click(screen.getByRole('button', { name: '정렬 변경' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(searchService.reservation).toHaveBeenCalledTimes(1);
    });
    it('reads one waiting entry without changing the selected tab or list filters', async () => {
        show('/my-reservations?tab=waiting&entryId=12&waitingPage=4&waitingStatus=CALLED');
        expect(await screen.findByRole('dialog')).toHaveTextContent('웨이팅 12');
        expect(searchService.waiting).toHaveBeenCalledExactlyOnceWith(12, expect.any(AbortSignal));
        expect(searchService.reservation).not.toHaveBeenCalled();
        expect(params().get('tab')).toBe('waiting'); expect(params().get('waitingPage')).toBe('4');
        expect(params().get('waitingStatus')).toBe('CALLED'); expect(params().has('entryId')).toBe(false);
    });
    it.each(['reservationId=0', 'reservationId=09', 'reservationId=9&reservationId=10', 'entryId=12', 'reservationId=9&entryId=12'])('consumes an invalid hint without reading a private object: %s', async query => {
        show('/my-reservations?' + query);
        expect(await screen.findByRole('alert')).toHaveTextContent('주소를 확인');
        expect(searchService.reservation).not.toHaveBeenCalled(); expect(searchService.waiting).not.toHaveBeenCalled();
        expect(params().has('reservationId')).toBe(false); expect(params().has('entryId')).toBe(false);
    });
    it('never displays a cached or late reservation from a previous owner', async () => {
        let finish;
        searchService.reservation.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const view = show('/my-reservations?reservationId=9');
        const signal = searchService.reservation.mock.calls[0][1];
        act(() => login(8, 32));
        expect(signal.aborted).toBe(true);
        expect(screen.queryByRole('dialog')).toBeNull();
        await act(async () => { finish({ id: 9, memberId: 7 }); });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(searchService.reservation).toHaveBeenCalledTimes(1);
        expect(view.client.getQueriesData({ queryKey: ['search-handoff', 7, 31] })).toEqual([]);
    });
    it('hides an opened detail immediately on logout', async () => {
        show('/my-reservations?reservationId=9');
        await screen.findByRole('dialog');
        act(() => useAuthStore.setState({ user: null, isLoggedIn: false, sessionRevision: 32 }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('keeps permission failure distinct and refuses a response for a different member', async () => {
        searchService.reservation.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
        const first = show('/my-reservations?reservationId=9');
        expect(await screen.findByRole('alert')).toHaveTextContent('권한');
        expect(searchService.reservation).toHaveBeenCalledTimes(1); first.unmount();
        searchService.reservation.mockResolvedValue({ id: 9, memberId: 8 });
        show('/my-reservations?reservationId=9');
        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
