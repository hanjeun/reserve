import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EyeOutlined } from '@ant-design/icons';
import Button from '../Button';

describe('Button', () => {
    it('uses the shared focus class and forwards a click', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();

        render(<Button onClick={onClick}>예약하기</Button>);

        const button = screen.getByRole('button', { name: '예약하기' });
        expect(button).toHaveClass('reserve-btn', 'reserve-btn--primary');
        await user.click(button);
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('keeps its accessible name while loading and blocks clicks', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();

        render(<Button loading onClick={onClick}>등록 중…</Button>);

        const button = screen.getByRole('button', { name: '등록 중…' });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
        expect(button.querySelector('svg.reserve-arc-spinner')).toHaveAttribute('viewBox', '0 0 50 50');
        await user.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it('keeps a labeled icon decorative in the button name', () => {
        render(<Button icon={<EyeOutlined />}>상세보기</Button>);
        expect(screen.getByRole('button', { name: '상세보기' })).toBeInTheDocument();
    });
});
