import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form } from 'antd';
import { expect, it, vi } from 'vitest';
import FormDatePicker from '../FormDatePicker';
import FormTimePicker from '../FormTimePicker';
import { field } from '../../../styles/tokens';

it('supports standalone controls without a form-status warning or extra layout', () => {
    const errors = vi.spyOn(console, 'error');
    try {
        const { container } = render(<><FormDatePicker /><FormTimePicker /></>);
        expect(screen.getByRole('button', { name: '날짜 선택' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '시간 선택' })).toBeInTheDocument();
        expect(container.querySelector('.ant-form-item')).toBeNull();
        expect(errors.mock.calls.flat().some(value => String(value).includes('Form.Item.useStatus'))).toBe(false);
    } finally { errors.mockRestore(); }
});

it('inherits the actual parent field validation status through noStyle', async () => {
    render(<Form><Form.Item name="date" rules={[{ required: true }]}><FormDatePicker /></Form.Item>
        <Form.Item name="time" rules={[{ required: true }]}><FormTimePicker /></Form.Item>
        <button type="submit">확인</button></Form>);
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => {
        expect(screen.getByRole('button', { name: '날짜 선택' }).style.boxShadow).toBe(field.errorRing);
        expect(screen.getByRole('button', { name: '시간 선택' }).style.boxShadow).toBe(field.errorRing);
    });
});
