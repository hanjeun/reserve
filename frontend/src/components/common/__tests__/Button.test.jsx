import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EyeOutlined } from '../icons';
import Button from '../Button';
import { colors } from '../../../styles/tokens';

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

    it('중립 텍스트만 푸터 상태를 공유하고 강조색·아이콘·채움 버튼은 유지한다', () => {
        render(<>
            <Button variant="ghost">취소</Button>
            <Button variant="ghost-sm" style={{ color: colors.text.tertiary }}>초기화</Button>
            <Button variant="ghost-sm-primary">수정</Button>
            <Button variant="ghost-sm-danger">삭제</Button>
            <Button variant="ghost-sm-success">완료</Button>
            <Button variant="ghost-sm" style={{ color: '#fa8c16' }}>정지</Button>
            <Button variant="secondary">닫기</Button>
            <Button variant="ghost-sm" icon={<EyeOutlined />} aria-label="보기" />
        </>);
        for (const name of ['취소', '초기화']) {
            const action = screen.getByRole('button', { name, exact: true });
            expect(action).toHaveClass('reserve-text-link');
            expect(action.style.color).toBe('');
            expect(action.style.transition).toBe('');
        }
        for (const name of ['수정', '삭제', '완료', '정지', '닫기', '보기']) {
            expect(screen.getByRole('button', { name, exact: true })).not.toHaveClass('reserve-text-link');
        }
        expect(screen.getByRole('button', { name: '정지', exact: true })).toHaveStyle({ color: '#fa8c16' });
        expect(screen.getByRole('button', { name: '보기', exact: true })).toHaveClass('reserve-btn--icon-only');
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
        const page = render(<form onSubmit={onSubmit}><Button variant="ghost-sm" htmlType="submit" unavailableReason={reason} onUnavailable={feedback.info} onClick={onClick}>설정</Button></form>);
        const button = screen.getByRole('button', { name: '설정' });
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button.matches('button.reserve-text-link:enabled:not([aria-disabled="true"])')).toBe(false);
        expect(button).toHaveAccessibleDescription(reason);
        await user.click(button);
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
        expect(feedback.info).toHaveBeenCalledTimes(3);
        expect(feedback.info).toHaveBeenLastCalledWith(reason);
        expect(onClick).not.toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();
        page.rerender(<form onSubmit={onSubmit}><Button variant="ghost-sm" htmlType="submit" onClick={onClick}>설정</Button></form>);
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
