
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
