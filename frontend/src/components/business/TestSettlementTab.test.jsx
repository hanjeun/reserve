import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestSettlementTab from './TestSettlementTab';
import useAuthStore from '../../store/useAuthStore';

const fixture = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), success: vi.fn(), error: vi.fn(), confirm: vi.fn(), saveCsv: vi.fn() }));
vi.mock('../../api/axios', () => ({ default: { get: fixture.get, post: fixture.post } }));
vi.mock('../../utils/csv', () => ({ downloadCsvBlob: fixture.saveCsv }));
vi.mock('../../hooks/useMyStores', () => ({ default: () => ({ stores: [{ id: 9, name: '합성 가게' }], loading: false }) }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { success: fixture.success, error: fixture.error }, confirm: fixture.confirm }) }));
vi.mock('../common/DataTable', () => ({ default: ({ columns, dataSource }) => <div>{dataSource.map(row => <div key={row.paymentId}>
    <span>{columns.find(column => column.dataIndex === 'state').render(row.state, row)}</span>
    <span>{columns.find(column => column.key === 'action').render(null, row)}</span></div>)}</div> }));

const monthlySummary = { noShowAmount: 10000, deductionAmount: 2000, payableAmount: 7000, simulatedAmount: 1000, reportCount: 1 };

describe('TEST 가상 정산 요청', () => {
    beforeEach(() => {
        vi.resetAllMocks(); useAuthStore.setState({ user: { id: 7, role: 'BUSINESS' }, isLoggedIn: true, sessionRevision: 1 });
        fixture.get.mockImplementation(path => Promise.resolve(path.endsWith('/status') ? { enabled: true }
            : path.endsWith('/monthly') ? monthlySummary
            : { content: [{ paymentId: 7, reservationCode: 'TEST-NOSHOW', balance: 10000, held: false, state: 'READY' }], hasNext: false }));
    });

    it('uses the shared page control with the server total and hides it for an empty list', async () => {
        fixture.get.mockImplementation(path => Promise.resolve(path.endsWith('/status') ? { enabled: true }
            : path.endsWith('/monthly') ? monthlySummary : {
            content: [{ paymentId: 7, balance: 0, held: false, state: 'SETTLED' }], hasNext: true, page: 0, size: 20, totalElements: 41, totalPages: 3,
        }));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        expect(await screen.findByRole('navigation', { name: '정산 내역 페이지' })).toBeVisible();
        fireEvent.click(screen.getByTitle('2'));
        await waitFor(() => expect(fixture.get).toHaveBeenCalledWith('/api/business/settlements', expect.objectContaining({
            params: { storeId: 9, page: 1, month: expect.stringMatching(/^\d{4}-\d{2}$/) },
        })));
        expect(fixture.get.mock.calls.filter(([path]) => path.endsWith('/monthly'))).toHaveLength(1);
        fixture.get.mockImplementation(path => Promise.resolve(path.endsWith('/status') ? { enabled: true }
            : path.endsWith('/monthly') ? monthlySummary
            : { content: [], hasNext: false, page: 0, size: 20, totalElements: 0, totalPages: 0 }));
        await act(async () => client.invalidateQueries({ queryKey: ['test-settlement'] }));
        await waitFor(() => expect(screen.queryByRole('navigation', { name: '정산 내역 페이지' })).toBeNull());
        client.clear();
    });

    it('예약 월을 바꾸면 첫 페이지와 월별 합계를 조회하고 해당 월의 CSV를 내려받아요', async () => {
        const file = new Blob(['환경,예약번호\r\n'], { type: 'text/csv;charset=utf-8' });
        fixture.get.mockImplementation((path, options) => Promise.resolve(path.endsWith('/status') ? { enabled: true }
            : path.endsWith('.csv') ? file
            : path.endsWith('/monthly') ? { ...monthlySummary, noShowAmount: options.params.month === '2025-11' ? 12345 : 0 }
            : { content: [], size: 20, totalElements: 41, totalPages: 3 }));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<MemoryRouter initialEntries={['/?settlementMonth=2025-10&settlementPage=2']}>
            <QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider>
        </MemoryRouter>);
        fireEvent.change(await screen.findByLabelText('예약 월'), { target: { value: '2025-11' } });
        expect(await screen.findByText('12,345')).toBeVisible();
        expect(fixture.get).toHaveBeenCalledWith('/api/business/settlements', expect.objectContaining({
            params: { storeId: 9, month: '2025-11', page: 0 },
        }));
        expect(fixture.saveCsv).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'TEST CSV 다운로드' }));
        await waitFor(() => expect(fixture.saveCsv).toHaveBeenCalledWith('reserve-test-settlement-9-2025-11.csv', file));
        expect(fixture.get).toHaveBeenCalledWith('/api/business/settlements/monthly.csv', expect.objectContaining({
            params: { storeId: 9, month: '2025-11' }, responseType: 'blob',
        }));
        client.clear();
    });
    it('꺼진 기능은 정산 조회나 지급을 요청하지 않아요', async () => {
        fixture.get.mockImplementation(path => path.endsWith('/status')
            ? Promise.resolve({ enabled: false })
            : Promise.reject(new Error('목록 조회 금지')));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        expect(await screen.findByText('TEST 가상 정산이 꺼져 있어요.')).toBeInTheDocument();
        expect(fixture.get).toHaveBeenCalledTimes(1);
        expect(fixture.post).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: '모의 지급' })).toBeNull();
        client.clear();
    });

    it.each(['missing', 'malformed'])('없는 API나 잘못된 상태 응답은 꺼짐으로 감추거나 계속 로딩하지 않아요 (%s)', async mode => {
        fixture.get.mockImplementation(path => path.endsWith('/status')
            ? mode === 'missing' ? Promise.reject(Object.assign(new Error('찾을 수 없어요.'), { status: 404 })) : Promise.resolve({})
            : Promise.reject(new Error('목록 조회 금지')));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        expect(await screen.findByRole('alert')).toBeVisible();
        expect(screen.getByText('정산 내역을 불러오지 못했어요.')).toBeVisible();
        expect(screen.queryByText('TEST 가상 정산이 꺼져 있어요.')).toBeNull();
        expect(fixture.get).toHaveBeenCalledTimes(1);
        expect(fixture.post).not.toHaveBeenCalled();
        client.clear();
    });
    it('권한 오류는 준비 상태로 감추지 않아요', async () => {
        fixture.get.mockRejectedValue(Object.assign(new Error('권한이 없어요.'), { status: 403 }));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText('TEST 가상 정산이 꺼져 있어요.')).toBeNull();
        expect(fixture.get).toHaveBeenCalledTimes(1);
        client.clear();
    });
    it('응답이 유실된 모의 지급을 같은 요청 번호로 복구해요', async () => {
        fixture.post.mockRejectedValueOnce(new Error('응답을 확인하지 못했어요.')).mockResolvedValueOnce({ amount: 10000 });
        const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        fireEvent.click(await screen.findByRole('button', { name: '모의 지급' }));
        await act(async () => fixture.confirm.mock.calls.at(-1)[0].onOk());
        await waitFor(() => expect(fixture.error).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByRole('button', { name: '모의 지급' })).not.toBeDisabled());
        fireEvent.click(screen.getByRole('button', { name: '모의 지급' }));
        await act(async () => fixture.confirm.mock.calls.at(-1)[0].onOk());
        await waitFor(() => expect(fixture.success).toHaveBeenCalledTimes(1));
        expect(fixture.post).toHaveBeenCalledTimes(2);
        const [first, second] = fixture.post.mock.calls;
        expect(first[0]).toBe('/api/business/settlements/9/simulate');
        expect(second).toEqual(first);
        expect(first[1].requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(fixture.get.mock.calls.every(([path]) => ['/api/business/settlements', '/api/business/settlements/status',
            '/api/business/settlements/monthly'].includes(path))).toBe(true);
        client.clear();
    });

    it('가상 지급액을 확인하기 전에는 API를 호출하지 않아요', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        fireEvent.click(await screen.findByRole('button', { name: '모의 지급' }));
        expect(fixture.confirm).toHaveBeenCalledOnce();
        expect(fixture.confirm.mock.calls[0][0].content).toContain('10,000원');
        expect(fixture.confirm.mock.calls[0][0].content).toContain('실제 계좌로 송금하지 않아요.');
        expect(fixture.post).not.toHaveBeenCalled();
        client.clear();
    });

    it('지급 확인창을 연 뒤 계정이 바뀌면 이전 요청을 실행하지 않아요', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        fireEvent.click(await screen.findByRole('button', { name: '모의 지급' }));
        const approval = fixture.confirm.mock.calls[0][0];
        act(() => useAuthStore.setState({ user: { id: 8, role: 'BUSINESS' }, sessionRevision: 2 }));
        await act(async () => approval.onOk());
        expect(fixture.post).not.toHaveBeenCalled();
        expect(fixture.success).not.toHaveBeenCalled();
        client.clear();
    });

    it('다른 계정으로 전환한 뒤 도착한 지급 응답은 완료 메시지를 띄우지 않아요', async () => {
        let resolve;
        fixture.post.mockReturnValue(new Promise(done => { resolve = done; }));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        fireEvent.click(await screen.findByRole('button', { name: '모의 지급' }));
        let pending;
        act(() => { pending = fixture.confirm.mock.calls[0][0].onOk(); });
        await waitFor(() => expect(fixture.post).toHaveBeenCalledOnce());
        act(() => useAuthStore.setState({ user: { id: 8, role: 'BUSINESS' }, sessionRevision: 2 }));
        await act(async () => { resolve({ amount: 10000 }); await pending; });
        expect(fixture.success).not.toHaveBeenCalled();
        expect(fixture.error).not.toHaveBeenCalled();
        client.clear();
    });

    it('확인 대기·환불·조정 필요를 구분하고 지급 버튼을 표시하지 않아요', async () => {
        fixture.get.mockImplementation(path => Promise.resolve(path.endsWith('/status') ? { enabled: true }
            : path.endsWith('/monthly') ? monthlySummary : { content: [
            { paymentId: 1, balance: 0, held: false, state: 'ATTENDANCE_PENDING' },
            { paymentId: 2, balance: 0, held: true, state: 'REFUNDED' },
            { paymentId: 3, balance: -10000, held: true, state: 'ADJUSTMENT_REQUIRED' },
            { paymentId: 4, balance: 10000, held: true, state: 'REVIEW_REQUIRED' },
            { paymentId: 5, balance: 10000, held: false, state: 'UNKNOWN' },
        ], hasNext: false }));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        expect(await screen.findByText('방문·노쇼 확인 대기')).toBeVisible();
        expect(screen.getByText('전액 환불')).toBeVisible();
        expect(screen.getByText('지급 후 환불 · 조정 필요')).toBeVisible();
        expect(screen.getByText('환불·결제 확인 중')).toBeVisible();
        expect(screen.getByText('정산 상태 확인 필요')).toBeVisible();
        expect(screen.queryByRole('button', { name: '모의 지급' })).toBeNull();
        expect(fixture.post).not.toHaveBeenCalled();
        client.clear();
    });
});
