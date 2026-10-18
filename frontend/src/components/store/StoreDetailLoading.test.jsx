import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { RouteSkeletonPreview } from '../layout/RouteLoadingSkeleton';
import StoreDetailLoading from './StoreDetailLoading';
import PhotoGallery from '../common/PhotoGallery';
import LoadingAntImage from '../common/LoadingAntImage';
import { rememberImageHints, getImageHint } from '../../utils/imageHintCache';

const originalWidth = window.innerWidth;
const clients = [];
const setWidth = value => Object.defineProperty(window, 'innerWidth', { configurable: true, value });
const cover = container => container.querySelector('.reserve-data-skeleton [style*="aspect-ratio"]');
const documentHint = (id, extra = {}) => {
    for (const [key, value] of Object.entries({ id, url: `https://cdn.reserve.it.kr/users/3/stores/${id}/images/first.webp`, width: 600, height: 800, ...extra })) {
        const meta = document.createElement('meta'); meta.name = `reserve-store-image-${key}`; meta.content = String(value); document.head.append(meta);
    }
};
afterEach(() => {
    setWidth(originalWidth);
    clients.splice(0).forEach(client => client.clear());
    document.querySelectorAll('meta[name^="reserve-store-image-"]').forEach(meta => meta.remove());
});

describe('one store detail loading frame', () => {
    it.each([[899, '700px', '20px 24px 80px'], [900, '1200px', '32px 24px 80px']])(
        'has the detailed frame and exact photo ratio immediately at %ipx without a query provider', (width, maxWidth, padding) => {
            setWidth(width); documentHint(width);
            const { container } = render(<RouteSkeletonPreview pathname={`/store/${width}`} />);
            expect(container.querySelector('.reserve-route-skeleton--detail .reserve-page-container')).toHaveStyle({ maxWidth, padding });
            expect(cover(container).style.aspectRatio).toBe('600 / 800');
            expect(container.querySelector('img,button,input,a')).toBeNull();
        });

    it('uses newer public cache geometry and never reads an edit cache or starts an API request', () => {
        const client = new QueryClient(); clients.push(client);
        const url = 'https://cdn.reserve.it.kr/users/3/stores/804/images/current.webp';
        client.setQueryData(['stores', 'detail', '804', 'edit'], { id: 804, mainImageUrl: url, mainImageWidth: 50, mainImageHeight: 50 }, { updatedAt: 30 });
        client.setQueryData(['home', 'recommended-stores', ''], { content: [{ id: 804, detailImageUrls: [url], detailImageMeta: [{ url, width: 900, height: 500 }] }] }, { updatedAt: 20 });
        client.setQueryData(['stores', 'list', {}], { content: [{ id: 804, mainImageUrl: url, mainImageWidth: 600, mainImageHeight: 800 }] }, { updatedAt: 10 });
        const { container } = render(<QueryClientProvider client={client}><StoreDetailLoading storeId={804} /></QueryClientProvider>);
        expect(cover(container).style.aspectRatio).toBe('900 / 500');
        expect(client.isFetching()).toBe(0);
        expect(client.getQueryCache().getAll()).toHaveLength(3);
    });

    it('does not reuse an old image ratio when the new public response has no metadata', () => {
        const client = new QueryClient(); clients.push(client);
        rememberImageHints({ id: 805, mainImageUrl: '/old.png', mainImageWidth: 1200, mainImageHeight: 400 });
        client.setQueryData(['stores', 'detail', '805'], { id: 805, detailImageUrls: ['/replacement.png'], detailImageMeta: [] });
        const { container } = render(<QueryClientProvider client={client}><StoreDetailLoading storeId={805} /></QueryClientProvider>);
        expect(cover(container).style.aspectRatio).toBe('1 / 1');
        expect(getImageHint(805)).toBeNull();
    });

    it('keeps the full carousel track height from the document through the public data frame', () => {
        documentHint(806, { width: 1200, height: 500, 'layout-ratio': 0.75 });
        const { container, rerender } = render(<RouteSkeletonPreview pathname="/store/806" />);
        expect(cover(container)).toHaveStyle({ aspectRatio: '0.75' });
        const client = new QueryClient(); clients.push(client);
        const first = 'https://cdn.reserve.it.kr/users/3/stores/806/images/first.webp';
        const tall = 'https://cdn.reserve.it.kr/users/3/stores/806/images/tall.webp';
        client.setQueryData(['stores', 'detail', '806'], { id: 806, detailImageUrls: [first, tall], detailImageMeta: [
            { url: first, width: 1200, height: 500 }, { url: tall, width: 600, height: 800 },
        ] });
        rerender(<QueryClientProvider client={client}><StoreDetailLoading storeId={806} /></QueryClientProvider>);
        expect(cover(container)).toHaveStyle({ aspectRatio: '0.75' });
        expect(getImageHint(806)).toEqual({ width: 1200, height: 500, layoutRatio: 0.75 });
    });

    it('passes measured geometry through the gallery while keeping the actual image size natural', () => {
        render(<PhotoGallery label="가게" sources={['/portrait.webp']} imageSizes={[{ width: 600, height: 800 }]}
            imageStyle={{ width: '100%', height: 'auto', display: 'block' }} />);
        for (const image of screen.getAllByAltText('가게 사진 1')) {
            expect(image.style.aspectRatio).toBe('auto 600 / 800');
            expect(image.style.width).toBe('100%');
            expect(image.style.height).toBe('auto');
        }
    });

    it('keeps an explicitly sized benefit/feed image independent of optional store geometry', () => {
        render(<LoadingAntImage src="/benefit.webp" alt="혜택 사진" imageSize={{ width: 600, height: 800 }}
            style={{ height: '360px', aspectRatio: 'auto', objectFit: 'contain' }} />);
        expect(screen.getByAltText('혜택 사진')).toHaveStyle({ height: '360px', aspectRatio: 'auto', objectFit: 'contain' });
    });
});
