import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
