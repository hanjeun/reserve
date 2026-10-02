import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RefreshButton from './RefreshButton';
import MessengerListHeading from '../chat/MessengerListHeading';

describe('RefreshButton loading feedback', () => {
    it('keeps the same refresh arrow and spins it only during a request', () => {
        const onReload = vi.fn();
        const { container, rerender } = render(<RefreshButton onReload={onReload} loading={false} />);

        const arrow = container.querySelector('.anticon-sync');
        expect(arrow).toBeTruthy();
        expect(container.querySelector('.anticon-loading')).toBeNull();
        expect(screen.getByRole('button', { name: '새로고침' })).toBeEnabled();

        rerender(<RefreshButton onReload={onReload} loading />);

        expect(container.querySelector('.anticon-sync')).toBe(arrow);
        expect(arrow).toHaveClass('anticon-spin');
        expect(container.querySelector('.anticon-loading')).toBeNull();
        expect(screen.getByRole('button', { name: '새로고침' })).toBeDisabled();
    });
});

describe.each(['toolbar', 'messenger'])('shared refresh cooldown: %s', surface => {
    afterEach(() => { vi.useRealTimers(); });

    const renderRefresh = (onReload, loading = false) => surface === 'toolbar'
        ? <RefreshButton onReload={onReload} loading={loading} />
        : <MessengerListHeading onRefresh={onReload} refreshing={loading} />;
    const button = () => screen.getByRole('button', { name: surface === 'toolbar' ? '새로고침' : '대화 목록 새로고침' });

    it('blocks rapid clicks for three seconds without showing a pending request', () => {
        vi.useFakeTimers();
        const onReload = vi.fn();
        const { container } = render(renderRefresh(onReload));
        const refresh = button();
        act(() => { refresh.click(); refresh.click(); });
        expect(onReload).toHaveBeenCalledTimes(1);
        if (surface === 'messenger') expect(refresh).toHaveAttribute('aria-disabled', 'true');
        else expect(refresh).toBeDisabled();
        expect(container.querySelector('.anticon-sync')).not.toHaveClass('anticon-spin');
        expect(refresh).not.toHaveAttribute('aria-busy', 'true');
        act(() => vi.advanceTimersByTime(2999));
        fireEvent.click(refresh);
        expect(onReload).toHaveBeenCalledTimes(1);
        act(() => vi.advanceTimersByTime(1));
        fireEvent.click(refresh);
        expect(onReload).toHaveBeenCalledTimes(2);
    });

    it('keeps a slow request blocked after the click cooldown expires', () => {
        vi.useFakeTimers();
        const onReload = vi.fn();
        const { container, rerender } = render(renderRefresh(onReload));
        fireEvent.click(button());
        rerender(renderRefresh(onReload, true));
        act(() => vi.advanceTimersByTime(3000));
        fireEvent.click(button());
        expect(onReload).toHaveBeenCalledTimes(1);
        expect(container.querySelector('.anticon-sync')).toHaveClass('anticon-spin');
        if (surface === 'messenger') expect(button()).toHaveAttribute('aria-disabled', 'true');
        else expect(button()).toBeDisabled();
        rerender(renderRefresh(onReload));
        expect(container.querySelector('.anticon-sync')).not.toHaveClass('anticon-spin');
        if (surface === 'messenger') expect(button()).not.toHaveAttribute('aria-disabled', 'true');
        else expect(button()).toBeEnabled();
        fireEvent.click(button());
        expect(onReload).toHaveBeenCalledTimes(2);
    });

    it('clears the cooldown timer when the surface unmounts', () => {
        vi.useFakeTimers();
        const { unmount } = render(renderRefresh(vi.fn()));
        fireEvent.click(button());
        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
