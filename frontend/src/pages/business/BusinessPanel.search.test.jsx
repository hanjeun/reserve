import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import BusinessPanel from './BusinessPanel';
const state = vi.hoisted(() => ({ read: vi.fn(), pending: false }));
vi.mock('../../hooks/useManageReservations', () => ({ default: state.read }));
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
beforeEach(() => {
    vi.resetAllMocks(); sessionStorage.clear(); state.pending = false;
    state.read.mockImplementation(query => ({ reservations: [{ id: 1, storeName: '사업자 예약 결과' }], total: 1, totalPages: 1,
        loading: state.pending && Boolean(query.search), refetching: false, hasData: true, error: null, refetch: vi.fn() }));
});
it('사업자 예약 검색은 지연 중 결과만 가리고 요청 중에도 검색어를 이어 입력할 수 있어요', async () => {
    const page = render(<MemoryRouter initialEntries={['/business?tab=reservations']}><BusinessPanel /></MemoryRouter>);
    const input = screen.getByPlaceholderText('가게명, 예약자로 검색');
    expect(screen.getByText('사업자 예약 결과')).toBeInTheDocument();
    input.focus(); state.pending = true;
    fireEvent.change(input, { target: { value: '예약' } });
    expect(screen.queryByText('사업자 예약 결과')).toBeNull();
    await waitFor(() => expect(state.read.mock.lastCall[0].search).toBe('예약'));
    expect(screen.getByPlaceholderText('가게명, 예약자로 검색')).toBe(input);
    expect(input).toBeEnabled(); expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '예약자' } });
    await waitFor(() => expect(state.read.mock.lastCall[0].search).toBe('예약자'));
    state.pending = false;
    page.rerender(<MemoryRouter><BusinessPanel /></MemoryRouter>);
    expect(screen.getByText('사업자 예약 결과')).toBeInTheDocument(); expect(input).toHaveFocus();
});
