import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminAdsTab from './AdminAdsTab';
import adService from '../../services/adService';

const state = vi.hoisted(() => ({ sanction: null, message: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/adService', () => ({ default: { getAllAds: vi.fn(), suspendAd: vi.fn() } }));
vi.mock('../../hooks', () => ({
    useMessage: () => ({ message: state.message }),
    useQueryParamsState: defaults => [defaults, vi.fn()],
}));
vi.mock('../../hooks/useDebounce', () => ({ default: value => value }));
vi.mock('./SanctionModal', () => ({ default: props => { state.sanction = props; return props.open && <section role="dialog">
    <button onClick={() => props.onOk({ reason: '시험 중단' })}>중단 확인</button><button onClick={props.onCancel}>닫기</button>
</section>; } }));
vi.mock('../common', () => ({
    Button: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
    AdminTableSkeleton: () => <span>조회 중</span>, DataState: () => null, FilterToolbar: () => null,
    DataTable: ({ columns, dataSource }) => <>{dataSource.map(row => <div key={row.id}>
        {columns.find(column => column.key === 'actions').render(null, row)}
    </div>)}</>,
}));
let client;
beforeEach(() => {
    vi.clearAllMocks();
    adService.getAllAds.mockResolvedValue({ content: [{ id: 73, storeName: '시험 가게', status: 'ACTIVE' }], page: { totalElements: 1 } });
    adService.suspendAd.mockResolvedValue(null);
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => client.clear());
const mount = () => render(<QueryClientProvider client={client}><AdminAdsTab /></QueryClientProvider>);

it('suspends the selected ad once and ignores a late confirmation after the target is cleared', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /중단$/ }));
    await act(async () => { await state.sanction.onOk({ reason: '시험 중단' }); });
    expect(adService.suspendAd).toHaveBeenCalledWith(73, '시험 중단');
    await waitFor(() => expect(state.sanction.open).toBe(false));
    await act(async () => { await state.sanction.onOk({ reason: '늦은 확인' }); });
    expect(adService.suspendAd).toHaveBeenCalledTimes(1);
});

it('canceling the reason dialog prevents a late callback from suspending the ad', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /중단$/ }));
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    await act(async () => { await state.sanction.onOk({ reason: '늦은 확인' }); });
    expect(adService.suspendAd).not.toHaveBeenCalled();
});
