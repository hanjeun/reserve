import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import PaymentReceiptLookup from './PaymentReceiptLookup';

const lookupReceipt = vi.hoisted(() => vi.fn());
vi.mock('../../services/paymentService', () => ({ default: { lookupReceipt } }));

it('uses the order and inquiry ID for lookup and clears the old link when the inquiry changes', async () => {
    lookupReceipt.mockResolvedValue({ type: 'reservation', merchantUid: 'ORD-TEST', receiptUrl: 'https://receipts.example.test/view' });
    const queryClient = new QueryClient();
    render(<QueryClientProvider client={queryClient}><PaymentReceiptLookup /></QueryClientProvider>);

    fireEvent.change(screen.getByRole('textbox', { name: '주문번호' }), { target: { value: 'ORD-TEST' } });
    const inquiry = screen.getByRole('textbox', { name: '문의 번호' });
    fireEvent.change(inquiry, { target: { value: '15' } });
    const submit = screen.getByRole('button', { name: '조회하기' });
    expect(submit).toHaveClass('reserve-btn--primary');
    expect(submit).toHaveStyle({ width: '100%' });
    fireEvent.click(submit);

    const result = await screen.findByRole('region', { name: '영수증 조회 결과' });
    expect(within(result).getByRole('link', { name: '영수증 보기' })).toHaveAttribute('href', 'https://receipts.example.test/view');
    expect(lookupReceipt).toHaveBeenCalledExactlyOnceWith({ type: 'reservation', merchantUid: 'ORD-TEST', inquiryId: 15 });
    expect(within(result).getByRole('button', { name: '고객 확인 링크 복사' })).toBeInTheDocument();
    fireEvent.change(inquiry, { target: { value: '16' } });
    await waitFor(() => expect(screen.queryByRole('link', { name: '영수증 보기' })).not.toBeInTheDocument());
});
