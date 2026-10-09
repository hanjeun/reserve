import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import MyWaiting from './MyWaiting';
import waitingService from '../../services/waitingService';
import { normalizeListQueryParams } from '../../utils/listQueryParams';

const auth = vi.hoisted(() => ({ isLoggedIn: true, sessionRevision: 1, user: { id: 7 } }));
vi.mock('../../services/waitingService', () => ({ default: { getMine: vi.fn() } }));
vi.mock('../../store/useAuthStore', () => {
    const read = () => auth;
    const hook = selector => selector ? selector(read()) : read();
    hook.getState = read;
    hook.subscribe = () => () => {};
    return { default: hook };
});
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: {}, confirm: vi.fn() }) }));
vi.mock('./WaitingQrModal', () => ({ default: ({ open, entryId }) => open ? <div role="dialog">입장 QR {entryId}</div> : null }));
const clients = new Set();
afterEach(() => {
    vi.unstubAllGlobals(); waitingService.getMine.mockReset();
    clients.forEach(client => client.clear()); clients.clear();
    Object.assign(auth, { isLoggedIn: true, sessionRevision: 1, user: { id: 7 } });
});

function LocationProbe() {
    const location = useLocation();
    const [, setParams] = useSearchParams();
    return <><output data-testid="waiting-search-params">{location.search}</output>
        <button type="button" onClick={() => setParams(current => {
            const next = new URLSearchParams(current); next.set('waitingPage', '9'); return next;
        })}>페이지 9로 이동</button></>;
}
const pageWith = (name, total = 1, status = 'WAITING') => ({ content: [{
    entry: { id: 12, storeId: 31, entryNumber: 4, partySize: 2, status }, storeName: name, teamsAhead: 3,
}], page: { totalElements: total } });
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const showMine = (path = '/my-reservations?tab=waiting&view=list') => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    clients.add(client);
    const element = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
        <MyWaiting /><LocationProbe />
    </MemoryRouter></QueryClientProvider>;
    const view = render(element());
    return { ...view, client, rerenderAuth: () => view.rerender(element()) };
};
const currentParams = () => new URLSearchParams(screen.getByTestId('waiting-search-params').textContent);

