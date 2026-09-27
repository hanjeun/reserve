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
    expect(caption).toHaveStyle({ display: 'block', marginTop: '8px' });
    expect(caption.previousElementSibling).toBe(screen.getByAltText('대화에 첨부한 사진'));
});

it('preserves the layout of text-only messages', () => {
    render(<ChatBubbleList mine="MEMBER" roomId={1} messages={[
        { id: 1, senderRole: 'MEMBER', content: '일반 메시지' },
    ]} />);
    expect(screen.getByText('일반 메시지')).not.toHaveAttribute('style');
});
