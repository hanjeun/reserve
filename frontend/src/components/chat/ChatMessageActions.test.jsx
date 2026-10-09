import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatBubbleList from './ChatBubbleList';
import ChatMessageActions from './ChatMessageActions';
import { downloadChatImage } from '../../utils/chatImageTransfer';
import { chatService } from '../../services';
import messageService from '../../services/chatService';

const feedback = vi.hoisted(() => ({ confirm: vi.fn(), success: vi.fn(), error: vi.fn() }));

vi.mock('../../hooks', () => ({ useMessage: () => ({ message: { success: feedback.success, error: feedback.error }, confirm: feedback.confirm }) }));
vi.mock('../../services', () => ({ chatService: { reportConversation: vi.fn() } }));
vi.mock('../../services/chatService', () => ({ default: { hideMessage: vi.fn(), retract: vi.fn() } }));
vi.mock('../../utils/chatImageTransfer', () => ({ downloadChatImage: vi.fn(), getChatImageBlob: vi.fn() }));
describe('message-scoped actions', () => {
    beforeEach(() => {
        feedback.confirm.mockReset(); feedback.success.mockReset(); feedback.error.mockReset();
        messageService.hideMessage.mockReset(); messageService.retract.mockReset();
        chatService.reportConversation.mockResolvedValue({ id: 1 });
        downloadChatImage.mockReset().mockResolvedValue(undefined);
    });
    it('offers personal deletion for an incoming message and confirms its scope before a guarded single write', async () => {
        const onHidden = vi.fn();
        let complete;
        messageService.hideMessage.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        render(<ChatMessageActions roomId={7} reportRole="MEMBER" onHidden={onHidden}
            message={{ id: 2, senderRole: 'OWNER', content: '상대 메시지' }} />);
        fireEvent.click(screen.getByRole('button', { name: '메시지 관리' }));
        fireEvent.click(await screen.findByText('나에게만 삭제'));
        const confirmation = feedback.confirm.mock.calls[0][0];
        expect(confirmation.content).toContain('상대방 대화와 신고·분쟁 검토 원본은 유지');
        let first;
        act(() => { first = confirmation.onOk(); });
        await act(async () => { await confirmation.onOk(); });
        expect(messageService.hideMessage).toHaveBeenCalledExactlyOnceWith(7, 2, { signal: expect.any(AbortSignal) });
        await act(async () => { complete({ id: 2, hidden: true }); await first; });
        expect(onHidden).toHaveBeenCalledExactlyOnceWith({ id: 2, hidden: true });
        expect(feedback.success).toHaveBeenCalledWith('나에게만 삭제했어요.');
    });

    it('does not write an old confirmation or apply an in-flight response after leaving its message', async () => {
        const onHidden = vi.fn();
        let finish;
        messageService.hideMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const view = render(<ChatMessageActions roomId={7} onHidden={onHidden} message={{ id: 2, senderRole: 'OWNER' }} />);
        fireEvent.click(screen.getByRole('button', { name: '메시지 관리' }));
        fireEvent.click(await screen.findByText('나에게만 삭제'));
        const confirmation = feedback.confirm.mock.calls[0][0];
        let request;
        act(() => { request = confirmation.onOk(); });
        const signal = messageService.hideMessage.mock.calls[0][2].signal;
        view.unmount();
        expect(signal.aborted).toBe(true);
        await act(async () => { finish({ id: 2, hidden: true }); await request; await confirmation.onOk(); });
        expect(messageService.hideMessage).toHaveBeenCalledTimes(1);
        expect(onHidden).not.toHaveBeenCalled();
        expect(feedback.success).not.toHaveBeenCalled();
    });
    it('places own actions before the bubble and reports a retracted opponent by stable ID', async () => {
        const view = render(<ChatBubbleList mine="MEMBER" roomId={7} reportRole="MEMBER" onRetracted={vi.fn()}
            messages={[{ id: 1, senderRole: 'MEMBER', content: '내 메시지', canRetract: true },
                { id: 2, senderRole: 'OWNER', content: '전송이 취소된 메시지예요.', retracted: true }]} />);
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
        render(<>
            <ChatMessageActions roomId={7} reportRole="MEMBER" message={{ id: 2, expired: true, imageUrl: '/api/chat/images/2' }} />
            <ChatMessageActions roomId={7} reportRole="MEMBER" message={{ id: -1, pending: true, imageUrl: '/api/chat/images/3' }} />
            <ChatMessageActions roomId={7} message={{ id: 4, retracted: true, imageUrl: '/api/chat/images/4' }} />
        </>);
        expect(screen.queryByRole('button', { name: '메시지 관리' })).toBeNull();
    });
    it('offers a saved photo download and invalidates it when history marks the photo retracted', async () => {
        let finishDownload;
        downloadChatImage.mockImplementation(() => new Promise(resolve => { finishDownload = resolve; }));
        const view = render(<ChatMessageActions roomId={7} message={{ id: 33, imageUrl: '/api/chat/images/33', imageOriginalFilename: '가게 사진.png' }} />);
        fireEvent.click(screen.getByRole('button', { name: '메시지 관리' }));
        fireEvent.click(await screen.findByText('다운로드'));
        await waitFor(() => expect(downloadChatImage).toHaveBeenCalledTimes(1));
        const [url, signal, isCurrent, filename] = downloadChatImage.mock.calls[0];
        expect(url).toBe('/api/chat/images/33');
        expect(filename).toBe('가게 사진.png');
        expect(signal.aborted).toBe(false);
        expect(isCurrent()).toBe(true);
        view.rerender(<ChatMessageActions roomId={7} message={{ id: 33, imageUrl: '/api/chat/images/33', retracted: true }} />);
        expect(signal.aborted).toBe(true);
        expect(isCurrent()).toBe(false);
        expect(screen.queryByRole('button', { name: '메시지 관리' })).toBeNull();
        await act(async () => { finishDownload(); });
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
