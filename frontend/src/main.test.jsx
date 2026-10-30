import { describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
    init: vi.fn(),
    browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
    browserSessionIntegration: vi.fn(() => ({ name: 'BrowserSession' })),
}));
vi.mock('@sentry/react', () => sentry);
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: vi.fn() }) }));
vi.mock('./App.jsx', () => ({ default: () => null }));
vi.mock('./index.css', () => ({}));
vi.mock('./hooks/useTheme', () => ({ initTheme: vi.fn() }));
vi.mock('./utils/chunkReload', () => ({ installChunkReloadHandler: vi.fn() }));
vi.mock('./utils/sessionReplay', () => ({ scheduleSessionReplay: () => vi.fn() }));

describe('Sentry 11 production collection boundary', () => {
    it('keeps SDK defaults from enabling personal, body or model data collection', async () => {
        vi.stubEnv('PROD', true);
        vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.invalid/1');
        try {
            await import('./main.jsx');
            const options = sentry.init.mock.calls[0][0];
            expect(options.enabled).toBe(true);
            expect(options.dataCollection).toEqual({
                userInfo: false,
                cookies: false,
                httpHeaders: false,
                httpBodies: [],
                urlQueryParams: false,
                genAI: { inputs: false, outputs: false },
                databaseQueryData: false,
                queues: false,
                graphQL: { document: false, variables: false },
            });
            expect(options).not.toHaveProperty('sendDefaultPii');
            expect(options).toMatchObject({
                tracesSampleRate: 0.1,
                replaysSessionSampleRate: 0.1,
                replaysOnErrorSampleRate: 1,
                attachStacktrace: false,
                traceLifecycle: 'static',
            });
            expect(sentry.browserTracingIntegration).toHaveBeenCalledWith({
                webVitals: { softNavigations: false, bfcacheNavigations: false },
            });
            expect(sentry.browserSessionIntegration).toHaveBeenCalledWith({ lifecycle: 'route' });
        } finally {
            vi.unstubAllEnvs();
        }
    });
});
