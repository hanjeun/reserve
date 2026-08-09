import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const adService = {
    /** 광고 신청 + 결제 준비 — FormData (배너는 이미지 포함) */
    createAd: (formData) => api.post(API_ENDPOINTS.ADVERTISEMENT.CREATE, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    /** 결제 대기/실패 상태인 기존 광고에 대해 결제창을 다시 여는 준비 요청 */
    preparePayment: (id) => api.post(API_ENDPOINTS.ADVERTISEMENT.PREPARE_PAYMENT(id)),
    verifyPayment: (merchantUid) => api.post(API_ENDPOINTS.ADVERTISEMENT.VERIFY_PAYMENT, { merchantUid }),
    cancelAd: (id) => api.delete(API_ENDPOINTS.ADVERTISEMENT.CANCEL(id)),
    // 종료상태(만료/취소/환불/중단) 광고를 목록에서 숨기기(소프트삭제) — 2026-07 추가
    removeAd: (id) => api.delete(API_ENDPOINTS.ADVERTISEMENT.REMOVE(id)),
    /** 배너 광고 콘텐츠(제목/설명/이미지) 수정 — FormData(이미지는 새로 올릴 때만 포함) */
    updateAd: (id, formData) => api.patch(API_ENDPOINTS.ADVERTISEMENT.UPDATE(id), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }),
    getActiveAds: (adType) => api.get(API_ENDPOINTS.ADVERTISEMENT.ACTIVE, { params: { type: adType } }),
    getMyAds: () => api.get(API_ENDPOINTS.ADVERTISEMENT.MY_ADS),
    // search: 가게 이름 부분 일치(관리자 광고 목록). 빈 문자열이면 파라미터를 아예 보내지 않는다 —
    // 서버는 null과 ""를 같게 취급하지만, 쿼리스트링에 빈 값이 남으면 React Query 캐시 키와
    // 요청 URL이 불필요하게 갈라진다.
    getAllAds: (page = 0, size = 50, search = '') =>
        api.get(API_ENDPOINTS.ADVERTISEMENT.ADMIN_ALL, {
            params: { page, size, ...(search ? { search } : {}) },
        }),
    suspendAd: (id, reason) => api.patch(API_ENDPOINTS.ADVERTISEMENT.ADMIN_SUSPEND(id), { reason }),

    /**
     * 광고 성과 지표(2026-07 추가) — 셋 다 장식적 요소라 실패해도 호출측(UI)을 깨뜨리면 안 된다.
     * catch로 조용히 무시 — 사용자에게 에러 토스트를 띄우지 않는다(목록 지연/실패 등을 막으면 안 됨).
     */
    recordImpression: (id) => api.patch(API_ENDPOINTS.ADVERTISEMENT.IMPRESSION(id)).catch(() => {}),
    recordClick: (id) => api.patch(API_ENDPOINTS.ADVERTISEMENT.CLICK(id)).catch(() => {}),
    recordConversion: (id) => api.patch(API_ENDPOINTS.ADVERTISEMENT.CONVERSION(id)).catch(() => {}),
};

export default adService;