it('refreshes my waiting on a live signal and removes entry QR after seating without a page reload', async () => {
    const streams = [];
    class Source {
        listeners = {}; close = vi.fn();
        constructor() { streams.push(this); }
        addEventListener(name, listener) { this.listeners[name] = listener; }
    }
    vi.stubGlobal('EventSource', Source);
    let status = 'WAITING';
    waitingService.getMine.mockImplementation(async () => ({ content: [{
        entry: { id: 12, storeId: 31, entryNumber: 4, partySize: 2, status }, storeName: '가게', teamsAhead: 3,
    }], page: { totalElements: 1 } }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = render(<QueryClientProvider client={client}><MemoryRouter><MyWaiting /></MemoryRouter></QueryClientProvider>);
    await screen.findByText('내 앞에 3팀이 있어요.');
    expect(screen.queryByRole('button', { name: '입장 QR' })).toBeNull();
    status = 'CALLED';
    await act(async () => streams[0].listeners['waiting-changed']());
    fireEvent.click(await screen.findByRole('button', { name: '입장 QR' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('입장 QR 12');
    status = 'SEATED';
    await act(async () => streams[0].listeners['waiting-changed']());
    await screen.findByText('입장 완료');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: '취소' })).toBeNull();
    view.unmount(); expect(streams[0].close).toHaveBeenCalledOnce(); client.clear();
});

it('reuses the reservation toolbar with an adjacent server count and only recent or oldest waiting sorts', async () => {
    waitingService.getMine.mockResolvedValue(pageWith('서버가 고른 웨이팅', 41, 'CALLED'));
    const { container } = showMine('/my-reservations?tab=waiting&view=list&status=CONFIRMED&sort=visit&waitingStatus=CALLED&waitingSort=oldest&waitingPage=2');
    await screen.findByText('서버가 고른 웨이팅');
    expect(waitingService.getMine).toHaveBeenCalledWith(1, expect.anything(), { keyword: '', status: 'CALLED', sort: 'oldest' });
    const toolbar = screen.getByLabelText('내 웨이팅 목록 필터');
    expect(toolbar.querySelector('.reserve-store-view-toggle').nextElementSibling).toHaveTextContent('41건');
    expect(container.querySelector('.reserve-filter-toolbar-secondary input')).toBe(screen.getByPlaceholderText('가게명, 대기번호로 검색'));
    fireEvent.click(screen.getByRole('button', { name: '예약 정렬' }));
    expect(await screen.findByRole('menuitemradio', { name: '최신 예약순' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: '오래된 예약순' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: '방문일 빠른순' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '최신 예약순' }));
    await waitFor(() => expect(waitingService.getMine).toHaveBeenCalledWith(0, expect.anything(), { keyword: '', status: 'CALLED', sort: 'recent' }));
    fireEvent.click(screen.getByRole('button', { name: '예약 상태' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '대기 중' }));
    await waitFor(() => expect(waitingService.getMine).toHaveBeenCalledWith(0, expect.anything(), { keyword: '', status: 'WAITING', sort: 'recent' }));
    expect(currentParams().get('status')).toBe('CONFIRMED');
    expect(currentParams().get('sort')).toBe('visit');
    expect(currentParams().has('waitingPage')).toBe(false);
    expect(currentParams().get('waitingStatus')).toBe('WAITING');
    fireEvent.click(screen.getByRole('button', { name: '사진형 보기로 전환' }));
    expect(currentParams().get('waitingStatus')).toBe('WAITING');
    expect(currentParams().get('view')).toBe('cards');
});

it('keeps the same focused search field and prior own data while a debounced server search is pending', async () => {
    const request = deferred();
    waitingService.getMine.mockResolvedValueOnce(pageWith('이전 내 웨이팅', 60)).mockReturnValue(request.promise);
    showMine('/my-reservations?tab=waiting&view=list&waitingPage=3&status=CONFIRMED&sort=oldest');
    await screen.findByText('이전 내 웨이팅');
    const input = screen.getByPlaceholderText('가게명, 대기번호로 검색'); input.focus();
    fireEvent.change(input, { target: { value: '새 가게' } });
    await waitFor(() => expect(waitingService.getMine).toHaveBeenCalledWith(0, expect.anything(), { keyword: '새 가게', status: 'ALL', sort: 'recent' }));
    expect(screen.getByPlaceholderText('가게명, 대기번호로 검색')).toBe(input);
    expect(input).toHaveFocus(); expect(input).toBeEnabled();
    expect(screen.getByText('이전 내 웨이팅')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '내 웨이팅을 불러오는 중' })).toBeNull();
    expect(currentParams().has('waitingPage')).toBe(false);
    expect(currentParams().get('status')).toBe('CONFIRMED');
    expect(currentParams().get('sort')).toBe('oldest');
    await act(async () => request.resolve(pageWith('새 가게', 1)));
    await screen.findByRole('link', { name: '새 가게' });
    expect(screen.queryByText('이전 내 웨이팅')).toBeNull();
});

it('does not correct a new waiting page using placeholder totals from an earlier page', async () => {
    const request = deferred();
    waitingService.getMine.mockResolvedValueOnce(pageWith('앞 페이지', 1)).mockReturnValue(request.promise);
    showMine(); await screen.findByText('앞 페이지');
    fireEvent.click(screen.getByRole('button', { name: '페이지 9로 이동' }));
    await waitFor(() => expect(waitingService.getMine).toHaveBeenCalledWith(8, expect.anything(), { keyword: '', status: 'ALL', sort: 'recent' }));
    expect(currentParams().get('waitingPage')).toBe('9');
    expect(screen.getByText('앞 페이지')).toBeInTheDocument();
    await act(async () => request.resolve(pageWith('아홉 번째 페이지', 180)));
    await screen.findByText('아홉 번째 페이지');
    expect(currentParams().get('waitingPage')).toBe('9');
});

