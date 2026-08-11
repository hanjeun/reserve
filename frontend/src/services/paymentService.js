/**
 * paymentService — 결제 관련 API
 *
 * 백엔드 엔드포인트:
 *   GET  /api/payment/config                    포트원 설정 (V2 storeId)
 *   POST /api/payment/prepare                   결제 준비
 *   POST /api/payment/verify                    결제 검증/완료
 *   POST /api/payment/refund                    환불
 *   GET  /api/payment/my-payments               내 결제 내역
 *   GET  /api/payment/refund-preview/{id}       환불 예상 금액
 */
import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const paymentService = {
    /** 포트원 설정 정보 (V2 storeId). 결제 준비 응답에도 storeId 가 실려 오므로 현재 호출처는 없다. */
    getConfig: () => api.get(API_ENDPOINTS.PAYMENT.CONFIG),

    /** 결제 준비 — { merchantUid, amount, ... } 반환 */
    prepare: (data) => api.post(API_ENDPOINTS.PAYMENT.PREPARE, data),

    /** 결제 검증 및 완료 처리 */
    verify: (data) => api.post(API_ENDPOINTS.PAYMENT.VERIFY, data),

    /** 환불 */
    refund: (data) => api.post(API_ENDPOINTS.PAYMENT.REFUND, data),

    /** 내 결제 내역 */
    getMyPayments: () => api.get(API_ENDPOINTS.PAYMENT.MY_PAYMENTS),

    /** 환불 예상 금액 조회 */
    getRefundPreview: (reservationId) =>
        api.get(API_ENDPOINTS.PAYMENT.REFUND_PREVIEW(reservationId)),
};

export default paymentService;
