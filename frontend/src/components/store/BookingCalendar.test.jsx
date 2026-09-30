import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Form } from 'antd';
import dayjs from 'dayjs';
import BookingCalendar from './BookingCalendar';

const state = vi.hoisted(() => ({ byDate: {}, loading: true, fetching: false, error: null, refetch: vi.fn() }));
vi.mock('../../hooks', () => ({ useBookingCalendar: () => state }));

describe('booking calendar loading boundary', () => {
    beforeEach(() => {
        Object.assign(state, { byDate: {}, loading: true, fetching: false, error: null });
    });
    it('keeps the trigger but never offers selectable dates while data is pending', () => {
        render(<Form><Form.Item name="date"><BookingCalendar storeId={12} /></Form.Item></Form>);
        fireEvent.click(screen.getByRole('button', { name: '날짜 선택' }));
        expect(screen.getByRole('status', { name: '예약 가능한 날짜를 불러오는 중' })).toHaveAttribute('aria-busy', 'true');
        expect(document.querySelector('button.reserve-cal-cell')).toBeNull();
        expect(screen.getByRole('button', { name: '다음 달' })).toBeInTheDocument();
    });

    it('silently disables out-of-period dates while retaining accessible reasons and closure labels', () => {
        const month = dayjs().startOf('month');
        const onChange = vi.fn();
        state.loading = false;
        ['PAST', 'TOO_FAR', 'CLOSED', 'OUT_OF_PERIOD', 'FULL', 'OPEN'].forEach((status, index) => {
            state.byDate[month.date(index + 1).format('YYYY-MM-DD')] = { status };
        });
        render(<Form initialValues={{ date: month }}><Form.Item name="date">
            <BookingCalendar storeId={12} onChange={onChange} />
        </Form.Item></Form>);
        fireEvent.click(document.querySelector('.reserve-cal-trigger'));
        const period = screen.getByRole('button', { name: `${month.format('M')}월 4일 예약 가능한 기간이 아닙니다` });
        expect(period).toBeDisabled();
        expect(period).toHaveTextContent(/^4$/);
        expect(screen.queryByText('기간 밖')).not.toBeInTheDocument();
        for (const [day, reason] of [[3, '휴무'], [5, '마감']]) {
            const cell = screen.getByRole('button', { name: `${month.format('M')}월 ${day}일 ${reason}` });
            expect(cell).toBeDisabled();
            expect(cell).toHaveTextContent(reason);
        }
        fireEvent.click(period);
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: `${month.format('M')}월 6일`, exact: true }));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].format('YYYY-MM-DD')).toBe(month.date(6).format('YYYY-MM-DD'));
    });
});
