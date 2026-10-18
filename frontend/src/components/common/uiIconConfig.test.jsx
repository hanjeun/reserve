import { fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider, Tag } from 'antd';
import { describe, expect, it, vi } from 'vitest';
import { CloseOutlined } from './icons';
import { uiIconConfig } from './uiIconConfig';

describe('status tag dismissal policy', () => {
    it('keeps status tags visible without a dismissal action', () => {
        const { container, rerender } = render(<ConfigProvider {...uiIconConfig}>
            <Tag>취소됨</Tag><Tag>만료됨</Tag>
        </ConfigProvider>);
        expect(screen.getByText('취소됨')).toBeVisible();
        expect(screen.getByText('만료됨')).toBeVisible();
        expect(container.querySelector('.ant-tag-close-icon')).toBeNull();
        rerender(<ConfigProvider {...uiIconConfig}><Tag>취소됨</Tag><Tag>만료됨</Tag></ConfigProvider>);
        expect(screen.getByText('취소됨')).toBeVisible();
    });

    it('retains explicit closable tags and their keyboard dismissal', () => {
        const onClose = vi.fn();
        const { container } = render(<ConfigProvider {...uiIconConfig}><Tag closable onClose={onClose}>선택한 조건</Tag></ConfigProvider>);
        const close = container.querySelector('.ant-tag-close-icon');
        expect(close).toHaveAttribute('role', 'button');
        expect(close).toHaveAttribute('tabindex', '0');
        fireEvent.keyDown(close, { key: 'Enter' });
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.getByText('선택한 조건')).not.toBeVisible();
    });

    it('honors explicit nonclosable tags even with a custom close icon', () => {
        const { container } = render(<ConfigProvider {...uiIconConfig}>
            <Tag closable={false} closeIcon={<CloseOutlined />}>처리 완료</Tag>
        </ConfigProvider>);
        expect(container.querySelector('.ant-tag-close-icon')).toBeNull();
        expect(screen.getByText('처리 완료')).toBeVisible();
    });
});
