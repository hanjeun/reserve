import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import BusinessPanel from './BusinessPanel';
const read = vi.hoisted(() => vi.fn());
vi.mock('../../services/reservationService', () => ({ default: { getStoreReservations: read } }));
vi.mock('../../hooks', async () => ({
    useQueryParamsState: (await import('../../hooks/useQueryParamState')).useQueryParamsState,
    useMyStores: () => ({ stores: [{ id: 1, name: '가게' }], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { error: vi.fn(), success: vi.fn() }, confirm: vi.fn() }) }));
vi.mock('../../hooks/useLiveUpdatesStatus', () => ({ default: () => ({ connected: true, domains: ['RESERVATION'] }) }));
vi.mock('../../components/layout/WorkspaceLayout', () => ({ default: ({ children }) => children }));
vi.mock('../../components/layout/WorkspacePanels', () => ({ default: ({ activeKey, items }) => items.find(item => item.key === activeKey)?.children }));
vi.mock('../../components/reservation/ReservationCard', () => ({ default: ({ reservation }) => <div>{reservation.storeName}</div> }));
vi.mock('../../components/reservation/QrScannerSheet', () => ({ default: () => null }));
vi.mock('../../components/advertisement/AdManageTab', () => ({ default: () => null }));
vi.mock('../../components/business/TestSettlementTab', () => ({ default: () => null }));
vi.mock('../../components/business/StatisticsTab', () => ({ default: () => null }));
vi.mock('../../components/business/ChatIntroTab', () => ({ default: () => null }));
const reservations = [{ id: 1, storeName: '사업자 예약 첫째' }, { id: 2, storeName: '사업자 예약 둘째' }];
const result = content => ({ content, page: { totalElements: 30, totalPages: 2 } });
const show = (path = '/business?tab=reservations') => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}><BusinessPanel /></MemoryRouter>
    </QueryClientProvider>,
);
beforeEach(() => {
    sessionStorage.clear();
    read.mockReset().mockResolvedValue(result(reservations));
});
it('사업자 예약은 확정한 검색어만 조회하고 요청 중에도 다음 검색어를 입력할 수 있어요', async () => {
    let finishSearch;
    read.mockImplementation(({ search }) => search
        ? new Promise(resolve => { finishSearch = resolve; })
        : Promise.resolve(result(reservations)));
    show();
    await screen.findByText('사업자 예약 첫째');
    const input = screen.getByPlaceholderText('가게명, 예약자로 검색');
    input.focus();
    fireEvent.change(input, { target: { value: '예약' } });
    expect(screen.getByText('사업자 예약 첫째')).toBeInTheDocument();
    expect(read.mock.lastCall[0].search).toBeUndefined();
    fireEvent.submit(input.closest('form'));
    expect(screen.queryByText('사업자 예약 첫째')).toBeNull();
    await waitFor(() => expect(read.mock.lastCall[0].search).toBe('예약'));
    expect(screen.getByPlaceholderText('가게명, 예약자로 검색')).toBe(input);
    expect(input).toBeEnabled(); expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '예약자' } });
    expect(read.mock.lastCall[0].search).toBe('예약');
    fireEvent.submit(input.closest('form'));
    await waitFor(() => expect(read.mock.lastCall[0].search).toBe('예약자'));
    await act(async () => finishSearch(result(reservations)));
    expect(await screen.findByText('사업자 예약 첫째')).toBeInTheDocument();
    expect(input).toHaveFocus();
});

it('정렬 응답 전에는 사업자 예약과 도구를 유지하고 응답 뒤 바뀐 순서만 전환해요', async () => {
    let finishSort;
    read.mockImplementation(({ sort }) => sort === 'recent'
        ? Promise.resolve(result(reservations))
        : new Promise(resolve => { finishSort = resolve; }));
    show('/business?tab=reservations&reservationPage=2');
    const first = await screen.findByText('사업자 예약 첫째');
    const list = first.parentElement;
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    list.animate = animate;
    const sort = screen.getByRole('button', { name: '예약 정렬' });
    fireEvent.click(sort);
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '오래된 예약순' }));
    await waitFor(() => expect(read.mock.lastCall[0]).toMatchObject({ page: 0, sort: 'oldest' }));
    expect(sort).toHaveFocus();
    expect(sort).toHaveAttribute('aria-busy', 'true');
    expect(list).toContainElement(first);
    expect(animate).not.toHaveBeenCalled();

    await act(async () => finishSort(result([...reservations].reverse())));
    await waitFor(() => expect(sort).not.toHaveAttribute('aria-busy'));
    expect(list.firstElementChild).toHaveTextContent('사업자 예약 둘째');
    expect(animate).toHaveBeenCalledOnce();
    expect(sort).toHaveFocus();
});
