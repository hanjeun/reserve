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
});
