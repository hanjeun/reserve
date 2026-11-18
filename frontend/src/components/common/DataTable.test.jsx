import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DataTable, { PagedDataTable } from './DataTable';

const columns = [{ title: '결과', dataIndex: 'name', width: 100 }];
const firstRows = [{ id: 1, name: '첫 페이지 행' }];
const secondRows = [{ id: 2, name: '둘째 페이지 행' }];

it('preserves pagination and its focus while replacing the result with a placeholder', () => {
    const measureHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(240);
    const onChange = vi.fn();
    const pagination = { current: 1, total: 6, pageSize: 2, onChange };
    const { container, rerender } = render(<PagedDataTable rowKey="id" columns={columns} dataSource={firstRows} pagination={pagination} />);
    try {
        const pager = container.querySelector('.ant-pagination');
        const button = pager.querySelector('.ant-pagination-item-2');
        button.focus();
        fireEvent.click(button);
        expect(onChange).toHaveBeenCalledExactlyOnceWith(2, 2);

        const nextPage = { ...pagination, current: 2 };
        rerender(<PagedDataTable rowKey="id" columns={columns} dataSource={firstRows} pagination={nextPage} placeholder={<p>불러오는 중</p>} />);
        expect(container.querySelector('.ant-pagination')).toBe(pager);
        expect(button).toHaveFocus();
        expect(screen.queryByText('첫 페이지 행')).not.toBeInTheDocument();
        const results = screen.getByText('불러오는 중').parentElement;
        expect(results).toHaveAttribute('aria-busy', 'true');
        expect(results.style.getPropertyValue('--reserve-result-height')).toBe('240px');

        rerender(<PagedDataTable rowKey="id" columns={columns} dataSource={secondRows} pagination={nextPage} />);
        expect(container.querySelector('.ant-pagination')).toBe(pager);
        expect(button).toHaveFocus();
        expect(screen.getByText('둘째 페이지 행')).toBeInTheDocument();
        expect(results.style.getPropertyValue('--reserve-result-height')).toBe('');
    } finally {
        measureHeight.mockRestore();
    }
});

it('animates only the table within Ant Design pagination', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
        const pagination = { current: 1, total: 6, pageSize: 2 };
        const { container, rerender } = render(<DataTable rowKey="id" columns={columns} dataSource={firstRows} pagination={pagination} />);
        const pager = container.querySelector('.ant-pagination');
        rerender(<DataTable rowKey="id" columns={columns} dataSource={secondRows} pagination={{ ...pagination, current: 2 }} />);

        expect(animate.mock.contexts).toEqual([container.querySelector('.ant-table')]);
        expect(animate.mock.contexts[0]).not.toContainElement(pager);
    } finally {
        if (original) Object.defineProperty(HTMLElement.prototype, 'animate', original);
        else delete HTMLElement.prototype.animate;
    }
});
