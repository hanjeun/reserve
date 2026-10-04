import api from '../api/axios';
import { API_ENDPOINTS } from '../constants/api';

const waitingService = {
    getBoard: (storeId, signal) => api.get(API_ENDPOINTS.WAITING.BOARD(storeId), { signal }).then(board => {
        if (board?.storeId !== storeId || !Array.isArray(board.entries)
                || board.entries.some(entry => entry?.storeId !== storeId)) {
            throw new Error('대기 명단의 응답 형식을 확인할 수 없습니다.');
        }
        return board;
    }),
    create: (storeId, body, signal) => api.post(API_ENDPOINTS.WAITING.BOARD(storeId), body, { signal }),
    updateStatus: (storeId, entryId, status, signal) => api.patch(
        API_ENDPOINTS.WAITING.STATUS(storeId, entryId), { status }, { signal }),
};

export default waitingService;
