import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import StoreInfoSection from './StoreInfoSection';

const paid = { noShowDeposit: 3000, allowLatePayment: false, paymentTimeoutMinutes: 60, fullRefundDays: 3, partialRefundDays: 1, partialRefundRate: 50 };

it('describes immediate payment without showing an inactive late-payment deadline', () => {
    render(<StoreInfoSection store={paid} />);
    expect(screen.getByText('3,000원 (신청할 때 결제)')).toBeInTheDocument();
    expect(screen.queryByText('결제 마감')).not.toBeInTheDocument();
});

it('shows a payment deadline only when the paid store allows late payment', () => {
    render(<StoreInfoSection store={{ ...paid, allowLatePayment: true }} />);
    expect(screen.getByText('3,000원 (예약 후 결제 가능)')).toBeInTheDocument();
    expect(screen.getByText('예약 후 1시간 이내 미결제 시 자동 취소')).toBeInTheDocument();
});

it('does not expose stale payment and refund options on a free or waiting-only store', () => {
    const { rerender } = render(<StoreInfoSection store={{ ...paid, noShowDeposit: 0, allowLatePayment: true }} />);
    for (const label of ['노쇼 예약금', '결제 마감', '환불 정책']) expect(screen.queryByText(label)).not.toBeInTheDocument();
    rerender(<StoreInfoSection store={{ ...paid, reservationEnabled: false, openTime: '09:00', closeTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00' }} />);
    expect(screen.getByText('09:00 ~ 18:00')).toBeInTheDocument();
    expect(screen.queryByText(/브레이크/)).not.toBeInTheDocument();
    expect(screen.queryByText('노쇼 예약금')).not.toBeInTheDocument();
});

it('does not promise an inactive partial-refund interval or a refund when full refunds are disabled', () => {
    const { rerender } = render(<StoreInfoSection store={{ ...paid, fullRefundDays: 1, partialRefundDays: 1 }} />);
    expect(screen.queryByText(/50% 환불/)).not.toBeInTheDocument();
    rerender(<StoreInfoSection store={{ ...paid, fullRefundDays: 0 }} />);
    expect(screen.queryByText('환불 정책')).not.toBeInTheDocument();
});
