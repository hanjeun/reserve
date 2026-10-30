import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '@sentry/react';
import { replayIntegration } from '@sentry/replay';
import { scheduleSessionReplay } from '../sessionReplay';

vi.mock('@sentry/react', () => ({ getClient: vi.fn() }));
vi.mock('@sentry/replay', () => ({ replayIntegration: vi.fn(() => ({ name: 'Replay' })) }));

const browser = (readyState = 'loading') => ({
    document: { readyState },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestIdleCallback: vi.fn(() => 7),
    cancelIdleCallback: vi.fn(),
    setTimeout: vi.fn(() => 8),
    clearTimeout: vi.fn(),
});

describe('deferred private session replay', () => {
    let client;
    beforeEach(() => {
        vi.stubEnv('PROD', true);
        vi.stubEnv('VITE_SENTRY_DSN', 'test-dsn');
        client = { getIntegrationByName: vi.fn(() => null), addIntegration: vi.fn() };
        getClient.mockReturnValue(client);
    });
    afterEach(() => vi.unstubAllEnvs());

    it('waits for page load and idle time while retaining text and media masking', async () => {
        const win = browser();
        scheduleSessionReplay(win);
        expect(win.requestIdleCallback).not.toHaveBeenCalled();
        expect(client.addIntegration).not.toHaveBeenCalled();
        win.addEventListener.mock.calls[0][1]();
        await win.requestIdleCallback.mock.calls[0][0]();
        expect(replayIntegration).toHaveBeenCalledWith({
            maskAllText: true, blockAllMedia: true, networkCaptureBodies: false,
            beforeAddRecordingEvent: expect.any(Function),
        });
        expect(client.addIntegration).toHaveBeenCalledWith({ name: 'Replay' });
    });

    it('does not initialize replay in development or without a configured destination', () => {
        const win = browser();
        vi.stubEnv('PROD', false);
        scheduleSessionReplay(win);
        vi.stubEnv('PROD', true);
        vi.stubEnv('VITE_SENTRY_DSN', '');
        scheduleSessionReplay(win);
        expect(win.addEventListener).not.toHaveBeenCalled();
        expect(win.requestIdleCallback).not.toHaveBeenCalled();
    });

    it('cancels a scheduled load and avoids duplicate replay registrations', async () => {
        const win = browser('complete');
        const cancel = scheduleSessionReplay(win);
        const load = win.requestIdleCallback.mock.calls[0][0];
        cancel();
        await load();
        expect(win.cancelIdleCallback).toHaveBeenCalledWith(7);
        expect(client.addIntegration).not.toHaveBeenCalled();
        client.getIntegrationByName.mockReturnValue({ name: 'Replay' });
        scheduleSessionReplay(win);
        await win.requestIdleCallback.mock.calls[1][0]();
        expect(client.addIntegration).not.toHaveBeenCalled();
    });

    it('never attaches a downloaded integration to a replaced client', async () => {
        const win = browser('complete');
        scheduleSessionReplay(win);
        const pending = win.requestIdleCallback.mock.calls[0][0]();
        getClient.mockReturnValue(null);
        await pending;
        expect(client.addIntegration).not.toHaveBeenCalled();
    });
});
