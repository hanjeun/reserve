import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import FormDatePicker from '../FormDatePicker';

vi.mock('antd', async () => {
    const ReactModule = await import('react');
    const Modal = ({ open, children, title }) => (
        open ? ReactModule.createElement(
            'div',
            { role: 'dialog', 'aria-label': title?.props?.children ?? title },
            title,
            children,
        ) : null
    );
    const Form = { Item: { useStatus: () => ({ status: undefined }) } };
    return { Form, Modal };
});

describe('FormDatePicker', () => {
    it('selects a date range in the shared one-month calendar', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const month = dayjs().month() + 1;

        render(<FormDatePicker.RangePicker onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /시작일.*종료일/ }));
        await user.click(screen.getByRole('button', { name: `${month}월 10일` }));
        await user.click(screen.getByRole('button', { name: `${month}월 15일` }));
        await user.click(screen.getByRole('button', { name: '선택 완료' }));

        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange.mock.calls[0][0].map(value => value.format('D'))).toEqual(['10', '15']);
    });

    it('normalizes a range when the end date is selected before the start date', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const month = dayjs().month() + 1;

        render(<FormDatePicker.RangePicker onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /시작일.*종료일/ }));
        await user.click(screen.getByRole('button', { name: `${month}월 15일` }));
        await user.click(screen.getByRole('button', { name: `${month}월 10일` }));
        await user.click(screen.getByRole('button', { name: '선택 완료' }));

        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange.mock.calls[0][0].map(value => value.format('D'))).toEqual(['10', '15']);
    });

    it('keeps multiple-date selection open until the user confirms it', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const month = dayjs().month() + 1;

        render(<FormDatePicker multiple onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: '날짜 선택' }));
        await user.click(screen.getByRole('button', { name: `${month}월 8일` }));
        await user.click(screen.getByRole('button', { name: `${month}월 18일` }));
        expect(onChange).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange.mock.calls[0][0].map(value => value.date())).toEqual([8, 18]);
    });
});
