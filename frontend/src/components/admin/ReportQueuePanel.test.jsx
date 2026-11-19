import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import ReportQueuePanel from './ReportQueuePanel';
import serviceReportService from '../../services/serviceReportService';
import useAuthStore from '../../store/useAuthStore';

vi.mock('../../services/serviceReportService', () => ({ default: { adminList: vi.fn() } }));
vi.mock('./ChatReportsPanel', () => ({ default: ({ initialContextId }) => <p>채팅 신고 상세 {initialContextId}</p> }));

const initialSession = useAuthStore.getState();
afterEach(() => useAuthStore.setState(initialSession));

it('preserves legacy report reasons and opens the selected source case from the shared queue', async () => {
    useAuthStore.setState({ user: { id: 1 }, sessionRevision: 4, isLoggedIn: true });
    serviceReportService.adminList.mockResolvedValue({ content: [
        { id: 31, reportType: 'CHAT', targetId: 17, reason: 'FRAUD', status: 'OPEN' },
        { id: 31, reportType: 'REVIEW', targetId: 20, reason: 'RATING_MANIPULATION', status: 'OPEN' },
    ], page: { totalElements: 2, totalPages: 1 } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter initialEntries={['/admin?tab=reports']}>
        <QueryClientProvider client={client}><AntApp><ReportQueuePanel /></AntApp></QueryClientProvider>
    </MemoryRouter>);
    const chat = await screen.findByRole('row', { name: /사기·결제 유도/ });
    expect(screen.getByText('별점 조작 의심')).toBeInTheDocument();
    fireEvent.click(within(chat).getByRole('button', { name: '채팅 신고 31 보기' }));
    expect(await screen.findByText('채팅 신고 상세 31')).toBeInTheDocument();
});
