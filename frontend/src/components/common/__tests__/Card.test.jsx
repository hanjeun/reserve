import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Card from '../Card';

vi.mock('antd', async () => {
    const ReactModule = await import('react');
    return {
        Card: ({
            children,
            onClick,
            onKeyDown,
            role,
            tabIndex,
            className,
        }) => ReactModule.createElement(
            'div',
            { onClick, onKeyDown, role, tabIndex, className },
            children,
        ),
    };
});

describe('Card', () => {
    it('gives click cards button semantics and keyboard activation', () => {
        const onClick = vi.fn();
        render(<Card onClick={onClick}>가게 보기</Card>);

        const card = screen.getByRole('button', { name: '가게 보기' });
        expect(card).toHaveAttribute('tabindex', '0');

        fireEvent.keyDown(card, { key: 'Enter' });
        fireEvent.keyDown(card, { key: ' ' });
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it('does not synthesize activation when the caller prevents the key event', () => {
        const onClick = vi.fn();
        render(
            <Card onClick={onClick} onKeyDown={(event) => event.preventDefault()}>
                가게 보기
            </Card>,
        );

        fireEvent.keyDown(screen.getByRole('button', { name: '가게 보기' }), { key: 'Enter' });
        expect(onClick).not.toHaveBeenCalled();
    });

    it('renders the add card as a native button', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Card.Add onClick={onClick}>새 가게 등록</Card.Add>);

        const button = screen.getByRole('button', { name: /새 가게 등록/ });
        expect(button).toHaveAttribute('type', 'button');
        expect(button).toHaveClass('reserve-card-add');
        await user.click(button);
        expect(onClick).toHaveBeenCalledOnce();
    });
});
