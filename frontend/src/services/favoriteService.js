/**
 * favoriteService — 찜하기 관련 API
 *
 * 백엔드 엔드포인트:
 *   POST /api/favorites/toggle/{storeId}   찜 토글 (추가/삭제)
 *   GET  /api/favorites/status/{storeId}   찜 상태 확인 (비로그인 허용)
 *   GET  /api/favorites/my                 내 찜 목록
 */
import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const favoriteService = {
    /** 찜 토글 — { isFavorite: boolean } 반환 */
    toggle: (storeId) => api.post(API_ENDPOINTS.FAVORITE.TOGGLE(storeId)),

    /** 찜 상태 확인 — { isFavorite: boolean } 반환 */
    getStatus: (storeId) => api.get(API_ENDPOINTS.FAVORITE.STATUS(storeId)),

    /** 내 찜 목록 */
    getMyFavorites: () => api.get(API_ENDPOINTS.FAVORITE.MY),
};

export default favoriteService;
