import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QrCodeModal from './QrCodeModal';
import reservationService from '../../services/reservationService';

vi.mock('../../services/reservationService', () => ({
    default: { getQrToken: vi.fn() },
}));

vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }) => <div aria-label="QR 코드">{value}</div>,
}));

const renderModal = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <QrCodeModal reservationId={51} open onClose={vi.fn()} />
        </QueryClientProvider>,
    );
};

describe('QrCodeModal lookup failure', () => {
    beforeEach(() => {
        reservationService.getQrToken.mockReset();
    });

    it('keeps the modal open and retries the QR lookup in place', async () => {
        reservationService.getQrToken
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({ token: 'fresh-token' });
        renderModal();

        expect(await screen.findByRole('alert')).toHaveTextContent('QR 코드를 불러오지 못했어요.');
        expect(screen.getByRole('dialog', { name: '방문 체크인 QR' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        await waitFor(() => expect(reservationService.getQrToken).toHaveBeenCalledTimes(2));
        expect(await screen.findByLabelText('QR 코드')).toHaveTextContent('fresh-token');
    });
});
