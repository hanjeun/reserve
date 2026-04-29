import { useEffect } from 'react';

const SITE_NAME = 'RESERVE';
const DEFAULT_DESCRIPTION = '기다림 없는 완벽한 하루를 위해, 전국 맛집 예약을 가장 빠르게 도와드립니다.';

/**
 * 페이지별 document title + meta description 동기화 훅
 *
 * 사용법:
 *   useDocumentTitle('가게 목록');
 *   useDocumentTitle('스타벅스 강남점', '스타벅스 강남점 예약 페이지입니다.');
 *   useDocumentTitle(null); // 홈 — "RESERVE | 전국 맛집 예약 플랫폼"
 */
const useDocumentTitle = (pageTitle, description) => {
    useEffect(() => {
        // ── title ──────────────────────────────────────────
        const title = pageTitle
            ? `${pageTitle} | ${SITE_NAME}`
            : `${SITE_NAME} | 전국 맛집 예약 플랫폼`;

        document.title = title;

        // ── meta description ───────────────────────────────
        const desc = description || DEFAULT_DESCRIPTION;
        const setMeta = (selector, value) => {
            const el = document.querySelector(selector);
            if (el) el.setAttribute('content', value);
        };

        setMeta('meta[name="description"]', desc);
        setMeta('meta[property="og:title"]', title);
        setMeta('meta[property="og:description"]', desc);
        setMeta('meta[property="og:url"]', window.location.href);
        setMeta('meta[name="twitter:title"]', title);
        setMeta('meta[name="twitter:description"]', desc);

        // ── canonical ──────────────────────────────────────
        let canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) canonical.setAttribute('href', window.location.href);

        // ── 페이지 이탈 시 기본값으로 복원 ─────────────────
        return () => {
            document.title = `${SITE_NAME} | 전국 맛집 예약 플랫폼`;
            setMeta('meta[name="description"]', DEFAULT_DESCRIPTION);
            setMeta('meta[property="og:title"]', `${SITE_NAME} | 전국 맛집 예약 플랫폼`);
            setMeta('meta[property="og:description"]', DEFAULT_DESCRIPTION);
            setMeta('meta[name="twitter:title"]', `${SITE_NAME} | 전국 맛집 예약 플랫폼`);
            setMeta('meta[name="twitter:description"]', DEFAULT_DESCRIPTION);
        };
    }, [pageTitle, description]);
};

export default useDocumentTitle;
