import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const businessService = {
    /** 내 인증 상태 조회 */
    getMyStatus: () => api.get(API_ENDPOINTS.BUSINESS.MY_STATUS),

    /** 사업자 인증 신청 */
    submit: ({ licenseImage, businessName, businessNumber, memo }) => {
        const formData = new FormData();
        formData.append('licenseImage', licenseImage);
        formData.append('businessName', businessName);
        if (businessNumber) formData.append('businessNumber', businessNumber);
        if (memo) formData.append('memo', memo);
        return api.post(API_ENDPOINTS.BUSINESS.SUBMIT, formData);
    },

    /** 신청 취소 (PENDING 상태일 때) */
    cancel: () => api.delete(API_ENDPOINTS.BUSINESS.CANCEL),

    /** 사업자 자격 포기 (BUSINESS 상태일 때) */
    resign: () => api.post(API_ENDPOINTS.BUSINESS.RESIGN),
};

export default businessService;
