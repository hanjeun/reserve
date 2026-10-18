import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import StoreInfoSection from './StoreInfoSection';

const paid = { noShowDeposit: 3000, allowLatePayment: false, paymentTimeoutMinutes: 60, fullRefundDays: 3, partialRefundDays: 1, partialRefundRate: 50 };

it('shows the actual expiry policy for immediate paid reservations', () => {
    render(<StoreInfoSection store={paid} />);
    expect(screen.getByText('3,000원 (신청할 때 결제)')).toBeInTheDocument();
    expect(screen.getByText('결제 마감')).toBeInTheDocument();
    expect(screen.getByText('예약 신청 후 1시간 이내 미결제 대기 예약 자동 취소')).toBeInTheDocument();
});

it('does not promise unpaid expiry when the paid store allows late payment', () => {
    render(<StoreInfoSection store={{ ...paid, allowLatePayment: true }} />);
    expect(screen.getByText('3,000원 (예약 후 결제 가능)')).toBeInTheDocument();
    expect(screen.getByText('나중 결제 허용 · 미결제 자동 취소 없음')).toBeInTheDocument();
    expect(screen.queryByText(/1시간 이내/)).not.toBeInTheDocument();
});

it('preserves an unlimited timeout and uses 30 minutes only for an absent timeout', () => {
    const { rerender } = render(<StoreInfoSection store={{ ...paid, paymentTimeoutMinutes: 0 }} />);
    expect(screen.getByText('결제 시간 제한 없음 · 미결제 자동 취소 없음')).toBeInTheDocument();
    expect(screen.queryByText('예약 신청 후 30분 이내 미결제 대기 예약 자동 취소')).not.toBeInTheDocument();
    rerender(<StoreInfoSection store={{ ...paid, paymentTimeoutMinutes: null }} />);
    expect(screen.getByText('예약 신청 후 30분 이내 미결제 대기 예약 자동 취소')).toBeInTheDocument();
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
