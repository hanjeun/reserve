import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import WaitingStoreSummary from './WaitingStoreSummary';
import { LiveUpdatesContext } from '../../hooks/useLiveUpdatesStatus';

const clients = [];
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); });
const store = { id: 31, waitingIntakeMode: 'REMOTE', waitingPaused: false, waitingTeams: 2 };
function Detail({ read }) {
    const { data } = useQuery({ queryKey: ['stores', 'detail', '31'], queryFn: read, initialData: store, staleTime: Infinity });
    return <WaitingStoreSummary store={data} detail />;
}
const clientFor = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    clients.push(client); return client;
};

it('refreshes the current detail aggregate when opened and renders the updated status and team count', async () => {
    const client = clientFor();
    const read = vi.fn().mockResolvedValue({ ...store, waitingPaused: true, waitingTeams: 4 });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<QueryClientProvider client={client}><Detail read={read} /></QueryClientProvider>);
    expect(read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '웨이팅 정보: 접수 가능, 대기 2팀' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '웨이팅 정보: 접수 중지, 대기 4팀' })).toHaveAttribute('aria-expanded', 'true'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stores', 'detail', '31'], exact: true }, { cancelRefetch: false });
    expect(read).toHaveBeenCalledOnce();
    expect(screen.getByText('대기 4팀')).toBeInTheDocument();
});

it('retains the existing directory refresh target and does not query a detail or private board', async () => {
    const client = clientFor();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<QueryClientProvider client={client}><WaitingStoreSummary store={store} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: /웨이팅 정보/ }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['waiting-stores'] }, { cancelRefetch: false });
});

it('polls only while the detail hint is open when public store updates are unavailable', async () => {
    vi.useFakeTimers();
    const client = clientFor();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const tree = connected => <QueryClientProvider client={client}>
        <LiveUpdatesContext.Provider value={{ connected, domains: ['STORE'] }}><WaitingStoreSummary store={store} detail /></LiveUpdatesContext.Provider>
    </QueryClientProvider>;
    const view = render(tree(false));
    const hint = screen.getByRole('button', { name: /웨이팅 정보/ });
    fireEvent.click(hint);
    expect(invalidate).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(invalidate).toHaveBeenCalledTimes(2);
    view.rerender(tree(true));
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(invalidate).toHaveBeenCalledTimes(2);
    view.rerender(tree(false));
    fireEvent.click(hint);
    await act(async () => { vi.advanceTimersByTime(10000); });
    expect(invalidate).toHaveBeenCalledTimes(2);
});
