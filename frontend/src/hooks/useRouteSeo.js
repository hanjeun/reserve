import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_ORIGIN = 'https://reserve.it.kr';

// 검색 결과로 공개할 SPA 경로의 단일 관문. sitemap 정책과 반드시 같은 집합을 유지한다.
const INDEXABLE_PATHS = [
    /^\/$/,
    /^\/stores$/,
    /^\/store\/\d+$/,
    /^\/terms$/,
    /^\/privacy$/,
];

export const normalizeSeoPath = (pathname) => {
    const safePath = typeof pathname === 'string' && pathname.startsWith('/') ? pathname : '/';
    return safePath === '/' ? '/' : safePath.replace(/\/+$/, '');
};

export const isIndexablePath = (pathname) => {
    const normalized = normalizeSeoPath(pathname);
    return INDEXABLE_PATHS.some((pattern) => pattern.test(normalized));
};

export const canonicalUrlForPath = (pathname) => `${SITE_ORIGIN}${normalizeSeoPath(pathname)}`;

/**
 * 라우트별 검색 공개 정책과 URL 메타데이터를 한 곳에서 동기화한다.
 * 쿼리·해시는 canonical/og:url에 절대 넣지 않아 결제 식별자나 OAuth 값을 노출하지 않는다.
 */
const useRouteSeo = () => {
    const { pathname } = useLocation();

    useEffect(() => {
        const canonicalUrl = canonicalUrlForPath(pathname);
        const robots = isIndexablePath(pathname) ? 'index, follow' : 'noindex, nofollow';

        const robotsMeta = document.querySelector('meta[name="robots"]');
        if (robotsMeta) robotsMeta.setAttribute('content', robots);

        const ogUrl = document.querySelector('meta[property="og:url"]');
        if (ogUrl) ogUrl.setAttribute('content', canonicalUrl);

        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) canonical.setAttribute('href', canonicalUrl);
    }, [pathname]);
};

export default useRouteSeo;
