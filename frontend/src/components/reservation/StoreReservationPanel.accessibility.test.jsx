import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Form } from 'antd';
import { ReservationPanel } from './StoreReservationPanel';
vi.mock('../store', async () => ({ BookingCalendar: (await import('../store/BookingCalendar')).default }));
vi.mock('../../hooks', () => ({ useBookingCalendar: () => ({ byDate: {}, loading: false, fetching: false, error: null }) }));
afterEach(cleanup);
function Panel() {
    const [form] = Form.useForm();
    return <ReservationPanel form={form} store={{ id: 12, name: '합성 가게', bookingType: 'SLOT' }} preview />;
}
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
