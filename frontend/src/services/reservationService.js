import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const reservationService = {
    getMyReservations:   (params = {})  => api.get(API_ENDPOINTS.RESERVATION.MY_RESERVATIONS, { params }),
    getMyCompletedForStore: (storeId)   => api.get(API_ENDPOINTS.RESERVATION.MY_COMPLETED_FOR_STORE(storeId)),
    getStoreReservations:(params = {})  => api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATIONS, { params }),
    removeReservation:   (id)           => api.delete(API_ENDPOINTS.RESERVATION.REMOVE(id)),
    getReservation:      (id)           => api.get(API_ENDPOINTS.RESERVATION.DETAIL(id)),
    getEditStore:        (id, storeId, config = {}) => api.get(`/api/reservations/${id}/edit-store`, { ...config, params: { storeId } }),
    getEditAvailability: (id, storeId, date, config = {}) => api.get(`/api/reservations/${id}/availability`, { ...config, params: { storeId, date } }),
    getEditCalendar:     (id, storeId, month, config = {}) => api.get(`/api/reservations/${id}/calendar`, { ...config, params: { storeId, month } }),
    createReservation:   (data)         => api.post(API_ENDPOINTS.RESERVATION.CREATE, data),
    recoverReservation:  (data, config = {}) => api.post('/api/reservations/requests/result', data, config),
    updateReservation:   (id, data)     => api.patch(API_ENDPOINTS.RESERVATION.UPDATE(id), data),
    cancelReservation:   (id)           => api.patch(API_ENDPOINTS.RESERVATION.CANCEL(id)),
    approveReservation:  (id)           => api.patch(API_ENDPOINTS.RESERVATION.APPROVE(id)),
    rejectReservation:   (id, reason)   => api.patch(API_ENDPOINTS.RESERVATION.REJECT(id), { rejectionReason: reason }),
    // 사업자용 취소 — 서버가 전액 환불까지 함께 처리한다(가게 귀책이라 환불 정책을 타지 않는다)
    storeCancelReservation: (id, reason) => api.patch(API_ENDPOINTS.RESERVATION.STORE_CANCEL(id), { cancelReason: reason }),
    completeReservation: (id)           => api.patch(API_ENDPOINTS.RESERVATION.COMPLETE(id)),
    undoApprove:         (id)           => api.patch(API_ENDPOINTS.RESERVATION.UNDO_APPROVE(id)),
    undoComplete:        (id)           => api.patch(API_ENDPOINTS.RESERVATION.UNDO_COMPLETE(id)),
    noShowReservation:   (id)           => api.patch(API_ENDPOINTS.RESERVATION.NO_SHOW(id)),
    getQrToken:          (id)           => api.get(API_ENDPOINTS.RESERVATION.QR_TOKEN(id)),
    checkInByQr:         (token)        => api.post(API_ENDPOINTS.RESERVATION.QR_CHECKIN, { token }),
};

export default reservationService;
