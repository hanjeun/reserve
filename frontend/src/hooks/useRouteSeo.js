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

/** 검색 결과의 사이트 계층(빵부스러기)에 쓰이는 경로별 이름표. */
const BREADCRUMB_LABELS = [
    { pattern: /^\/stores$/, trail: [{ name: '가게 찾기', path: '/stores' }] },
    { pattern: /^\/store\/\d+$/, trail: [{ name: '가게 찾기', path: '/stores' }, { name: '가게 상세', path: null }] },
    { pattern: /^\/terms$/, trail: [{ name: '서비스 이용약관', path: '/terms' }] },
    { pattern: /^\/privacy$/, trail: [{ name: '개인정보 처리방침', path: '/privacy' }] },
];

const BREADCRUMB_SCRIPT_ID = 'reserve-breadcrumb-jsonld';

/**
 * 검색 결과에 "RESERVE > 가게 찾기 > 가게 상세" 처럼 계층을 보여주기 위한 BreadcrumbList.
 *
 * 왜 필요했나 — 색인 대상 경로가 전부 같은 깊이의 낱개 URL 로만 보여서, 검색 결과가
 * 사이트 구조 없이 제목만 나열됐다. BreadcrumbList 는 크롤러가 그 계층을 읽는 표준 방법이다.
 * 색인하지 않는 경로에는 붙이지 않는다 — 노출되지 않을 페이지의 계층은 의미가 없다.
 */
const syncBreadcrumbJsonLd = (pathname) => {
    const normalized = normalizeSeoPath(pathname);
    const matched = isIndexablePath(normalized)
        ? BREADCRUMB_LABELS.find((entry) => entry.pattern.test(normalized))
        : null;

    const existing = document.getElementById(BREADCRUMB_SCRIPT_ID);

    // 홈(/)은 계층의 뿌리 자체라 빵부스러기가 없다 — 스크립트를 지우고 끝낸다.
    if (!matched) {
        if (existing) existing.remove();
        return;
    }

    // 마지막 항목의 item 은 비워둔다(현재 페이지). 상세 페이지 이름은 여기서 정하지 않는다 —
    // 가게 이름은 데이터가 도착해야 알 수 있고, 그때마다 JSON-LD 를 다시 쓰면 크롤러가
    // 받는 값이 렌더 타이밍에 따라 달라진다. 계층만 알려주고 이름은 title 에 맡긴다.
    const itemListElement = [
        { '@type': 'ListItem', position: 1, name: 'RESERVE', item: SITE_ORIGIN },
        ...matched.trail.map((step, i) => ({
            '@type': 'ListItem',
            position: i + 2,
            name: step.name,
            ...(step.path ? { item: `${SITE_ORIGIN}${step.path}` } : {}),
        })),
    ];

    const script = existing ?? document.createElement('script');
    script.id = BREADCRUMB_SCRIPT_ID;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement,
    });
    if (!existing) document.head.appendChild(script);
};

/**
 * 라우트별 검색 공개 정책과 URL 메타데이터를 한 곳에서 동기화한다.
 * 쿼리·해시는 canonical/og:url에 절대 넣지 않아 결제 식별자나 OAuth 값을 노출하지 않는다.
 *
 * ⚠️ 여기서 붙이는 robots 메타는 **JS 를 실행하는 크롤러에만** 보인다.
 *    JS 를 실행하지 않는 크롤러는 index.html 원본(robots: index, follow)만 보고
 *    /login, /my-page 같은 경로까지 색인해버린다. 그 경로들은 nginx 가
 *    X-Robots-Tag 헤더로 한 번 더 막는다 — nginx/default.conf 의 같은 이름 규칙 참고.
 *    두 곳의 경로 집합은 항상 같이 고쳐야 한다.
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

        syncBreadcrumbJsonLd(pathname);
    }, [pathname]);
};

export default useRouteSeo;
