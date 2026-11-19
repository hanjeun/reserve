import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const reviewBody = (data, files, removedPhotoIds) => {
    if (!files?.length && !removedPhotoIds?.length) return data;
    const body = new FormData();
    body.append('review', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    for (const file of files ?? []) body.append('photos', file);
    if (removedPhotoIds?.length) body.append('removedPhotoIds', new Blob([JSON.stringify(removedPhotoIds)], { type: 'application/json' }));
    return body;
};

const reviewService = {
    createReview:          (data, files)       => api.post(API_ENDPOINTS.REVIEW.CREATE, reviewBody(data, files)),
    getReviewsByStore:     (storeId, signal, params) => api.get(API_ENDPOINTS.REVIEW.BY_STORE(storeId), { signal, params }),
    updateReview:          (id, data, files, removedPhotoIds) => api.put(API_ENDPOINTS.REVIEW.UPDATE(id), reviewBody(data, files, removedPhotoIds)),
    replyAsOwner:          (id, content)       => api.put(`/api/reviews/${id}/owner-reply`, { content }),
    deleteReview:          (id)                => api.delete(API_ENDPOINTS.REVIEW.DELETE(id)),
    getReviewByReservation:(reservationId)     => api.get(API_ENDPOINTS.REVIEW.BY_RESERVATION(reservationId)),
    canWriteReview:        (reservationId)     => api.get(API_ENDPOINTS.REVIEW.CAN_WRITE(reservationId)),
    setLike:              (id, liked)         => api.put('/api/reviews/' + id + '/like', { liked }),
    listComments:         (id, page, signal)  => api.get('/api/reviews/' + id + '/comments', { params: { page }, signal }),
    addComment:           (id, data)          => api.post('/api/reviews/' + id + '/comments', data),
    deleteComment:        (id, commentId)     => api.delete('/api/reviews/' + id + '/comments/' + commentId),
};

export default reviewService;
