import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

class StoreService {
    async createStore(formData)              { return await api.post(API_ENDPOINTS.STORE.CREATE, formData); }
    async updateStore(storeId, formData)     { return await api.put(API_ENDPOINTS.STORE.UPDATE(storeId), formData); }
    async deleteStore(storeId)               { await api.delete(API_ENDPOINTS.STORE.DELETE(storeId)); }
    async getStores(params = {})             { return await api.get(API_ENDPOINTS.STORE.LIST, { params }); }
    async getStoreById(storeId)              { return await api.get(API_ENDPOINTS.STORE.DETAIL(storeId)); }
    async getMyStores()                      { return await api.get(API_ENDPOINTS.STORE.MY_STORES); }

    async toggleAutoApproval(storeId, enabled) {
        return await api.patch(API_ENDPOINTS.STORE.AUTO_APPROVAL(storeId), null, { params: { enabled } });
    }
}

export default new StoreService();
