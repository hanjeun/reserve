import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import RetryButton from './RetryButton';
import { heights, radius } from '../../styles/tokens';

it('keeps the small pill and the same arrow while one returned request is pending', async () => {
    let resolve;
    const onRetry = vi.fn(() => new Promise(done => { resolve = done; }));
    const { container } = render(<RetryButton onRetry={onRetry} />);
    const button = screen.getByRole('button', { name: '다시 불러오기' });
    const arrow = container.querySelector('.anticon-sync');
    expect(button).toHaveClass('reserve-btn--ghost', 'reserve-retry-button');
    expect(button).toHaveStyle({ height: heights.buttonSm, borderRadius: radius.pill });
    act(() => { button.click(); button.click(); });
    expect(onRetry).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.anticon-sync')).toBe(arrow);
    expect(arrow).toHaveClass('anticon-spin');
    await act(async () => resolve());
    expect(button).toBeEnabled();
    expect(arrow).not.toHaveClass('anticon-spin');
    expect(onRetry).toHaveBeenCalledOnce();
});

it('uses external loading for state-triggered retries and does not invent a delay or another request', () => {
    const onRetry = vi.fn();
    const view = loading => <RetryButton onRetry={onRetry} loading={loading} variant="outline">다시 시도</RetryButton>;
    const { container, rerender } = render(view(false));
    const button = screen.getByRole('button', { name: '다시 시도' });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledOnce();
    expect(button).toBeEnabled();
    rerender(view(true));
    expect(button).toHaveClass('reserve-btn--outline');
    expect(button).toBeDisabled();
    expect(container.querySelector('.anticon-sync')).toHaveClass('anticon-spin');
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(view(false));
    expect(button).toBeEnabled();
    expect(container.querySelector('.anticon-sync')).not.toHaveClass('anticon-spin');
});

it('releases a rejected request for another explicit click without automatically retrying', async () => {
    let reject;
    const onRetry = vi.fn(() => new Promise((_resolve, fail) => { reject = fail; }));
    render(<RetryButton onRetry={onRetry} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    await act(async () => reject(new Error('offline')));
    expect(button).toBeEnabled();
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(2);
    await act(async () => reject(new Error('offline')));
});

it('leaves a removed error state removed when its old request finishes', async () => {
    let resolve;
    const onRetry = vi.fn(() => new Promise(done => { resolve = done; }));
    const view = render(<RetryButton onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button'));
    view.unmount();
    await act(async () => resolve());
    expect(screen.queryByRole('button')).toBeNull();
    expect(onRetry).toHaveBeenCalledOnce();
});

it('keeps explicit disabled and absent handlers from starting a request', () => {
    const onRetry = vi.fn();
    const view = render(<RetryButton onRetry={onRetry} disabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(onRetry).not.toHaveBeenCalled();
    view.rerender(<RetryButton />);
    expect(screen.queryByRole('button')).toBeNull();
});
