import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import CustomersTab from './CustomersTab';
import reservationService from '../../services/reservationService';
import useAuthStore from '../../store/useAuthStore';

vi.mock('../../hooks', async importOriginal => ({ ...await importOriginal(),
    useMyStores: () => ({ stores: [{ id: 21, name: '고객 확인 가게' }], loading: false, refetch: vi.fn() }),
}));
vi.mock('../../services/reservationService', () => ({ default: { getBusinessCustomers: vi.fn() } }));

const initialSession = useAuthStore.getState();
afterEach(() => useAuthStore.setState(initialSession));

it('shows a successful customer page and uses the server total', async () => {
    useAuthStore.setState({ user: { id: 7 }, sessionRevision: 1, isLoggedIn: true });
    reservationService.getBusinessCustomers.mockResolvedValue({ content: [{ storeId: 21, storeName: '고객 확인 가게',
        memberId: 13, name: '테스트 고객', reservations: 3, customerCanceled: 1, reviewCount: 2, averageRating: 3.5 }],
    page: { totalElements: 21, totalPages: 2 } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><AntApp><CustomersTab /></AntApp></QueryClientProvider></MemoryRouter>);
    const row = await screen.findByRole('row', { name: /테스트 고객/ });
    expect(within(row).getByText('3.5점')).toBeInTheDocument();
    expect(screen.getByText('21건')).toBeInTheDocument();
    const intro = screen.getByText(/이 목록의 예약 수/).closest('.reserve-customer-management-intro');
    expect(within(intro).getByRole('button', { name: '내 신고' })).toBeEnabled();
    expect(screen.queryByText('고객 내역을 불러오지 못했어요.')).not.toBeInTheDocument();
});
