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

    /**
     * 노출·클릭은 장식적 지표라 실패해도 화면을 깨뜨리지 않는다.
     * 전환은 서버가 로그인 회원의 실제 예약을 확인한다. 예약 성공 결과는 이 기록 실패와 분리한다.
     */
    recordImpression: (id) => api.patch(API_ENDPOINTS.ADVERTISEMENT.IMPRESSION(id)).catch(() => {}),
    recordClick: (id) => api.patch(API_ENDPOINTS.ADVERTISEMENT.CLICK(id)).catch(() => {}),
    recordConversion: (id, reservationId) =>
        api.patch(API_ENDPOINTS.ADVERTISEMENT.CONVERSION(id), { reservationId }).catch(() => {}),
};

export default adService;
