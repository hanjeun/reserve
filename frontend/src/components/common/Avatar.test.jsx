import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Avatar from './Avatar';

describe('shared account Avatar', () => {
    it('preserves the existing account image geometry and default image attributes', () => {
        const { container } = render(<Avatar src="https://example.test/profile.png" size={80} />);
        expect(container.firstElementChild).toHaveStyle({ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', position: 'relative' });
        const image = container.querySelector('img');
        expect(image).toHaveStyle({ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: '0' });
        expect(image).toHaveAttribute('alt', '프로필');
        expect(image).not.toHaveAttribute('draggable');
        expect(image).not.toHaveAttribute('referrerpolicy');
    });

    it('allows chat to retain its no-referrer/no-drag policy without a second image renderer', () => {
        const { container } = render(<Avatar src="https://example.test/profile.png" size={64} draggable={false} referrerPolicy="no-referrer" />);
        expect(container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
        expect(container.querySelector('img')).toHaveAttribute('draggable', 'false');
        expect(container.querySelector('img')).toHaveStyle({ objectFit: 'cover', position: 'absolute', inset: '0' });
    });

    it('uses the same fallback and recovers when the account photo changes', () => {
        const { container, rerender } = render(<Avatar src="https://example.test/failed.png" />);
        fireEvent.error(container.querySelector('img'));
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('.anticon-user')).toBeInTheDocument();
        rerender(<Avatar src="https://example.test/current.png" />);
        expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/current.png');
    });

    it('mounts an optional fallback only after a failed photo and resets it for a new source', () => {
        const fallback = <span data-testid="custom-avatar-fallback">대체 사진</span>;
        const { container, rerender } = render(<Avatar src="https://example.test/first.png" fallback={fallback} />);
        expect(container.querySelector('[data-testid="custom-avatar-fallback"]')).toBeNull();
        fireEvent.error(container.querySelector('img'));
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('[data-testid="custom-avatar-fallback"]')).toHaveTextContent('대체 사진');
        rerender(<Avatar src="https://example.test/current.png" fallback={fallback} />);
        expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/current.png');
        expect(container.querySelector('[data-testid="custom-avatar-fallback"]')).toBeNull();
    });

    it('lets the supplied resolver retain a frontend static image path', () => {
        const resolveSource = vi.fn(value => value);
        const { container } = render(<Avatar src="/icons/RESERVE_logo.png" resolveSource={resolveSource} />);
        expect(resolveSource).toHaveBeenCalledWith('/icons/RESERVE_logo.png', null);
        expect(container.querySelector('img')).toHaveAttribute('src', '/icons/RESERVE_logo.png');
    });

    it.each(['blob:https://reserve.it.kr/account-photo', 'data:image/png;base64,aGVsbG8='])('preserves the account default for %s', source => {
        const { container } = render(<Avatar src={source} />);
        expect(container.querySelector('img')).toHaveAttribute('src', source);
    });

    it.each(['blob:https://reserve.it.kr/private-photo', 'data:image/svg+xml,<svg/>'])('does not bypass a rejecting resolver for %s', source => {
        const resolveSource = vi.fn(() => null);
        const { container } = render(<Avatar src={source} resolveSource={resolveSource} />);
        expect(resolveSource).toHaveBeenCalledWith(source, null);
        expect(container.querySelector('img')).toBeNull();
    });
});
