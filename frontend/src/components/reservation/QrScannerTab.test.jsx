import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QrScannerTab from './QrScannerTab';
import reservationService from '../../services/reservationService';

const scannerState = vi.hoisted(() => ({
    onSuccess: null,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
}));

vi.mock('html5-qrcode', () => ({
    Html5Qrcode: class Html5Qrcode {
        start(_camera, _config, onSuccess) {
            scannerState.onSuccess = onSuccess;
            scannerState.start();
            return Promise.resolve();
        }

        stop() {
            scannerState.stop();
            return Promise.resolve();
        }

        pause() {
            scannerState.pause();
        }

        resume() {
            scannerState.resume();
        }
    },
}));

vi.mock('../../services/reservationService', () => ({
    default: { checkInByQr: vi.fn() },
}));

describe('QrScannerTab sheet surface', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        scannerState.onSuccess = null;
        reservationService.checkInByQr.mockResolvedValue({
            reservation: { memberName: '한재은' },
            alreadyCheckedIn: false,
        });
    });

    it('keeps actions at the bottom and reports a scan only through the message layer', async () => {
        const onClose = vi.fn();
        // 체크인이 성공하면 예약 캐시를 무효화한다(invalidateAfterWrite.js) — 그 호출을 감시한다.
        const queryClient = new QueryClient();
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        const { container } = render(
            <QueryClientProvider client={queryClient}>
                <AntApp>
                    <QrScannerTab sheet onClose={onClose} />
                </AntApp>
            </QueryClientProvider>,
        );

        expect(await screen.findByRole('button', { name: 'QR 스캔 시작' }, { timeout: 1200 })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '닫기' }));
        expect(onClose).toHaveBeenCalledOnce();

        fireEvent.click(screen.getByRole('button', { name: 'QR 스캔 시작' }));
        await waitFor(() => expect(scannerState.start).toHaveBeenCalledOnce());
        expect(screen.getByRole('button', { name: '스캔 중지' })).toBeInTheDocument();

        await act(async () => {
            await scannerState.onSuccess('signed-qr-payload');
        });

        expect(reservationService.checkInByQr).toHaveBeenCalledWith('signed-qr-payload');
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reservations'] });
        expect(container.querySelector('.reserve-qr-scanner')).not.toHaveTextContent('체크인 완료');
        expect(container.querySelector('[class*="result"]')).toBeNull();
    });
});
