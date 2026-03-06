import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

class ReviewService {
    async createReview(data)                  { return await api.post(API_ENDPOINTS.REVIEW.CREATE, data); }
    async getReviewsByStore(storeId)           { return await api.get(API_ENDPOINTS.REVIEW.BY_STORE(storeId)); }
    async updateReview(id, data)               { return await api.put(API_ENDPOINTS.REVIEW.UPDATE(id), data); }
    async deleteReview(id)                     { return await api.delete(API_ENDPOINTS.REVIEW.DELETE(id)); }
    async getReviewByReservation(reservationId){ return await api.get(API_ENDPOINTS.REVIEW.BY_RESERVATION(reservationId)); }
    async canWriteReview(reservationId)        { return await api.get(API_ENDPOINTS.REVIEW.CAN_WRITE(reservationId)); }
}

export default new ReviewService();
