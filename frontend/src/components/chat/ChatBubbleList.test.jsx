import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ChatBubbleList from './ChatBubbleList';

vi.mock('./ChatImage', () => ({ default: () => <img alt="대화에 첨부한 사진" /> }));
vi.mock('./ChatMessageActions', () => ({ default: () => null }));

it('places a photo caption in its own block below the image', () => {
    render(<ChatBubbleList mine="MEMBER" roomId={1} messages={[
        { id: 1, senderRole: 'MEMBER', imageUrl: '/api/chat/images/1', content: '릴리스 검증용' },
    ]} />);
    const caption = screen.getByText('릴리스 검증용');
    const image = screen.getByAltText('대화에 첨부한 사진');
    const captionBubble = caption.closest('.reserve-chat-message-bubble');
    const imageSurface = image.closest('.reserve-chat-image-message');
    expect(captionBubble.previousElementSibling).toBe(imageSurface);
    expect(imageSurface.parentElement).toBe(captionBubble.parentElement);
    expect(image.closest('.reserve-chat-message-bubble')).toBeNull();
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
