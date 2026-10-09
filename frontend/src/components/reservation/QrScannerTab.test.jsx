import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QrScannerTab from './QrScannerTab';
import reservationService from '../../services/reservationService';
import { cameraFailurePresentation } from './qrCameraPresentation';

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
        const original = navigator;
        vi.stubGlobal('navigator', new Proxy(original, { get: (target, property) => property === 'mediaDevices'
            ? { getUserMedia: vi.fn() } : Reflect.get(target, property, target) }));
        vi.clearAllMocks();
        scannerState.start.mockReset();
        scannerState.onSuccess = null;
        reservationService.checkInByQr.mockResolvedValue({
            reservation: { memberName: '한재은' },
            alreadyCheckedIn: false,
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    it.each([
        [{ name: 'NotAllowedError' }, 'camera-denied'],
        ['Error getting userMedia, error = NotAllowedError: Permission denied', 'camera-denied'],
        [{ name: 'NotFoundError' }, 'camera-unavailable'],
        [{ name: 'NotReadableError' }, 'camera-unavailable'],
    ])('distinguishes a camera failure from a bad QR payload', (error, icon) => {
        expect(cameraFailurePresentation(error).icon).toBe(icon);
    });

    it('shows the unsupported browser state without attempting camera startup', async () => {
        vi.stubGlobal('navigator', new Proxy(navigator, { get: (target, property) => property === 'mediaDevices'
            ? undefined : Reflect.get(target, property, target) }));
        const client = new QueryClient();
        const { container, unmount } = render(<QueryClientProvider client={client}><AntApp><QrScannerTab sheet /></AntApp></QueryClientProvider>);
        fireEvent.click(await screen.findByRole('button', { name: 'QR 스캔 시작' }));
        await screen.findByText(/이 브라우저에서는 카메라 스캔을 사용할 수 없어요/);
        expect(scannerState.start).not.toHaveBeenCalled();
        expect(container.querySelector('img[src*="browser-unsupported"]')).toBeInTheDocument();
        unmount(); client.clear();
    });

    it('recovers from permission denial and stops the restarted camera when leaving the screen', async () => {
        scannerState.start.mockRejectedValueOnce('Error getting userMedia, error = NotAllowedError: Permission denied');
        const client = new QueryClient();
        const { container, unmount } = render(<QueryClientProvider client={client}><AntApp><QrScannerTab sheet /></AntApp></QueryClientProvider>);
        fireEvent.click(await screen.findByRole('button', { name: 'QR 스캔 시작' }));
        await screen.findByText(/카메라 권한이 거부됐어요/);
        expect(container.querySelector('img[src*="camera-denied"]')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
        await screen.findByRole('button', { name: '스캔 중지' });
        expect(scannerState.start).toHaveBeenCalledTimes(2);
        unmount();
        await waitFor(() => expect(scannerState.stop).toHaveBeenCalled());
        expect(reservationService.checkInByQr).not.toHaveBeenCalled();
        client.clear();
    });

    it('uses the same default button spinner as submit buttons while mock camera startup is pending', async () => {
        let startCamera;
        const pending = new Promise(resolve => { startCamera = resolve; });
        scannerState.start.mockReturnValueOnce(pending);
        const client = new QueryClient();
        const { container, unmount } = render(<QueryClientProvider client={client}><AntApp>
            <QrScannerTab sheet onClose={vi.fn()} />
        </AntApp></QueryClientProvider>);
        expect(container.querySelector('.reserve-qr-scanner > div')).toHaveStyle({ background: 'transparent', borderRadius: '0' });
        const start = await screen.findByRole('button', { name: 'QR 스캔 시작' }, { timeout: 1200 });
        expect(container.querySelector('.reserve-qr-scanner > div')).toHaveStyle({ background: 'transparent', borderRadius: '0' });
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

    it('keeps actions at the bottom and shows only the server-confirmed scan result', async () => {
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
        const result = container.querySelector('.reserve-qr-result');
        expect(result).toHaveAttribute('data-result-state', 'success');
        expect(result).toHaveTextContent('예약 체크인이 완료됐어요.');
        expect(result).not.toHaveTextContent('signed-qr-payload');
    });
});
