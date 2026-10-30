import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import MyReservations from './MyReservations';
import api from '../../api/axios';

const mocks = vi.hoisted(() => ({
    read: vi.fn(),
    auth: { sessionRevision: 1, isLoggedIn: true, user: { id: 7 } },
    message: { message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }, confirm: vi.fn(), modal: { info: vi.fn() } },
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

it('같은 계정의 미결제 안내를 내 예약에서 한 번 표시하고 목록을 다시 조회해요', async () => {
    const result = reply(); mocks.read.mockReturnValue(result);
    show({ pathname: '/my-reservations', search: '?page=2&status=PENDING',
        state: { refetch: true, reserveRouteMotion: 'from-left', paymentIncomplete: { merchantUid: 'ORDfixture', memberId: 7 } } });
    await waitFor(() => expect(mocks.message.modal.info).toHaveBeenCalledTimes(1));
    expect(mocks.message.modal.info).toHaveBeenCalledWith(expect.objectContaining({ title: '결제가 완료되지 않았어요' }));
    expect(result.refetch).toHaveBeenCalledTimes(1);
    expect(params().get('page')).toBe('2');
});

it('이전 계정의 결제 실패 안내는 새 계정에 표시하지 않아요', () => {
    show({ pathname: '/my-reservations', state: { paymentIncomplete: { merchantUid: 'ORDfixture', memberId: 8 } } });
    expect(mocks.message.modal.info).not.toHaveBeenCalled();
});

it('예약 내역이 없으면 새 예약을 시작할 가게 목록으로 이어줘요', () => {
    mocks.read.mockReturnValue(reply({ reservations: [], total: 0, totalPages: 0 }));
    show('/my-reservations');
    expect(screen.getByRole('link', { name: '예약할 가게 찾기' })).toHaveAttribute('href', '/stores');
    expect(screen.queryByRole('button', { name: '검색 조건 초기화' })).toBeNull();
});

it('빈 검색 결과에서는 보기와 웨이팅 조건을 보존하고 예약 검색 조건만 초기화해요', async () => {
    mocks.read.mockReturnValue(reply({ reservations: [], total: 0, totalPages: 0 }));
    show('/my-reservations?status=PENDING&view=cards&waitingPage=2');
    const input = screen.getByPlaceholderText('가게명, 예약번호로 검색');
    fireEvent.change(input, { target: { value: '없는 가게' } });
    await waitFor(() => expect(mocks.read.mock.lastCall[0].search).toBe('없는 가게'));
    expect(screen.queryByRole('link', { name: '예약할 가게 찾기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '검색 조건 초기화' }));
    await waitFor(() => expect(mocks.read.mock.lastCall[0]).toMatchObject({ page: 0, status: undefined, search: undefined }));
    expect(input).toHaveValue('');
    expect(params().get('view')).toBe('cards');
    expect(params().get('waitingPage')).toBe('2');
    expect(screen.getByRole('link', { name: '예약할 가게 찾기' })).toBeInTheDocument();
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

it('검색 대기에는 결과만 골격으로 바꾸고 입력과 포커스를 유지해요', async () => {
    const result = show('/my-reservations?view=list');
    const input = screen.getByPlaceholderText('가게명, 예약번호로 검색');
    input.focus();
    fireEvent.change(input, { target: { value: '가' } });
    expect(screen.getByLabelText('예약 목록을 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByText('서버 첫 예약')).toBeNull();
    mocks.read.mockImplementation(query => reply({ loading: Boolean(query.search) }));
    fireEvent.change(input, { target: { value: '가게' } });
    await waitFor(() => expect(mocks.read.mock.lastCall[0].search).toBe('가게'));
    expect(screen.getByPlaceholderText('가게명, 예약번호로 검색')).toBe(input);
    expect(input).toHaveFocus(); expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: '가게명' } });
    expect(input).toHaveValue('가게명'); expect(input).toHaveFocus();
    await waitFor(() => expect(mocks.read.mock.lastCall[0].search).toBe('가게명'));
    mocks.read.mockReturnValue(reply({ reservations: [row(31, '가게명 결과')] }));
    result.rerender(<MemoryRouter><MyReservations /><LocationProbe /></MemoryRouter>);
    expect(screen.getByText('가게명 결과')).toBeInTheDocument();
    expect(input).toHaveFocus(); expect(input).toBeEnabled();
});

it('returns to the last existing page after a server-side removal empties the requested page', async () => {
    mocks.read.mockReturnValue(reply({ reservations: [], total: 15, totalPages: 1 }));
    show('/my-reservations?view=list&page=3');
    await waitFor(() => expect(params().get('page')).toBe('1'));
    expect(mocks.read.mock.lastCall[0].page).toBe(0);
});

it.each(['list', 'cards'])('일곱 예약 상태의 삭제 버튼과 아이콘을 유지하고 확인 후에만 숨겨요 (%s)', async view => {
    const removable = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'];
    const statuses = [...removable, 'PENDING', 'CONFIRMED', 'UNCONFIRMED'];
    const reservations = statuses.map((status, index) => ({ ...row(index + 1, `합성 가게 ${index + 1}`), status }));
    const refetch = vi.fn();
    mocks.read.mockReturnValue(reply({ reservations, total: reservations.length, totalPages: 1, refetch }));
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({});
    try {
        const { container } = show(`/my-reservations?view=${view}`);
        for (const reservation of reservations) {
            const item = within(container.querySelector(`[data-list-item-id="reservation:${reservation.id}"]`));
            const button = item.queryByRole('button', { name: /삭제$/ });
            if (!removable.includes(reservation.status)) {
                expect(button).toBeNull();
                continue;
            }
            expect(button.querySelector('svg')).not.toBeNull();
            fireEvent.click(button);
            expect(remove).not.toHaveBeenCalled();
            const confirmation = mocks.message.confirm.mock.lastCall[0];
            expect(confirmation).toMatchObject({ title: '예약 삭제', okText: '삭제' });
            await confirmation.onOk();
            expect(remove).toHaveBeenCalledExactlyOnceWith(`/api/reservations/${reservation.id}/remove`);
            expect(refetch).toHaveBeenCalledOnce();
            remove.mockClear(); refetch.mockClear();
        }
    } finally {
        remove.mockRestore();
    }
});

it.each(['list', 'cards'])('화면 만료만으로 삭제하지 않고 서버 취소 확정 뒤 삭제를 다시 표시해요 (%s)', view => {
    const expired = { ...row(71, '합성 만료 가게'), status: 'PENDING', depositAmount: 10000,
        allowLatePayment: false, paymentDeadline: '2000-01-01T00:00:00Z' };
    mocks.read.mockReturnValue(reply({ reservations: [expired], total: 1, totalPages: 1 }));
    const result = show(`/my-reservations?view=${view}`);
    expect(screen.getByRole('timer')).toHaveAttribute('data-state', 'expired');
    for (const name of ['결제하기', '변경', '삭제']) {
        expect(screen.queryByRole('button', { name: new RegExp(name + '$') })).toBeNull();
    }
    expect(screen.getByRole('button', { name: /취소$/ })).toBeInTheDocument();
    mocks.read.mockReturnValue(reply({ reservations: [{ ...expired, status: 'CANCELLED' }], total: 1, totalPages: 1 }));
    result.rerender(<MemoryRouter><MyReservations /><LocationProbe /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /삭제$/ })).toBeInTheDocument();
    expect(screen.queryByRole('timer')).toBeNull();
});

it('삭제 보류 사유를 숨기지 않고 표시하며 목록 성공 처리를 하지 않아요', async () => {
    const refetch = vi.fn();
    mocks.read.mockReturnValue(reply({ reservations: [{ ...row(71, '합성 가게'), status: 'CANCELLED' }], refetch }));
    const reason = '결제·환불 확인이 끝난 후 예약을 삭제할 수 있어요.';
    const remove = vi.spyOn(api, 'delete').mockRejectedValue({ message: reason });
    try {
        show('/my-reservations?view=list');
        fireEvent.click(screen.getByRole('button', { name: /삭제$/ }));
        await mocks.message.confirm.mock.lastCall[0].onOk();
        expect(mocks.message.message.error).toHaveBeenCalledExactlyOnceWith(reason);
        expect(mocks.message.message.success).not.toHaveBeenCalled(); expect(refetch).not.toHaveBeenCalled();
    } finally { remove.mockRestore(); }
});
