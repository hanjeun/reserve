import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Form } from 'antd';
import { ReservationPanel } from './StoreReservationPanel';
vi.mock('../store', async () => ({ BookingCalendar: (await import('../store/BookingCalendar')).default }));
vi.mock('../../hooks', () => ({ useBookingCalendar: () => ({ byDate: {}, loading: false, fetching: false, error: null }) }));
afterEach(cleanup);
function Panel({ isPC = false }) {
    const [form] = Form.useForm();
    return <ReservationPanel form={form} store={{ id: 12, name: '합성 가게', bookingType: 'SLOT' }} isPC={isPC} preview />;
}
it.each([false, true])('PC만 입력 영역과 제출 영역을 분리하고 모바일 DOM은 유지해요 (%s)', isPC => {
    const { container } = render(<Panel isPC={isPC} />);
    const button = screen.getByRole('button', { name: '예약 신청하기' });
    expect(container.querySelector('.reserve-booking-panel--desktop') != null).toBe(isPC);
    if (isPC) {
        const fields = screen.getByRole('region', { name: '예약 입력 영역' });
        expect(fields).toHaveAttribute('tabindex', '0');
        expect(fields).not.toContainElement(button);
        expect(button.closest('.reserve-booking-panel-submit')).toBeInTheDocument();
    } else expect(screen.queryByRole('region', { name: '예약 입력 영역' })).toBeNull();
});
it('links native booking controls and labels custom time and guest groups without dangling for attributes', () => {
    const { container } = render(<Panel />);
    expect(screen.getByLabelText('예약 날짜').tagName).toBe('BUTTON');
    expect(screen.getByRole('group', { name: '예약 시간' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '인원 수' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인원 늘리기' })).toBeDisabled();
    for (const label of container.querySelectorAll('label[for]')) {
        const control = document.getElementById(label.htmlFor);
        expect(control).not.toBeNull();
        expect(['INPUT','TEXTAREA','SELECT','BUTTON','OUTPUT']).toContain(control.tagName);
    }
});
