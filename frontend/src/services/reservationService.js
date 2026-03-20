import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const reservationService = {
    getMyReservations:   ()             => api.get(API_ENDPOINTS.RESERVATION.MY_RESERVATIONS),
    getStoreReservations:()             => api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATIONS),
    getReservation:      (id)           => api.get(API_ENDPOINTS.RESERVATION.DETAIL(id)),
    createReservation:   (data)         => api.post(API_ENDPOINTS.RESERVATION.CREATE, data),
    cancelReservation:   (id)           => api.patch(API_ENDPOINTS.RESERVATION.CANCEL(id)),
    approveReservation:  (id)           => api.patch(API_ENDPOINTS.RESERVATION.APPROVE(id)),
    rejectReservation:   (id, reason)   => api.patch(API_ENDPOINTS.RESERVATION.REJECT(id), { rejectionReason: reason }),
    completeReservation: (id)           => api.patch(API_ENDPOINTS.RESERVATION.COMPLETE(id)),
    noShowReservation:   (id)           => api.patch(API_ENDPOINTS.RESERVATION.NO_SHOW(id)),
};

export default reservationService;
