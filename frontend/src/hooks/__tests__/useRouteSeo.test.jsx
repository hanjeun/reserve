import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useRouteSeo, {
    canonicalUrlForPath,
    isIndexablePath,
    normalizeSeoPath,
} from '../useRouteSeo';

const SeoProbe = () => {
    useRouteSeo();
    return null;
};

const renderAt = (path) => render(
    <MemoryRouter initialEntries={[path]}>
        <SeoProbe />
    </MemoryRouter>,
);

describe('route SEO policy', () => {
    beforeEach(() => {
        document.head.innerHTML = `
            <meta name="robots" content="index, follow" />
            <meta property="og:url" content="https://reserve.it.kr" />
            <link rel="canonical" href="https://reserve.it.kr" />
        `;
    });

    it('indexes only public landing, legal, list, and numeric store detail paths', () => {
        expect(isIndexablePath('/')).toBe(true);
        expect(isIndexablePath('/stores/')).toBe(true);
        expect(isIndexablePath('/store/42')).toBe(true);
        expect(isIndexablePath('/terms')).toBe(true);
        expect(isIndexablePath('/privacy')).toBe(true);

        expect(isIndexablePath('/signup')).toBe(false);
        expect(isIndexablePath('/payment/result')).toBe(false);
        expect(isIndexablePath('/admin')).toBe(false);
        expect(isIndexablePath('/store/not-an-id')).toBe(false);
    });

    it('publishes a query-free canonical for public paths', () => {
        renderAt('/store/42?from=search#reviews');

        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
        expect(document.querySelector('meta[property="og:url"]')).toHaveAttribute(
            'content',
            'https://reserve.it.kr/store/42',
        );
        expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
            'href',
            'https://reserve.it.kr/store/42',
        );
    });

    it('marks private and callback paths noindex without leaking query values', () => {
        renderAt('/oauth2/callback?code=secret&state=private');

        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
        expect(document.querySelector('meta[property="og:url"]')).toHaveAttribute(
            'content',
            'https://reserve.it.kr/oauth2/callback',
        );
        expect(canonicalUrlForPath('/signup/')).toBe('https://reserve.it.kr/signup');
        expect(normalizeSeoPath('invalid')).toBe('/');
    });

    // 검색 결과에 사이트 계층을 보여주기 위한 BreadcrumbList.
    // 색인하지 않는 경로에 남아 있으면 크롤러에게 "이 페이지도 구조의 일부"라고
    // 잘못 알려주게 되므로, 경로가 바뀌면 반드시 지워져야 한다.
    const breadcrumb = () => {
        const el = document.getElementById('reserve-breadcrumb-jsonld');
        return el ? JSON.parse(el.textContent) : null;
    };

    it('publishes a breadcrumb trail for indexable sub-pages', () => {
        renderAt('/store/42');

        const data = breadcrumb();
        expect(data['@type']).toBe('BreadcrumbList');
        expect(data.itemListElement.map((i) => i.name)).toEqual(['RESERVE', '가게 찾기', '가게 상세']);
        expect(data.itemListElement[0].item).toBe('https://reserve.it.kr');
        expect(data.itemListElement[1].item).toBe('https://reserve.it.kr/stores');
        // 마지막 항목(현재 페이지)에는 item 을 주지 않는다 — schema.org 권장.
        expect(data.itemListElement[2].item).toBeUndefined();
    });

    it('omits the breadcrumb on the root and on noindex paths', () => {
        renderAt('/');
        expect(breadcrumb()).toBeNull();

        renderAt('/my-page');
        expect(breadcrumb()).toBeNull();
    });
});
