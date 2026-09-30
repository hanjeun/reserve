import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OfflineBanner from './OfflineBanner';

vi.mock('@ant-design/icons', () => ({ WifiOutlined: () => null }));

describe('network banner transitions', () => {
    let online;
    beforeEach(() => {
        vi.useFakeTimers();
        online = true;
        vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    const changeNetwork = next => act(() => {
        online = next;
        window.dispatchEvent(new Event(next ? 'online' : 'offline'));
    });

    it('does not announce recovery on an initial online load', () => {
        render(<OfflineBanner />);
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('announces a recovery for 2.5 seconds, including an initial offline load', () => {
        online = false;
        render(<OfflineBanner />);
        expect(screen.getByRole('status')).toHaveTextContent('인터넷 연결이 끊겼습니다');
        changeNetwork(true);
        expect(screen.getByRole('status')).toHaveTextContent('인터넷에 다시 연결되었습니다');
        act(() => vi.advanceTimersByTime(2499));
        expect(screen.getByRole('status')).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1));
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('cancels the old dismissal when the connection drops and recovers again', () => {
        render(<OfflineBanner />);
        changeNetwork(false);
        changeNetwork(true);
        act(() => vi.advanceTimersByTime(2000));
        changeNetwork(false);
        changeNetwork(true);
        act(() => vi.advanceTimersByTime(500));
        expect(screen.getByRole('status')).toHaveTextContent('다시 연결되었습니다');
        act(() => vi.advanceTimersByTime(2000));
        expect(screen.queryByRole('status')).toBeNull();
    });
});
