import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { readFeedMediaHint } from './feedMediaHint';

const image = (width, height) => ({ url: '/api/feed/media/5', width, height });

describe('feed detail geometry hints', () => {
    it('uses list geometry without seeding detail data or exposing text and URLs', () => {
        const client = new QueryClient();
        client.setQueryData(['feed', 'posts', { page: 0 }], { content: [
            { id: 7, content: 'cached body', images: [image(1200, 600)] },
        ] });
        expect(readFeedMediaHint(client, 7)).toEqual([{ width: 1200, height: 600 }]);
        expect(client.getQueryData(['feed', 'post', 7])).toBeUndefined();
        expect(readFeedMediaHint(new QueryClient(), 7)).toBeUndefined();
        expect(readFeedMediaHint(null, 7)).toBeUndefined();
        client.clear();
    });

    it('uses the newest matching post and distinguishes no photos from unknown geometry', () => {
        const client = new QueryClient();
        client.setQueryData(['feed', 'post', 7], { id: 7, images: [image(600, 1200)] }, { updatedAt: 10 });
        client.setQueryData(['feed', 'author', 'author', 'posts', {}], { content: [{ id: 7, images: [] }] }, { updatedAt: 20 });
        expect(readFeedMediaHint(client, 7)).toEqual([]);
        expect(readFeedMediaHint(client, 8)).toBeUndefined();
        client.setQueryData(['feed', 'post', 7], { id: 7, state: 'DELETED', images: [image(600, 1200)] }, { updatedAt: 30 });
        expect(readFeedMediaHint(client, 7)).toEqual([]);
        client.clear();
    });

    it('ignores unrelated payloads, failed reads, invalid IDs and unsupported photo sources', () => {
        const client = new QueryClient();
        client.setQueryData(['feed', 'author', 7], { id: 7, images: [image(1, 1)] });
        client.setQueryData(['feed', 'post', 7], { id: 7, images: [{ url: 'https://example.com/photo', width: 3, height: 2 }] });
        expect(readFeedMediaHint(client, 7)).toEqual([]);
        client.getQueryCache().find({ queryKey: ['feed', 'post', 7], exact: true }).setState({ error: new Error('denied') });
        expect(readFeedMediaHint(client, 7)).toBeUndefined();
        expect(readFeedMediaHint(client, NaN)).toBeUndefined();
        expect(readFeedMediaHint(client, -1)).toBeUndefined();
        client.clear();
    });
});