it('keeps manual reload spinning and blocked until it finishes while retaining the list', async () => {
    const request = deferred();
    waitingService.getMine.mockResolvedValueOnce(pageWith('갱신 전')).mockReturnValue(request.promise);
    showMine(); await screen.findByText('갱신 전');
    const refresh = screen.getByRole('button', { name: '새로고침' }); fireEvent.click(refresh);
    await waitFor(() => expect(waitingService.getMine).toHaveBeenCalledTimes(2));
    expect(refresh).toBeDisabled(); expect(refresh.querySelector('.anticon-spin')).not.toBeNull();
    expect(screen.getByPlaceholderText('가게명, 대기번호로 검색')).toBeDisabled();
    expect(screen.getByText('갱신 전')).toBeInTheDocument();
    fireEvent.click(refresh); expect(waitingService.getMine).toHaveBeenCalledTimes(2);
    await act(async () => request.resolve(pageWith('갱신 후')));
    await screen.findByText('갱신 후');
    await waitFor(() => expect(screen.getByPlaceholderText('가게명, 대기번호로 검색')).toBeEnabled());
    expect(refresh.querySelector('.anticon-spin')).toBeNull();
});

it('never borrows a previous session list or applies its late manual reload to a new owner', async () => {
    const oldReload = deferred(); const newOwner = deferred();
    waitingService.getMine.mockResolvedValueOnce(pageWith('이전 계정의 웨이팅'))
        .mockReturnValueOnce(oldReload.promise).mockReturnValue(newOwner.promise);
    const view = showMine(); await screen.findByText('이전 계정의 웨이팅');
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    await waitFor(() => expect(waitingService.getMine).toHaveBeenCalledTimes(2));
    Object.assign(auth, { sessionRevision: 2, user: { id: 8 } }); view.rerenderAuth();
    await waitFor(() => expect(waitingService.getMine).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('이전 계정의 웨이팅')).toBeNull();
    expect(screen.getByRole('status', { name: '내 웨이팅을 불러오는 중' })).toBeInTheDocument();
    await act(async () => oldReload.resolve(pageWith('늦게 온 이전 계정')));
    expect(screen.queryByText('늦게 온 이전 계정')).toBeNull();
    await act(async () => newOwner.resolve(pageWith('새 계정의 웨이팅')));
    await screen.findByText('새 계정의 웨이팅');
    expect(screen.getByPlaceholderText('가게명, 대기번호로 검색')).toBeEnabled();
    expect(screen.getByRole('button', { name: '새로고침' }).querySelector('.anticon-spin')).toBeNull();
});

it('keeps search focus after a failed initial request instead of replacing the toolbar on a new filter', async () => {
    const request = deferred();
    waitingService.getMine.mockRejectedValueOnce(new Error('offline')).mockReturnValue(request.promise);
    showMine();
    const input = await screen.findByPlaceholderText('가게명, 대기번호로 검색'); input.focus();
    fireEvent.change(input, { target: { value: '다시 검색' } });
    await waitFor(() => expect(waitingService.getMine).toHaveBeenCalledWith(0, expect.anything(), { keyword: '다시 검색', status: 'ALL', sort: 'recent' }));
    expect(screen.getByPlaceholderText('가게명, 대기번호로 검색')).toBe(input);
    expect(input).toHaveFocus(); expect(input).toBeEnabled();
    expect(screen.queryByRole('status', { name: '내 웨이팅을 불러오는 중' })).toBeNull();
    await act(async () => request.resolve({ content: [], page: { totalElements: 0 } }));
    await screen.findByText('조건에 맞는 웨이팅이 없어요.');
});

it('normalizes waiting keys independently while preserving the existing reservation options', () => {
    const input = new URLSearchParams('tab=waiting&waitingPage=3&waitingStatus=CALLED&waitingSort=oldest&waitingKeyword=가게&status=CONFIRMED&sort=visit');
    const result = normalizeListQueryParams('/my-reservations', input);
    expect(result.toString()).toBe(input.toString());
    const invalid = normalizeListQueryParams('/my-reservations', new URLSearchParams({
        tab: 'waiting', waitingStatus: 'CONFIRMED', waitingSort: 'visit', waitingKeyword: '가'.repeat(101), waitingPage: '100001',
        status: 'CONFIRMED', sort: 'visit',
    }));
    ['waitingStatus', 'waitingSort', 'waitingKeyword', 'waitingPage'].forEach(key => expect(invalid.has(key)).toBe(false));
    expect(invalid.get('status')).toBe('CONFIRMED'); expect(invalid.get('sort')).toBe('visit');
    expect(invalid.get('tab')).toBe('waiting');
    expect(normalizeListQueryParams('/my-favorites', input).has('waitingStatus')).toBe(false);
});
