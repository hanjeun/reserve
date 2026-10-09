import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import CopyableText from './CopyableText';

describe('CopyableText', () => {
    it('uses the same labeled copy control for a displayed value', () => {
        render(<CopyableText value="ORD-20260922-001" label="주문번호" />);

        expect(screen.getByText('ORD-20260922-001')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '주문번호 복사' })).toBeInTheDocument();
    });

    it('announces completion after the browser copy action', async () => {
        const user = userEvent.setup();
        render(<CopyableText value="ORD-20260922-001" label="주문번호" />);

        await user.click(screen.getByRole('button', { name: '주문번호 복사' }));

        expect(screen.getByRole('button', { name: '주문번호 복사됨' })).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('주문번호를 복사했어요.');
    });

    it('does not render a copy control for an absent value', () => {
        render(<CopyableText value="" fallback="없음" />);

        expect(screen.getByText('없음')).toBeInTheDocument();
        expect(screen.queryByRole('button')).toBeNull();
    });
});
