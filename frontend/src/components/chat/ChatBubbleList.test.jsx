import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import ChatBubbleList from './ChatBubbleList';

vi.mock('./ChatImage', () => ({ default: () => <img alt="대화에 첨부한 사진" /> }));
vi.mock('./ChatMessageActions', () => ({ default: ({ message, onHidden }) => onHidden && (
    <span className="reserve-chat-message-meta">
        <button type="button" className="reserve-chat-message-actions" aria-expanded="false"
            onClick={() => onHidden({ id: message.id, hidden: true })}>메시지 관리</button>
    </span>
) }));

it('places a photo caption in its own block above the image', () => {
    render(<ChatBubbleList mine="MEMBER" roomId={1} messages={[
        { id: 1, senderRole: 'MEMBER', imageUrl: '/api/chat/images/1', content: '릴리스 검증용' },
    ]} />);
    const caption = screen.getByText('릴리스 검증용');
    const image = screen.getByAltText('대화에 첨부한 사진');
    const captionBubble = caption.closest('.reserve-chat-message-bubble');
    const imageSurface = image.closest('.reserve-chat-image-message');
    expect(captionBubble.nextElementSibling).toBe(imageSurface.parentElement);
    expect(image.closest('.reserve-chat-message-bubble')).toBeNull();
});

it('groups captions and photos from the same send while keeping each photo addressable', () => {
    const batch = 'photos_aea7ba5c-9e78-45a8-b2f8-3933c774bc54_';
    const time = '2026-11-17T10:00:00';
    const { container } = render(<ChatBubbleList mine="MEMBER" roomId={1} messages={[
        { id: 21, senderRole: 'MEMBER', imageUrl: '/api/chat/images/21', content: '두 장을 보냈어요.', clientMessageId: batch + '0', createdAt: time },
        { id: 22, senderRole: 'MEMBER', imageUrl: '/api/chat/images/22', content: '', clientMessageId: batch + '1', createdAt: time },
        { id: 23, senderRole: 'MEMBER', imageUrl: '/api/chat/images/23', content: '', clientMessageId: 'independent-photo', createdAt: time },
    ]} />);
    const groups = container.querySelectorAll('.reserve-chat-photo-group');
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelectorAll('.reserve-chat-image-message')).toHaveLength(2);
    expect(groups[0].querySelector('[data-message-id="22"]')).toBeInTheDocument();
    expect(groups[1].querySelectorAll('.reserve-chat-image-message')).toHaveLength(1);
});

it('preserves the layout of text-only messages', () => {
    render(<ChatBubbleList mine="MEMBER" roomId={1} messages={[
        { id: 1, senderRole: 'MEMBER', content: '일반 메시지' },
    ]} />);
    expect(screen.getByText('일반 메시지')).not.toHaveAttribute('style');
});

it('does not render personal-deletion text, photos or action slots', () => {
    const view = render(<ChatBubbleList mine="MEMBER" roomId={1} messages={[
        { id: 1, senderRole: 'OWNER', hidden: true, content: '낡은 캐시 원문', imageUrl: '/api/chat/images/1' },
        { id: 2, senderRole: 'OWNER', content: '계속 보이는 답변' },
    ]} />);
    expect(screen.queryByText('낡은 캐시 원문')).toBeNull();
    expect(screen.queryByAltText('대화에 첨부한 사진')).toBeNull();
    expect(view.container.querySelectorAll('.reserve-chat-message-row')).toHaveLength(1);
    expect(screen.getByText('계속 보이는 답변')).toBeInTheDocument();
});

it('keeps one outgoing entry through acknowledgement and skips motion for history and incoming messages', () => {
    const history = [{ id: 1, senderRole: 'MEMBER', content: '이전 메시지' }];
    const message = { id: -1, senderRole: 'MEMBER', content: '방금 보낸 메시지', pending: true, localSendId: 'local-send' };
    const bubbleFor = content => screen.getByText(content).closest('.reserve-chat-bubble-group');
    const view = render(<ChatBubbleList mine="MEMBER" roomId={1} messages={[...history, message]} />);
    const outgoing = bubbleFor(message.content);
    expect(outgoing).toHaveClass('reserve-chat-bubble-group--sent');
    expect(bubbleFor(history[0].content)).not.toHaveClass('reserve-chat-bubble-group--sent');

    const incoming = { id: 2, senderRole: 'OWNER', content: '상대 메시지' };
    const confirmed = { ...message, id: 3, pending: false };
    view.rerender(<ChatBubbleList mine="MEMBER" roomId={1} messages={[...history, incoming, confirmed]} />);
    expect(bubbleFor(message.content)).toBe(outgoing);
    expect(outgoing.closest('.reserve-chat-message-row')).toHaveAttribute('data-message-id', '3');
    expect(bubbleFor(incoming.content)).not.toHaveClass('reserve-chat-bubble-group--sent');
});

it('opens text actions with a mouse and collapses only the blank space after the last message is hidden', async () => {
    function Thread() {
        const [message, setMessage] = useState({ id: 12, senderRole: 'MEMBER', content: '삭제할 말풍선' });
        return <ChatBubbleList mine="MEMBER" roomId={1} emptyText="메시지가 없어요." messages={[message]}
            onHidden={update => setMessage({ ...message, ...update })} />;
    }
    const { container } = render(<Thread />);
    const text = screen.getByText('삭제할 말풍선');
    vi.spyOn(text.closest('.reserve-chat-message-row'), 'getBoundingClientRect').mockReturnValue({ height: 46 });
    const mouse = new MouseEvent('click', { bubbles: true, button: 0, detail: 1 });
    Object.defineProperty(mouse, 'pointerType', { value: 'mouse' });
    fireEvent(text, mouse);
    expect(screen.queryByText('삭제할 말풍선')).not.toBeInTheDocument();
    const exit = container.querySelector('.reserve-chat-message-exit');
    expect(exit).toHaveAttribute('aria-hidden', 'true');
    expect(exit).toBeEmptyDOMElement();
    expect(exit).toHaveStyle({ height: '46px' });
    expect(screen.queryByText('메시지가 없어요.')).not.toBeInTheDocument();
    expect(await screen.findByText('메시지가 없어요.')).toBeInTheDocument();
});
