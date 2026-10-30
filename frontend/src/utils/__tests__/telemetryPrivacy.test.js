import { describe, expect, it } from 'vitest';
import { BrowserClient, defaultStackParser } from '@sentry/react';
import { createTelemetryPrivacy } from '../telemetryPrivacy';

const privateUrl = 'https://reserve.it.kr/store/42?keyword=synthetic-name#waiting-token=synthetic-token';

describe('telemetry URL privacy', () => {
    it('removes payment app tokens from deep-link errors and breadcrumbs', () => {
        const privacy = createTelemetryPrivacy(() => 'https://reserve.it.kr/');
        const result = privacy.beforeSend({
            message: 'Failed to launch kb-acp://pay?token=synthetic-card-token#synthetic-fragment',
            breadcrumbs: [{ data: { url: 'supertoss://pay?payToken=synthetic-payment-token' } }],
        });
        expect(result.message).toBe('Failed to launch kb-acp://pay');
        expect(result.breadcrumbs[0].data.url).toBe('supertoss://pay');
        expect(JSON.stringify(result)).not.toContain('synthetic-');
    });

    it('removes query and fragment data from errors, nested spans and breadcrumbs without changing the source', () => {
        const privacy = createTelemetryPrivacy(() => privateUrl);
        const event = {
            request: { url: privateUrl, query_string: 'keyword=synthetic-name' },
            exception: { values: [{ value: `Failed to fetch ${privateUrl}`, stacktrace: { frames: [{ filename: privateUrl }] } }] },
            breadcrumbs: [{ category: 'navigation', data: { from: '/?q=synthetic-name', to: privateUrl } }],
            spans: [{ description: `GET ${privateUrl}`, data: {
                'url.full': privateUrl, 'url.query': 'keyword=synthetic-name', 'url.fragment': 'waiting-token=synthetic-token',
            } }],
        };
        const result = privacy.beforeSend(event);
        expect(result.request.url).toBe('https://reserve.it.kr/store/42');
        expect(result.spans[0].description).toBe('GET https://reserve.it.kr/store/42');
        expect(result.breadcrumbs[0].data.from).toBe('/');
        expect(JSON.stringify(result)).not.toContain('synthetic-');
        expect(event.request.url).toBe(privateUrl);
    });

    it('drops the whole Replay envelope when its raw metadata could contain a private URL', () => {
        let pageUrl = 'https://reserve.it.kr/';
        const privacy = createTelemetryPrivacy(() => pageUrl);
        const replay = { type: 'replay_event', urls: ['https://reserve.it.kr/'] };
        expect(privacy.integration.processEvent(replay)).toEqual(replay);
        pageUrl = privateUrl;
        expect(privacy.integration.processEvent(replay)).toBeNull();
        pageUrl = 'https://reserve.it.kr/';
        expect(privacy.integration.processEvent(replay)).toBeNull();
        expect(privacy.beforeSend({ message: 'Failure' })).toEqual({ message: 'Failure' });
    });

    it('remembers private navigation after the URL was removed before a Replay flush', () => {
        const privacy = createTelemetryPrivacy(() => 'https://reserve.it.kr/');
        expect(privacy.beforeBreadcrumb({ category: 'navigation', data: { from: privateUrl, to: '/' } })
            .data.from).toBe('https://reserve.it.kr/store/42');
        expect(privacy.integration.processEvent({ type: 'replay_event', urls: ['/'] })).toBeNull();
    });

    it('rejects an earlier private replay URL even when the current page is public', () => {
        const privacy = createTelemetryPrivacy(() => 'https://reserve.it.kr/');
        expect(privacy.integration.processEvent({ type: 'replay_event', urls: [privateUrl] })).toBeNull();
    });

    it('scrubs independently recorded Replay network and navigation breadcrumbs', () => {
        const privacy = createTelemetryPrivacy(() => 'https://reserve.it.kr/');
        const network = { type: 5, data: { tag: 'performanceSpan', payload: { description: privateUrl, data: { url: privateUrl } } } };
        expect(JSON.stringify(privacy.beforeAddRecordingEvent(network))).not.toContain('synthetic-');
        privacy.beforeAddRecordingEvent({ type: 5, data: { tag: 'breadcrumb', payload: { category: 'navigation', data: { to: privateUrl } } } });
        expect(privacy.integration.processEvent({ type: 'replay_event', urls: ['/'] })).toBeNull();
    });

    it('enforces privacy through the installed SDK before a transport can receive an envelope', async () => {
        const privacy = createTelemetryPrivacy(() => privateUrl);
        const sent = [];
        const client = new BrowserClient({
            dsn: 'https://public@example.invalid/1',
            stackParser: defaultStackParser,
            integrations: [privacy.integration],
            sendClientReports: false,
            transport: () => ({ send: envelope => { sent.push(envelope); return Promise.resolve({ statusCode: 200 }); }, flush: () => Promise.resolve(true) }),
        });
        client.init();
        try {
            client.captureEvent({ message: 'Failure', request: { url: privateUrl } });
            client.captureEvent({ type: 'replay_event', urls: [privateUrl] });
            await client.flush();
            expect(sent).toHaveLength(1);
            expect(JSON.stringify(sent)).not.toContain('synthetic-');
            expect(JSON.stringify(sent)).not.toContain('replay_event');
        } finally {
            await client.close();
        }
    });
});
