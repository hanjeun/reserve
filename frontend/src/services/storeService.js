import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const storeService = {
    createStore:              (formData)          => api.post(API_ENDPOINTS.STORE.CREATE, formData),
    updateStore:              (storeId, formData) => api.put(API_ENDPOINTS.STORE.UPDATE(storeId), formData),
    deleteStore:              (storeId)           => api.delete(API_ENDPOINTS.STORE.DELETE(storeId)),
    getActiveReservationsCount:(storeId)          => api.get(`/api/stores/${storeId}/active-reservations-count`),
    getClosureReadiness:      (storeId)           => api.get(`/api/stores/${storeId}/closure-readiness`),
    getStores:                (params = {})       => api.get(API_ENDPOINTS.STORE.LIST, { params }),
    getStoreById:             (storeId)           => api.get(API_ENDPOINTS.STORE.DETAIL(storeId)),
    getStoreForEdit:          (storeId)           => api.get(`/api/stores/${storeId}/edit`),
    getMyStores:              ()                  => api.get(API_ENDPOINTS.STORE.MY_STORES),
    toggleAutoApproval:       (storeId, enabled)  => api.patch(API_ENDPOINTS.STORE.AUTO_APPROVAL(storeId), null, { params: { enabled } }),
    getStatistics:            (storeId, range = '30d') => api.get(API_ENDPOINTS.STORE.STATISTICS(storeId), { params: { range } }),
};

export default storeService;
