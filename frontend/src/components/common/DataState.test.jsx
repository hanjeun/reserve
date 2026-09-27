import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DataState from './DataState';

describe('DataState', () => {
    it('uses a neutral store icon for a genuine empty result without inventing a retry action', () => {
        const { container } = render(<DataState state="empty" kind="store" title="등록된 가게가 없습니다." />);

        expect(screen.getByText('등록된 가게가 없습니다.')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(container.querySelector('.anticon-shop')).toBeTruthy();
    });

    it('maps a recoverable offline failure to one accessible neutral state and retry', () => {
        const retry = vi.fn();
        const { container } = render(<DataState state="error" kind="reservation" subject="예약 목록"
            error={new Error('서버에 연결할 수 없어요.')} onRetry={retry} compact />);

        expect(screen.getByRole('alert')).toHaveTextContent('예약 목록을 불러오지 못했습니다');
        expect(container.querySelector('.anticon-cloud-server')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(retry).toHaveBeenCalledOnce();
    });

    it('uses a lock icon for a permission failure without exposing a server message', () => {
        const { container } = render(<DataState state="error" subject="회원 목록"
            error={{ status: 403, message: 'private permission trace' }} />);

        expect(screen.getByRole('alert')).toHaveTextContent('권한');
        expect(screen.queryByText('private permission trace')).not.toBeInTheDocument();
        expect(container.querySelector('.anticon-lock')).toBeTruthy();
    });

    it('keeps the refresh arrow and rotates it while a retry request is in flight', () => {
        const { container } = render(<DataState state="error" subject="가게 목록"
            error={new Error('서버에 연결할 수 없어요.')} onRetry={vi.fn()} retrying />);

        expect(container.querySelector('.anticon-sync.anticon-spin')).toBeTruthy();
        expect(container.querySelector('.reserve-btn-spin')).toBeNull();
    });
});
