import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 라우트 변경 시 항상 스크롤을 최상단으로 이동시킵니다.
 */
function ScrollToTop() {
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, [pathname]);

    return null;
}

export default ScrollToTop;
