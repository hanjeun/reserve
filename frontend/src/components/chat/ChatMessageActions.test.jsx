import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatBubbleList from './ChatBubbleList';
import ChatMessageActions from './ChatMessageActions';
import { downloadChatImage } from '../../utils/chatImageTransfer';
import { requestChatImageBlob } from '../../utils/chatImageRequests';
import { chatService } from '../../services';
import messageService from '../../services/chatService';
import useAuthStore from '../../store/useAuthStore';

const feedback = vi.hoisted(() => ({ confirm: vi.fn(), success: vi.fn(), error: vi.fn(), preview: vi.fn() }));

vi.mock('./ChatImage', () => ({ default: () => <button type="button" onClick={feedback.preview}>사진 크게 보기</button> }));

const touchPoint = { identifier: 1, clientX: 40, clientY: 100 };
function touch(target, type, at, touches, changedTouches = []) {
    const event = createEvent[type](target, { touches, changedTouches });
    Object.defineProperty(event, 'timeStamp', { value: at });
    return fireEvent(target, event);
}

vi.mock('../../hooks', () => ({ useMessage: () => ({ message: { success: feedback.success, error: feedback.error }, confirm: feedback.confirm }) }));
vi.mock('../../services', () => ({ chatService: { reportConversation: vi.fn() } }));
vi.mock('../../services/chatService', () => ({ default: { hideMessage: vi.fn(), retract: vi.fn() } }));
vi.mock('../../utils/chatImageTransfer', () => ({ downloadChatImage: vi.fn(), getChatImageBlob: vi.fn() }));
vi.mock('../../utils/chatImageRequests', () => ({ requestChatImageBlob: vi.fn() }));
describe('message-scoped actions', () => {
    beforeEach(() => {
        feedback.confirm.mockReset(); feedback.success.mockReset(); feedback.error.mockReset();
        feedback.preview.mockReset();
        messageService.hideMessage.mockReset(); messageService.retract.mockReset();
        chatService.reportConversation.mockResolvedValue({ id: 1 });
        downloadChatImage.mockReset().mockResolvedValue(undefined);
        requestChatImageBlob.mockReset();
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
        const image = new Blob(['photo'], { type: 'image/png' });
        requestChatImageBlob.mockResolvedValue(image);
        const revision = useAuthStore.getState().sessionRevision;
        const view = render(<ChatMessageActions roomId={7} message={{ id: 33, imageUrl: '/api/chat/images/33', imageOriginalFilename: '가게 사진.png' }} />);
        fireEvent.click(screen.getByRole('button', { name: '메시지 관리' }));
        fireEvent.click(await screen.findByText('다운로드'));
        await waitFor(() => expect(downloadChatImage).toHaveBeenCalledTimes(1));
        const [url, signal, isCurrent, filename, read] = downloadChatImage.mock.calls[0];
        expect(downloadChatImage).toHaveBeenCalledExactlyOnceWith('/api/chat/images/33',
            signal, isCurrent, '가게 사진.png', expect.any(Function));
        expect(url).toBe('/api/chat/images/33');
        expect(filename).toBe('가게 사진.png');
        expect(signal.aborted).toBe(false);
        expect(isCurrent()).toBe(true);
        await expect(read(url, signal, isCurrent)).resolves.toBe(image);
        expect(requestChatImageBlob).toHaveBeenCalledExactlyOnceWith(url, signal, isCurrent, `${revision}:7`);
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

    it('opens the existing photo menu after a hold and keeps a short tap for photo preview', async () => {
        render(<ChatBubbleList mine="MEMBER" roomId={7} onRetracted={vi.fn()} messages={[
            { id: 33, senderRole: 'MEMBER', canRetract: true, imageUrl: '/api/chat/images/33' },
        ]} />);
        const photo = screen.getByRole('button', { name: '사진 크게 보기' });
        const menuButton = screen.getByRole('button', { name: '메시지 관리' });
        touch(photo, 'touchStart', 100, [touchPoint]);
        expect(touch(photo, 'touchEnd', 170, [], [touchPoint])).toBe(true);
        fireEvent.click(photo, { detail: 1 });
        expect(feedback.preview).toHaveBeenCalledTimes(1);
        expect(menuButton).toHaveAttribute('aria-expanded', 'false');

        touch(photo, 'touchStart', 200, [touchPoint]);
        expect(fireEvent.contextMenu(photo)).toBe(false);
        expect(touch(photo, 'touchEnd', 730, [], [touchPoint])).toBe(false);
        const downloadItem = await screen.findByRole('menuitem', { name: /다운로드/ });
        expect(menuButton).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(photo, { detail: 1 });
        expect(feedback.preview).toHaveBeenCalledTimes(1);
        fireEvent.click(downloadItem);
        expect(downloadChatImage).toHaveBeenCalledExactlyOnceWith('/api/chat/images/33',
            expect.any(AbortSignal), expect.any(Function), undefined, expect.any(Function));
    });

    it.each(['move', 'scroll', 'cancel', 'second touch'])('ignores a hold interrupted by %s', interruption => {
        const view = render(<div className="reserve-messenger-thread-body">
            <ChatBubbleList mine="MEMBER" roomId={7} onRetracted={vi.fn()}
                messages={[{ id: 2, senderRole: 'OWNER', content: '테스트 메시지' }]} />
        </div>);
        const bubble = screen.getByText('테스트 메시지');
        touch(bubble, 'touchStart', 100, [touchPoint]);
        if (interruption === 'move') touch(bubble, 'touchMove', 250, [{ ...touchPoint, clientY: 140 }]);
        if (interruption === 'scroll') fireEvent.scroll(view.container.firstElementChild);
        if (interruption === 'cancel') touch(bubble, 'touchCancel', 300, [], [touchPoint]);
        if (interruption === 'second touch') touch(document.body, 'touchStart', 320, [touchPoint, { ...touchPoint, identifier: 2 }]);
        expect(touch(bubble, 'touchEnd', 750, [], [touchPoint])).toBe(true);
        expect(screen.getByRole('button', { name: '메시지 관리' })).toHaveAttribute('aria-expanded', 'false');
    });
});
