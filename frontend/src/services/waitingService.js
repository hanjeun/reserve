import api from '../api/axios';
import { API_ENDPOINTS } from '../constants/api';
import { normalizeListPage } from '../utils/listResponse';

const waitingService = {
    getRetentionPolicy: ({ signal } = {}) => api.get(API_ENDPOINTS.WAITING.RETENTION_POLICY, { signal, skipAuthRefresh: true }),
    getBoard: (storeId, signal) => api.get(API_ENDPOINTS.WAITING.BOARD(storeId), { signal }).then(board => {
        if (board?.storeId !== storeId || !Array.isArray(board.entries)
                || board.entries.some(entry => entry?.storeId !== storeId)) {
            throw new Error('대기 명단의 응답 형식을 확인할 수 없어요.');
        }
        return board;
    }),
    create: (storeId, body, signal) => api.post(API_ENDPOINTS.WAITING.BOARD(storeId), body, { signal }),
    updateIntake: (storeId, paused, signal) => api.patch(`${API_ENDPOINTS.WAITING.BOARD(storeId)}/intake`, { paused }, { signal }),
    updateStatus: (storeId, entryId, status, signal) => api.patch(
        API_ENDPOINTS.WAITING.STATUS(storeId, entryId), { status }, { signal }),
    getStores: (params, signal) => api.get(API_ENDPOINTS.WAITING.STORES, { params, signal }).then(normalizeListPage),
    getMine: (page, signal, { keyword, status, sort } = {}) => api.get(API_ENDPOINTS.WAITING.MY, {
        params: { page, size: 20,
            ...(keyword ? { keyword } : {}), ...(status ? { status } : {}), ...(sort ? { sort } : {}) }, signal,
    }).then(normalizeListPage),
    join: (storeId, body, signal) => api.post(API_ENDPOINTS.WAITING.JOIN(storeId), body, { signal }),
    cancel: (entryId, signal) => api.post(API_ENDPOINTS.WAITING.CANCEL(entryId), undefined, { signal }),
    getEntryQr: (entryId, signal) => api.get(API_ENDPOINTS.WAITING.ENTRY_QR(entryId), { signal }),
    getOnsiteQr: (storeId, signal) => api.get(API_ENDPOINTS.WAITING.ONSITE_QR(storeId), { signal }),
    checkInByQr: token => api.post(API_ENDPOINTS.WAITING.CHECKIN, { token }),
};

export default waitingService;
