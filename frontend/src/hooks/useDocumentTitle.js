import { useEffect } from 'react';

const SITE_NAME = 'RESERVE';
const DEFAULT_DESCRIPTION = '예약이 필요한 순간, 원하는 가게를 찾고 가장 빠르게 예약하세요.';

/**
 * 페이지별 document title + meta description 동기화 훅
 *
 * 사용법:
 *   useDocumentTitle('가게 목록');
 *   useDocumentTitle('스타벅스 강남점', '스타벅스 강남점 예약 페이지입니다.');
 *   useDocumentTitle(null); // 홈 — "RESERVE | 예약이 필요한 순간"
 */
const useDocumentTitle = (pageTitle, description) => {
    useEffect(() => {
        // ── title ──────────────────────────────────────────
        const title = pageTitle
            ? `${pageTitle} | ${SITE_NAME}`
            : `${SITE_NAME} | 예약이 필요한 순간`;

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
        setMeta('meta[name="twitter:title"]', title);
        setMeta('meta[name="twitter:description"]', desc);

        // ── 페이지 이탈 시 기본값으로 복원 ─────────────────
        return () => {
            document.title = `${SITE_NAME} | 예약이 필요한 순간`;
            setMeta('meta[name="description"]', DEFAULT_DESCRIPTION);
            setMeta('meta[property="og:title"]', `${SITE_NAME} | 예약이 필요한 순간`);
            setMeta('meta[property="og:description"]', DEFAULT_DESCRIPTION);
            setMeta('meta[name="twitter:title"]', `${SITE_NAME} | 예약이 필요한 순간`);
            setMeta('meta[name="twitter:description"]', DEFAULT_DESCRIPTION);
        };
    }, [pageTitle, description]);
};

export default useDocumentTitle;
