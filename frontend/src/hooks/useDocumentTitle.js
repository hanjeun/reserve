import { useEffect } from 'react';

const BASE_TITLE = 'RESERVE';

/**
 * 페이지 타이틀 설정 훅
 *
 * 사용법:
 *   useDocumentTitle('홈');           → "홈 | RESERVE"
 *   useDocumentTitle('내 예약');       → "내 예약 | RESERVE"
 *   useDocumentTitle(storeName);      → "스타벅스 강남점 | RESERVE"
 *   useDocumentTitle(null);           → "RESERVE" (홈 등 타이틀만)
 *
 * @param {string|null} title - 페이지 고유 타이틀 (null이면 서비스명만 표시)
 */
const useDocumentTitle = (title) => {
    useEffect(() => {
        document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;

        // 페이지 이탈 시 기본값으로 복원
        return () => {
            document.title = BASE_TITLE;
        };
    }, [title]);
};

export default useDocumentTitle;
