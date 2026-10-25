import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const adService = {
    /** 광고 신청 + 결제 준비 — FormData (배너는 이미지 포함) */
    createAd: (formData) => api.post(API_ENDPOINTS.ADVERTISEMENT.CREATE, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    /* 기존 광고의 결제 대기·실패 상태에서 재결제를 준비한다. */
    preparePayment: (id) => api.post(API_ENDPOINTS.ADVERTISEMENT.PREPARE_PAYMENT(id)),
    verifyPayment: (merchantUid) => api.post(API_ENDPOINTS.ADVERTISEMENT.VERIFY_PAYMENT, { merchantUid }),
    cancelAd: (id) => api.delete(API_ENDPOINTS.ADVERTISEMENT.CANCEL(id)),
    // 종료 상태 광고는 서버에서 소프트 삭제해 목록에서 숨긴다.
    removeAd: (id) => api.delete(API_ENDPOINTS.ADVERTISEMENT.REMOVE(id)),
    /** 배너 광고 콘텐츠(제목/설명/이미지) 수정 — FormData(이미지는 새로 올릴 때만 포함) */
    updateAd: (id, formData) => api.patch(API_ENDPOINTS.ADVERTISEMENT.UPDATE(id), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    getActiveAds: (adType) => api.get(API_ENDPOINTS.ADVERTISEMENT.ACTIVE, { params: { type: adType } }),
    getMyAds: (page = 0, size = 20, storeId = null, search = '') => api.get(API_ENDPOINTS.ADVERTISEMENT.MY_ADS, {
        params: {
            page,
            size,
            ...(storeId ? { storeId } : {}),
            ...(search?.trim() ? { search: search.trim() } : {}),
        },
    }),
    // search: 가게 이름 부분 일치(관리자 광고 목록). 빈 문자열이면 파라미터를 아예 보내지 않는다 —
    // 서버는 null과 ""를 같게 취급하지만, 쿼리스트링에 빈 값이 남으면 React Query 캐시 키와
    // 요청 URL이 불필요하게 갈라진다.
    getAllAds: (page = 0, size = 50, search = '') =>
        api.get(API_ENDPOINTS.ADVERTISEMENT.ADMIN_ALL, {
            params: { page, size, ...(search ? { search } : {}) },
        }),
    suspendAd: (id, reason) => api.patch(API_ENDPOINTS.ADVERTISEMENT.ADMIN_SUSPEND(id), { reason }),

    /*
     * 측정 오류는 화면·예약 성공 결과와 분리한다. 전환은 서버가 현재 회원의 실제 예약을 검증한다.
     */
    recordImpression: (id) => api.patch(API_ENDPOINTS.ADVERTISEMENT.IMPRESSION(id)).catch(() => {}),
    recordClick: (id) => api.patch(API_ENDPOINTS.ADVERTISEMENT.CLICK(id)).catch(() => {}),
    recordConversion: (id, reservationId) =>
        api.patch(API_ENDPOINTS.ADVERTISEMENT.CONVERSION(id), { reservationId }).catch(() => {}),
};

export default adService;
