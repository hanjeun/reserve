import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const reservationService = {
    getMyReservations:   ()             => api.get(API_ENDPOINTS.RESERVATION.MY_RESERVATIONS),
    getMyCompletedForStore: (storeId)   => api.get(API_ENDPOINTS.RESERVATION.MY_COMPLETED_FOR_STORE(storeId)),
    getStoreReservations:()             => api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATIONS),
    getReservation:      (id)           => api.get(API_ENDPOINTS.RESERVATION.DETAIL(id)),
    createReservation:   (data)         => api.post(API_ENDPOINTS.RESERVATION.CREATE, data),
    cancelReservation:   (id)           => api.patch(API_ENDPOINTS.RESERVATION.CANCEL(id)),
    approveReservation:  (id)           => api.patch(API_ENDPOINTS.RESERVATION.APPROVE(id)),
    rejectReservation:   (id, reason)   => api.patch(API_ENDPOINTS.RESERVATION.REJECT(id), { rejectionReason: reason }),
    completeReservation: (id)           => api.patch(API_ENDPOINTS.RESERVATION.COMPLETE(id)),
    noShowReservation:   (id)           => api.patch(API_ENDPOINTS.RESERVATION.NO_SHOW(id)),
    getQrToken:          (id)           => api.get(API_ENDPOINTS.RESERVATION.QR_TOKEN(id)),
    checkInByQr:         (token)        => api.post(API_ENDPOINTS.RESERVATION.QR_CHECKIN, { token }),
};

export default reservationService;
