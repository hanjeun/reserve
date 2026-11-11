import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import ReservationNotificationThread, { ReservationNotificationEntry } from './ReservationNotificationThread';
import { chatUnreadCounts } from './chatUnread';
import { chatService } from '../../services';
import { chatKeys } from '../../hooks/queryKeys';

vi.mock('../../services', () => ({ chatService: {
    getUnread: vi.fn(),
    getReservationNotifications: vi.fn(),
    readReservationNotifications: vi.fn(),
} }));

const base = { storeName: '알림 검사 가게', reservationDate: '2030-01-01', reservationTime: '12:00:00',
    createdAt: '2029-12-27T07:00:00Z' };
const queryClients = [];

afterEach(() => {
    queryClients.splice(0).forEach(client => client.clear());
    vi.resetAllMocks();
});

it('reads only the open page, keeps the thread read-only and routes recipients to the correct workspace', async () => {
    chatService.getReservationNotifications.mockImplementation(before => Promise.resolve(before == null ? {
        items: [
            { ...base, id: 7, kind: 'CANCELLED', ownerNotice: true, read: false },
            { ...base, id: 6, kind: 'APPROVED', ownerNotice: false, read: true },
        ], nextBefore: 6,
    } : { items: [{ ...base, id: 3, kind: 'CHANGED', ownerNotice: false, read: false }], nextBefore: null }));
    chatService.readReservationNotifications.mockResolvedValue(1);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClients.push(client);
    const onBack = vi.fn();
    render(<QueryClientProvider client={client}><MemoryRouter>
        <ReservationNotificationThread onBack={onBack} onAnimationEnd={vi.fn()} returningToList={false} />
    </MemoryRouter></QueryClientProvider>);

    expect(await screen.findByText('예약이 취소됐어요.')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: '예약 보기' });
    expect(links[0]).toHaveAttribute('href', '/business?tab=reservations&notification=7');
    expect(links[1]).toHaveAttribute('href', '/my-reservations?notification=6');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await waitFor(() => expect(chatService.readReservationNotifications.mock.calls).toEqual([[[7]]]));

    fireEvent.click(screen.getByRole('button', { name: '이전 알림' }));
    expect(await screen.findByText('예약이 변경됐어요.')).toBeInTheDocument();
    await waitFor(() => expect(chatService.readReservationNotifications.mock.calls).toEqual([[[7]], [[3]]]));
    fireEvent.click(screen.getByRole('button', { name: '대화 목록으로 돌아가기' }));
    expect(onBack).toHaveBeenCalledOnce();
});

function MessageBadgeProbe() {
    const { data } = useQuery({ queryKey: chatKeys.unread(), enabled: false });
    const { messages, notifications } = chatUnreadCounts(data);
    return <output aria-label="메시지 버튼 배지">{messages + notifications}</output>;
}

it('removes the same read alert from the row and total before another unread fetch', async () => {
    chatService.getReservationNotifications.mockResolvedValue({ items: [
        { ...base, id: 7, kind: 'APPROVED', read: false },
    ] });
    let read;
    chatService.readReservationNotifications.mockImplementation(() => new Promise(resolve => { read = resolve; }));
    const client = new QueryClient();
    queryClients.push(client);
    client.setQueryData(chatKeys.unread(), { messages: 2, notifications: 1 });
    render(<QueryClientProvider client={client}><MemoryRouter>
        <ReservationNotificationEntry buttonRef={{ current: null }} selected pollUnread={false} onSelect={vi.fn()} />
        <MessageBadgeProbe />
        <ReservationNotificationThread onBack={vi.fn()} onAnimationEnd={vi.fn()} returningToList={false} />
    </MemoryRouter></QueryClientProvider>);
    expect(screen.getByLabelText('읽지 않은 알림 1개')).toHaveTextContent('1');
    expect(screen.getByLabelText('메시지 버튼 배지')).toHaveTextContent('3');
    await waitFor(() => expect(chatService.readReservationNotifications).toHaveBeenCalledWith([7]));
    read({ changed: 1, unread: 0 });
    await waitFor(() => expect(screen.queryByLabelText('읽지 않은 알림 1개')).not.toBeInTheDocument());
    expect(screen.getByLabelText('메시지 버튼 배지')).toHaveTextContent('2');
    expect(chatService.getUnread).not.toHaveBeenCalled();
});
