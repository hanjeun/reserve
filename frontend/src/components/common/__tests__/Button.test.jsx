import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EyeOutlined } from '../icons';
import Button from '../Button';

const feedback = vi.hoisted(() => ({ info: vi.fn() }));

describe('Button', () => {
    beforeEach(() => vi.clearAllMocks());
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

    it('explains an unavailable action by pointer and keyboard without calling it or submitting its form', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        const onSubmit = vi.fn(event => event.preventDefault());
        const reason = '먼저 이메일 인증 코드를 받아주세요.';
        const page = render(<form onSubmit={onSubmit}><Button htmlType="submit" unavailableReason={reason} onUnavailable={feedback.info} onClick={onClick}>설정</Button></form>);
        const button = screen.getByRole('button', { name: '설정' });
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).toHaveAccessibleDescription(reason);
        await user.click(button);
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
        expect(feedback.info).toHaveBeenCalledTimes(3);
        expect(feedback.info).toHaveBeenLastCalledWith(reason);
        expect(onClick).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
        page.rerender(<form onSubmit={onSubmit}><Button htmlType="submit" onClick={onClick}>설정</Button></form>);
        expect(button).not.toHaveAttribute('aria-disabled');
        expect(button).not.toHaveAttribute('aria-describedby');
        await user.click(button);
        expect(onClick).toHaveBeenCalledOnce();
        expect(onSubmit).toHaveBeenCalledOnce();
    });

    it.each([{ disabled: true }, { loading: true }])('keeps actual busy or disabled actions locked even when a prerequisite reason exists: %j', async locked => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Button {...locked} unavailableReason="먼저 확인해주세요." onUnavailable={feedback.info} onClick={onClick}>설정</Button>);
        const button = screen.getByRole('button', { name: '설정' });
        expect(button).toBeDisabled();
        await user.click(button);
        expect(feedback.info).not.toHaveBeenCalled();
        expect(onClick).not.toHaveBeenCalled();
    });
});
