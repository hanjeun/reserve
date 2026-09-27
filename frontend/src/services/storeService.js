import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const storeService = {
    createStore:              (formData)          => api.post(API_ENDPOINTS.STORE.CREATE, formData),
    updateStore:              (storeId, formData) => api.put(API_ENDPOINTS.STORE.UPDATE(storeId), formData),
    deleteStore:              (storeId)           => api.delete(API_ENDPOINTS.STORE.DELETE(storeId)),
    getActiveReservationsCount:(storeId)          => api.get(API_ENDPOINTS.STORE.ACTIVE_RESERVATIONS_COUNT(storeId)),
    getClosureReadiness:      (storeId)           => api.get(API_ENDPOINTS.STORE.CLOSURE_READINESS(storeId)),
    getStores:                (params = {})       => api.get(API_ENDPOINTS.STORE.LIST, { params }),
    getRegions:               ()                  => api.get(API_ENDPOINTS.STORE.REGIONS),
    getStoreById:             (storeId)           => api.get(API_ENDPOINTS.STORE.DETAIL(storeId)),
    getStoreForEdit:          (storeId)           => api.get(API_ENDPOINTS.STORE.EDIT(storeId)),
    getMyStores:              ()                  => api.get(API_ENDPOINTS.STORE.MY_STORES),
    toggleAutoApproval:       (storeId, enabled)  => api.patch(API_ENDPOINTS.STORE.AUTO_APPROVAL(storeId), null, { params: { enabled } }),
    getStatistics:            (storeId, range = '30d') => api.get(API_ENDPOINTS.STORE.STATISTICS(storeId), { params: { range } }),
};

export default storeService;
