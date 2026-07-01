import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const storeService = {
    createStore:              (formData)          => api.post(API_ENDPOINTS.STORE.CREATE, formData),
    updateStore:              (storeId, formData) => api.put(API_ENDPOINTS.STORE.UPDATE(storeId), formData),
    deleteStore:              (storeId, force = false) => api.delete(API_ENDPOINTS.STORE.DELETE(storeId), { params: { force } }),
    getActiveReservationsCount:(storeId)          => api.get(`/api/stores/${storeId}/active-reservations-count`),
    getStores:                (params = {})       => api.get(API_ENDPOINTS.STORE.LIST, { params }),
    getStoreById:             (storeId)           => api.get(API_ENDPOINTS.STORE.DETAIL(storeId)),
    getStoreForEdit:          (storeId)           => api.get(`/api/stores/${storeId}/edit`),
    getMyStores:              ()                  => api.get(API_ENDPOINTS.STORE.MY_STORES),
    toggleAutoApproval:       (storeId, enabled)  => api.patch(API_ENDPOINTS.STORE.AUTO_APPROVAL(storeId), null, { params: { enabled } }),
};

export default storeService;
