import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Form } from 'antd';
import BookingCalendar from './BookingCalendar';

const state = vi.hoisted(() => ({ byDate: {}, loading: true, fetching: false, error: null, refetch: vi.fn() }));
vi.mock('../../hooks', () => ({ useBookingCalendar: () => state }));

describe('booking calendar loading boundary', () => {
    it('keeps the trigger but never offers selectable dates while data is pending', () => {
        render(<Form><Form.Item name="date"><BookingCalendar storeId={12} /></Form.Item></Form>);
        fireEvent.click(screen.getByRole('button', { name: '날짜 선택' }));
        expect(screen.getByRole('status', { name: '예약 가능한 날짜를 불러오는 중' })).toHaveAttribute('aria-busy', 'true');
        expect(document.querySelector('button.reserve-cal-cell')).toBeNull();
        expect(screen.getByRole('button', { name: '다음 달' })).toBeInTheDocument();
    });
});
