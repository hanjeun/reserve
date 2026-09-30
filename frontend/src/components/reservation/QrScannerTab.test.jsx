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
            return scannerState.start() ?? Promise.resolve();
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
        scannerState.start.mockReset();
        scannerState.onSuccess = null;
        reservationService.checkInByQr.mockResolvedValue({
            reservation: { memberName: '한재은' },
            alreadyCheckedIn: false,
        });
    });

    it('uses the same default button spinner as submit buttons while mock camera startup is pending', async () => {
        let startCamera;
        const pending = new Promise(resolve => { startCamera = resolve; });
        scannerState.start.mockReturnValueOnce(pending);
        const client = new QueryClient();
        const { container, unmount } = render(<QueryClientProvider client={client}><AntApp>
            <QrScannerTab sheet onClose={vi.fn()} />
        </AntApp></QueryClientProvider>);
        expect(container.querySelector('.reserve-qr-scanner').firstElementChild).toHaveStyle({ background: 'transparent', borderRadius: '0' });
        const start = await screen.findByRole('button', { name: 'QR 스캔 시작' }, { timeout: 1200 });
        expect(container.querySelector('.reserve-qr-scanner').firstElementChild).toHaveStyle({ background: 'transparent', borderRadius: '0' });
        fireEvent.click(start);
        await waitFor(() => expect(scannerState.start).toHaveBeenCalledTimes(1));
        expect(start).toBeDisabled();
        expect(start).toHaveAttribute('aria-busy', 'true');
        expect(start.querySelector('.reserve-btn-spin')).toBeInTheDocument();
        expect(start.querySelector('.reserve-btn-loading-icon, .anticon-reload')).toBeNull();
        await act(async () => { startCamera(); await pending; });
        expect(screen.getByRole('button', { name: '스캔 중지' })).toBeEnabled();
        const statusRow = screen.getByText('스캔 대기 중…').parentElement;
        expect(statusRow.style.backgroundColor).toBe('');
        expect(statusRow.style.borderRadius).toBe('');
        expect(reservationService.checkInByQr).not.toHaveBeenCalled();
        unmount();
        client.clear();
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
