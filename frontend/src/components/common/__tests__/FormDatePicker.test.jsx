import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import FormDatePicker from '../FormDatePicker';
import holidayService from '../../../services/holidayService';

vi.mock('../../../services/holidayService', () => ({
    default: { getMonth: vi.fn(() => Promise.resolve(['2026-12-25'])) },
}));

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
    it('paints public holidays red only when the caller opts in', async () => {
        const user = userEvent.setup();
        const { unmount } = render(<FormDatePicker value={dayjs('2026-12-01')} />);
        await user.click(screen.getByRole('button', { name: '2026-12-01' }));
        expect(screen.getByRole('button', { name: '12월 25일' })).not.toHaveClass('is-holiday');
        expect(holidayService.getMonth).not.toHaveBeenCalled();
        unmount();

        render(<FormDatePicker value={dayjs('2026-12-01')} highlightHolidays />);
        await user.click(screen.getByRole('button', { name: '2026-12-01' }));
        expect(await screen.findByRole('button', { name: '12월 25일 공휴일' })).toHaveClass('is-holiday');
        expect(holidayService.getMonth).toHaveBeenCalledWith('2026-12');
        expect(screen.getByRole('button', { name: '12월 24일' })).not.toHaveClass('is-holiday');
    });

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

    it('disables earlier end dates while keeping the start date editable', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const month = dayjs().month() + 1;

        render(<FormDatePicker.RangePicker onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /시작일.*종료일/ }));
        await user.click(screen.getByRole('button', { name: `${month}월 15일` }));
        const earlierEnd = screen.getByRole('button', { name: `${month}월 10일 선택 불가` });
        expect(earlierEnd).toBeDisabled();
        await user.click(earlierEnd);
        expect(screen.getByRole('button', { name: '선택 완료' })).toBeDisabled();
        expect(onChange).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: `${month}월 15일 선택됨` }));
        expect(screen.getByRole('button', { name: '선택 완료' })).toBeEnabled();
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^시작일/ }));
        expect(screen.getByRole('button', { name: `${month}월 10일` })).toBeEnabled();
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

    it.each(['2028-02-29', '2028.02.29', '2028/02/29', '20280229', '2028. 2. 29.'])(
        'previews a complete typed leap date in format %s and discards cancellation', async text => {
            const user = userEvent.setup();
            const onChange = vi.fn();
            render(<FormDatePicker value={dayjs('2026-10-08')} onChange={onChange} />);
            await user.click(screen.getByRole('button', { name: '2026-10-08' }));
            const input = screen.getByRole('textbox', { name: '날짜 직접 입력' });
            await user.clear(input);
            await user.type(input, text);
            expect(input).toHaveValue(text);
            expect(screen.getByText('2028년 2월')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '2월 29일 선택됨' })).toHaveClass('is-selected');
            expect(screen.getByRole('button', { name: '선택 완료' })).toBeEnabled();
            expect(onChange).not.toHaveBeenCalled();
            await user.click(screen.getByRole('button', { name: '취소' }));
            expect(onChange).not.toHaveBeenCalled();
            await user.click(screen.getByRole('button', { name: '2026-10-08' }));
            expect(screen.getByRole('textbox', { name: '날짜 직접 입력' })).toHaveValue('2026-10-08');
        },
    );

    it.each(['20270229', '2026-02-30', '2026-13-01', '0000-01-01', '10000-01-01', '2026-10-081', '202610081', '2026-10/08'])(
        'keeps impossible or overflowing input %s without correcting or committing it', async text => {
            const user = userEvent.setup();
            const onChange = vi.fn();
            render(<FormDatePicker value={dayjs('2026-10-08')} onChange={onChange} />);
            await user.click(screen.getByRole('button', { name: '2026-10-08' }));
            const input = screen.getByRole('textbox', { name: '날짜 직접 입력' });
            fireEvent.change(input, { target: { value: text } });
            expect(input).toHaveValue(text);
            expect(input).toHaveAttribute('aria-invalid', 'true');
            expect(screen.getByText('2026년 10월')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: '선택 완료' })).toBeDisabled();
            fireEvent.keyDown(input, { key: 'Enter' });
            expect(onChange).not.toHaveBeenCalled();
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        },
    );

    it('moves to typed range dates, paints their range and preserves raw reversed dates until corrected', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormDatePicker.RangePicker value={[dayjs('2026-10-10'), dayjs('2026-10-20')]} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /2026-10-10.*2026-10-20/ }));
        const start = screen.getByRole('textbox', { name: '시작일 직접 입력' });
        const end = screen.getByRole('textbox', { name: '종료일 직접 입력' });
        await user.clear(start);
        await user.type(start, '20271110');
        expect(screen.getByText('2027년 11월')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '11월 10일 선택됨' })).toHaveClass('is-selected');
        expect(end).toHaveValue('2026-10-20');
        expect(end).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('button', { name: '선택 완료' })).toBeDisabled();
        await user.clear(end);
        await user.type(end, '2027/11/09');
        expect(end).toHaveValue('2027/11/09');
        expect(screen.getByRole('button', { name: '11월 9일 선택 불가' })).not.toHaveClass('is-selected');
        expect(screen.getByRole('button', { name: '선택 완료' })).toBeDisabled();
        await user.clear(end);
        await user.type(end, '2027/11/15');
        expect(screen.getByRole('button', { name: '11월 15일 선택됨' })).toHaveClass('is-selected');
        expect(screen.getByRole('button', { name: '11월 12일 선택 범위' })).toHaveClass('is-range');
        expect(onChange).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange.mock.calls[0][0].map(date => date.format('YYYY-MM-DD'))).toEqual(['2027-11-10', '2027-11-15']);
    });

    it.each([
        ['past', '2026-10-07', date => date.isBefore(dayjs('2026-10-08'), 'day')],
        ['future', '2026-10-09', date => date.isAfter(dayjs('2026-10-08'), 'day')],
    ])('applies the caller restriction for a typed %s date', async (_boundary, text, disabledDate) => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormDatePicker value={dayjs('2026-10-08')} disabledDate={disabledDate} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: '2026-10-08' }));
        const input = screen.getByRole('textbox', { name: '날짜 직접 입력' });
        await user.clear(input);
        await user.type(input, text);
        expect(input).toHaveValue(text);
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('button', { name: '선택 완료' })).toBeDisabled();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).not.toHaveBeenCalled();
    });

    it.each([
        [[true, true], 0], [[false, true], 0], [[true, false], 1],
    ])('preserves optional range ends for allowEmpty %j', async (allowEmpty, part) => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormDatePicker.RangePicker allowEmpty={allowEmpty} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: /시작일.*종료일/ }));
        const input = screen.getByRole('textbox', { name: part === 0 ? '시작일 직접 입력' : '종료일 직접 입력' });
        await user.type(input, '2026');
        expect(screen.getByRole('button', { name: '선택 완료' })).toBeDisabled();
        await user.type(input, '1008');
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange.mock.calls[0][0].map(date => date?.format('YYYY-MM-DD') ?? null))
            .toEqual(part === 0 ? ['2026-10-08', null] : [null, '2026-10-08']);
    });

    it('does not commit IME composition or bubble Enter and confirms the latest consecutive input values', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const outerKeyDown = vi.fn();
        render(<div onKeyDown={outerKeyDown}>
            <FormDatePicker.RangePicker value={[dayjs('2026-10-10'), dayjs('2026-10-20')]} onChange={onChange} />
        </div>);
        await user.click(screen.getByRole('button', { name: /2026-10-10.*2026-10-20/ }));
        const start = screen.getByRole('textbox', { name: '시작일 직접 입력' });
        const end = screen.getByRole('textbox', { name: '종료일 직접 입력' });
        fireEvent.compositionStart(start);
        fireEvent.change(start, { target: { value: '2026-10-15' } });
        fireEvent.keyDown(start, { key: 'Enter', keyCode: 229, isComposing: true });
        expect(screen.getByRole('button', { name: '10월 15일' })).not.toHaveClass('is-selected');
        expect(screen.getByRole('button', { name: '선택 완료' })).toBeDisabled();
        expect(onChange).not.toHaveBeenCalled();
        expect(outerKeyDown).not.toHaveBeenCalled();
        fireEvent.compositionEnd(start, { data: '2026-10-15' });
        expect(screen.getByRole('button', { name: '10월 15일 선택됨' })).toHaveClass('is-selected');
        act(() => {
            fireEvent.change(start, { target: { value: '20261110' } });
            fireEvent.change(end, { target: { value: '20261120' } });
            fireEvent.keyDown(end, { key: 'Enter' });
        });
        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange.mock.calls[0][0].map(date => date.format('YYYY-MM-DD'))).toEqual(['2026-11-10', '2026-11-20']);
        expect(outerKeyDown).not.toHaveBeenCalled();
    });

    it('replaces the unconfirmed multiple-date candidate without accumulating each edit and adds unique dates', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormDatePicker multiple value={[dayjs('2026-10-01')]} onChange={onChange} />);
        await user.click(screen.getByRole('button', { name: '2026-10-01' }));
        const input = screen.getByRole('textbox', { name: '추가할 날짜 직접 입력' });
        await user.type(input, '20270108');
        fireEvent.change(input, { target: { value: '20270109' } });
        expect(screen.getByRole('button', { name: '1월 8일' })).not.toHaveClass('is-selected');
        expect(screen.getByRole('button', { name: '1월 9일 선택됨' })).toHaveClass('is-selected');
        await user.keyboard('{Enter}');
        expect(input).toHaveValue('');
        await user.type(input, '2027/01/09');
        await user.keyboard('{Enter}');
        await user.type(input, '20270110');
        await user.click(screen.getByRole('button', { name: '1월 11일' }));
        expect(onChange).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: '선택 완료' }));
        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange.mock.calls[0][0].map(date => date.format('YYYY-MM-DD')))
            .toEqual(['2026-10-01', '2027-01-09', '2027-01-10', '2027-01-11']);
    });

    it('keeps form error descriptions and label focus on the native inputs without reopening the modal', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<FormDatePicker.RangePicker aria-invalid="true" aria-describedby="period-error" onChange={onChange} />);
        const trigger = screen.getByRole('button', { name: /시작일.*종료일/ });
        expect(trigger).toHaveAttribute('aria-describedby', 'period-error');
        await user.click(trigger);
        const start = screen.getByRole('textbox', { name: '시작일 직접 입력' });
        await user.click(start);
        expect(start).toHaveFocus();
        expect(start).toHaveAttribute('aria-invalid', 'true');
        expect(start.getAttribute('aria-describedby')).toContain('period-error');
        await user.type(start, '20261008');
        expect(start).toHaveFocus();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });
});
