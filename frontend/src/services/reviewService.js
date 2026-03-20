import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const reviewService = {
    createReview:          (data)              => api.post(API_ENDPOINTS.REVIEW.CREATE, data),
    getReviewsByStore:     (storeId)           => api.get(API_ENDPOINTS.REVIEW.BY_STORE(storeId)),
    updateReview:          (id, data)          => api.put(API_ENDPOINTS.REVIEW.UPDATE(id), data),
    deleteReview:          (id)                => api.delete(API_ENDPOINTS.REVIEW.DELETE(id)),
    getReviewByReservation:(reservationId)     => api.get(API_ENDPOINTS.REVIEW.BY_RESERVATION(reservationId)),
    canWriteReview:        (reservationId)     => api.get(API_ENDPOINTS.REVIEW.CAN_WRITE(reservationId)),
};

export default reviewService;
