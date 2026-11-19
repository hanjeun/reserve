import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import NoShowMembers from './NoShowMembers';
import reservationService from '../../services/reservationService';
import useAuthStore from '../../store/useAuthStore';

vi.mock('../../services/reservationService', () => ({
    default: { getNoShowMembers: vi.fn(), restrictNoShowMember: vi.fn(), releaseNoShowMember: vi.fn() },
}));
vi.mock('../common/FormSelect', () => ({
    default: ({ options, value, onChange, ...props }) => <select {...props} value={value}
        onChange={event => onChange(options.find(option => String(option.value) === event.target.value).value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>,
}));

const originalAuth = useAuthStore.getState();
afterEach(() => useAuthStore.setState(originalAuth));

it('전체 가게에서 같은 사람의 가게를 구분하고 해당 행의 가게에만 영구 제한을 요청해요', async () => {
    useAuthStore.setState({ user: { id: 7 }, isLoggedIn: true, sessionRevision: 1 });
    const first = { storeId: 11, storeName: '합성 첫 가게', memberId: 90, name: '합성 회원', restrictable: true };
    const second = { ...first, storeId: 22, storeName: '합성 두 번째 가게' };
    const restricted = { ...second, permanent: true, restrictionId: 5 };
    const result = (...rows) => ({ content: rows, page: { totalElements: rows.length, totalPages: 1 } });
    reservationService.getNoShowMembers.mockResolvedValueOnce(result(first, second)).mockResolvedValue(result(first, restricted));
    reservationService.restrictNoShowMember.mockResolvedValue(null);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const stores = [first, second].map(row => ({ id: row.storeId, name: row.storeName }));
    const component = render(<MemoryRouter><QueryClientProvider client={client}>
        <ConfigProvider theme={{ token: { motion: false } }}><AntApp>
            <NoShowMembers storeList={{ stores, loading: false, refetch: vi.fn() }} />
        </AntApp></ConfigProvider>
    </QueryClientProvider></MemoryRouter>);
    try {
        const row = await screen.findByRole('row', { name: /합성 두 번째 가게/ });
        expect(screen.getByRole('button', { name: '노쇼 인원 가게' })).toHaveTextContent('전체 가게');
        expect(reservationService.getNoShowMembers).toHaveBeenCalledWith(undefined, expect.objectContaining({ page: 0 }), expect.any(AbortSignal));
        fireEvent.click(within(row).getByRole('button', { name: '예약 제한' }));
        const dialog = await screen.findByRole('dialog', { name: '새 예약 제한' });
        await waitFor(() => expect(within(dialog).getByText(second.storeName)).toBeVisible());
        expect(within(dialog).getByText(second.name)).toBeVisible();
        fireEvent.change(within(dialog).getByRole('combobox', { name: '제한 기간' }), { target: { value: 'permanent' } });
        const confirm = within(dialog).getByRole('button', { name: '영구 제한' });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByRole('textbox', { name: '제한 사유' }), { target: { value: ' 합성 사유 ' } });
        fireEvent.click(confirm);
        await waitFor(() => expect(reservationService.restrictNoShowMember).toHaveBeenCalledExactlyOnceWith(22, 90, {
            permanent: true, reason: '합성 사유',
        }));
        expect(await screen.findByRole('cell', { name: '영구 제한' })).toBeInTheDocument();
    } finally {
        component.unmount();
        client.clear();
    }
});
