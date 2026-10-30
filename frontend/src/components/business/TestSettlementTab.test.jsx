import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestSettlementTab from './TestSettlementTab';
import useAuthStore from '../../store/useAuthStore';

const fixture = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../../api/axios', () => ({ default: { get: fixture.get, post: fixture.post } }));
vi.mock('../../hooks/useMyStores', () => ({ default: () => ({ stores: [{ id: 9, name: '합성 가게' }], loading: false }) }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { success: fixture.success, error: fixture.error } }) }));
vi.mock('../common/DataTable', () => ({ default: ({ columns, dataSource }) => <div>{dataSource.map(row => <div key={row.paymentId}>
    {columns.find(column => column.key === 'action').render(null, row)}</div>)}</div> }));

describe('TEST 가상 정산 요청', () => {
    beforeEach(() => {
        vi.clearAllMocks(); useAuthStore.setState({ sessionRevision: 1 });
        fixture.get.mockImplementation(path => Promise.resolve(path.endsWith('/status') ? { enabled: true } : { content: [{ paymentId: 7, balance: 10000, held: false }], hasNext: false }));
    });
    it.each(['disabled', 'missing'])('준비 중인 기능은 정산 조회나 지급을 요청하지 않아요 (%s)', async mode => {
        fixture.get.mockImplementation(path => path.endsWith('/status')
            ? mode === 'disabled' ? Promise.resolve({ enabled: false }) : Promise.reject(Object.assign(new Error('준비 중'), { status: 404 }))
            : Promise.reject(new Error('목록 조회 금지')));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        expect(await screen.findByText('TEST 가상 정산을 준비하고 있어요.')).toBeInTheDocument();
        expect(fixture.get).toHaveBeenCalledTimes(1);
        expect(fixture.post).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: '모의 지급' })).toBeNull();
        client.clear();
    });
    it('권한 오류는 준비 상태로 감추지 않아요', async () => {
        fixture.get.mockRejectedValue(Object.assign(new Error('권한이 없어요.'), { status: 403 }));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText('TEST 가상 정산을 준비하고 있어요.')).toBeNull();
        expect(fixture.get).toHaveBeenCalledTimes(1);
        client.clear();
    });
    it('응답이 유실된 모의 지급을 같은 요청 번호로 복구해요', async () => {
        fixture.post.mockRejectedValueOnce(new Error('응답을 확인하지 못했어요.')).mockResolvedValueOnce({ amount: 10000 });
        const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        render(<MemoryRouter><QueryClientProvider client={client}><TestSettlementTab /></QueryClientProvider></MemoryRouter>);
        fireEvent.click(await screen.findByRole('button', { name: '모의 지급' }));
        await waitFor(() => expect(fixture.error).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByRole('button', { name: '모의 지급' })).not.toBeDisabled());
        fireEvent.click(screen.getByRole('button', { name: '모의 지급' }));
        await waitFor(() => expect(fixture.success).toHaveBeenCalledTimes(1));
        expect(fixture.post).toHaveBeenCalledTimes(2);
        const [first, second] = fixture.post.mock.calls;
        expect(first[0]).toBe('/api/business/settlements/9/simulate');
        expect(second).toEqual(first);
        expect(first[1].requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(fixture.get.mock.calls.every(([path]) => ['/api/business/settlements', '/api/business/settlements/status'].includes(path))).toBe(true);
        client.clear();
    });
});
