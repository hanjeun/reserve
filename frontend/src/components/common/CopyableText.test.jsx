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

    it('copies the full order number when the last character stays with the inline button', async () => {
        const user = userEvent.setup();
        const orderNumber = 'ORD' + '1234567890'.repeat(3) + 'abcdefg';
        render(<CopyableText value={orderNumber} label="주문번호" wrap />);

        await user.click(screen.getByRole('button', { name: '주문번호 복사' }));

        expect(await navigator.clipboard.readText()).toBe(orderNumber);
        expect(screen.getByRole('status')).toHaveTextContent('주문번호를 복사했어요.');
    });
});
