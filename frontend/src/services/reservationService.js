import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

class ReservationService {
    async getMyReservations()              { return await api.get(API_ENDPOINTS.RESERVATION.MY_RESERVATIONS); }
    async getStoreReservations()           { return await api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATIONS); }
    async getReservation(id)               { return await api.get(API_ENDPOINTS.RESERVATION.DETAIL(id)); }
    async createReservation(data)          { return await api.post(API_ENDPOINTS.RESERVATION.CREATE, data); }
    async cancelReservation(id)            { return await api.patch(API_ENDPOINTS.RESERVATION.CANCEL(id)); }
    async approveReservation(id)           { return await api.patch(API_ENDPOINTS.RESERVATION.APPROVE(id)); }
    async rejectReservation(id, reason)    { return await api.patch(API_ENDPOINTS.RESERVATION.REJECT(id), { rejectionReason: reason }); }
    async completeReservation(id)          { return await api.patch(API_ENDPOINTS.RESERVATION.COMPLETE(id)); }
    async noShowReservation(id)            { return await api.patch(API_ENDPOINTS.RESERVATION.NO_SHOW(id)); }
}

export default new ReservationService();
