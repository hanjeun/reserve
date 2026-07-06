import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const adService = {
    /** 광고 신청 + 결제 준비 — FormData (배너는 이미지 포함) */
    createAd: (formData) => api.post(API_ENDPOINTS.ADVERTISEMENT.CREATE, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    verifyPayment: (merchantUid) => api.post(API_ENDPOINTS.ADVERTISEMENT.VERIFY_PAYMENT, { merchantUid }),
    getActiveAds: (adType) => api.get(API_ENDPOINTS.ADVERTISEMENT.ACTIVE, { params: { type: adType } }),
    getMyAds: () => api.get(API_ENDPOINTS.ADVERTISEMENT.MY_ADS),
    getAllAds: (page = 0, size = 50) => api.get(API_ENDPOINTS.ADVERTISEMENT.ADMIN_ALL, { params: { page, size } }),
    suspendAd: (id, reason) => api.patch(API_ENDPOINTS.ADVERTISEMENT.ADMIN_SUSPEND(id), { reason }),
};

export default adService;
