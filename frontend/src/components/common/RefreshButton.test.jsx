import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RefreshButton from './RefreshButton';

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
