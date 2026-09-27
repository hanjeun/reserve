import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatBubbleList from './ChatBubbleList';
import { chatService } from '../../services';

vi.mock('../../hooks', () => ({ useMessage: () => ({ message: { success: vi.fn(), error: vi.fn() }, confirm: vi.fn() }) }));
vi.mock('../../services', () => ({ chatService: { reportConversation: vi.fn() } }));
describe('message-scoped actions', () => {
    beforeEach(() => chatService.reportConversation.mockResolvedValue({ id: 1 }));
    it('places own actions before the bubble and reports a retracted opponent by stable ID', async () => {
        const view = render(<ChatBubbleList mine="MEMBER" roomId={7} reportRole="MEMBER" onRetracted={vi.fn()}
            messages={[{ id: 1, senderRole: 'MEMBER', content: '내 메시지', canRetract: true },
                { id: 2, senderRole: 'OWNER', content: '전송이 취소된 메시지입니다.', retracted: true }]} />);
        const first = view.container.querySelector('.reserve-chat-message-row');
        expect(first.querySelector('.reserve-chat-message-meta').nextElementSibling).toHaveClass('reserve-chat-bubble-group');
        fireEvent.click(screen.getAllByRole('button', { name: '메시지 관리' })[1]);
        fireEvent.click(await screen.findByText('메시지 신고'));
        fireEvent.mouseDown(await screen.findByRole('combobox'));
        fireEvent.click(await screen.findByText('스팸·도배'));
        fireEvent.click(screen.getByRole('button', { name: '신고 접수' }));
        await waitFor(() => expect(chatService.reportConversation).toHaveBeenCalledWith(7, 'MEMBER', {
            reason: 'SPAM', details: undefined, messageId: 2 }));
    });
    it('does not offer report actions for expired or optimistic messages', () => {
        render(<ChatBubbleList mine="MEMBER" roomId={7} reportRole="MEMBER" messages={[
            { id: 2, senderRole: 'OWNER', content: '만료', expired: true },
            { id: -1, senderRole: 'OWNER', content: '대기', pending: true }]} />);
        expect(screen.queryByRole('button', { name: '메시지 관리' })).toBeNull();
    });
    it('shares one slot between the timestamp and an accessible menu', async () => {
        const view = render(<ChatBubbleList mine="MEMBER" roomId={7} onRetracted={vi.fn()} messages={[
            { id: 1, senderRole: 'MEMBER', content: '내 메시지', canRetract: true, createdAt: '2026-09-28T08:22:00' }]} />);
        const meta = view.container.querySelector('.reserve-chat-message-meta');
        expect(meta.querySelector('.reserve-chat-message-time')).toHaveTextContent('08:22');
        expect(meta.children).toHaveLength(2);
        fireEvent.click(screen.getByRole('button', { name: '메시지 관리' }));
        await waitFor(() => expect(meta).toHaveAttribute('data-menu-open', 'true'));
        expect(screen.getByRole('button', { name: '메시지 관리' })).toHaveAttribute('aria-expanded', 'true');
    });
});
