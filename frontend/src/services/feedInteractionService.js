import api from '../api/axios';

const read = (url, params, signal) => api.get(url, { params, signal, skipAuthRefresh: true });
export default {
    config: signal => read('/api/feed/interactions/config', undefined, signal),
    status: (type, id, signal) => read(`/api/feed/likes/${type}/${id}`, undefined, signal),
    setLike: (type, id, liked) => api.put(`/api/feed/likes/${type}/${id}`, { liked }),
    mine: (params, signal) => api.get('/api/feed/me/likes', { params, signal }),
    comments: (id, params, signal) => read(`/api/feed/posts/${id}/comments`, params, signal),
    replies: (id, params, signal) => read(`/api/feed/comments/${id}/replies`, params, signal),
    comment: (id, signal) => read(`/api/feed/comments/${id}`, undefined, signal),
    notifications: (params, signal) => api.get('/api/feed/notifications', { params, signal }),
    notificationCount: signal => api.get('/api/feed/notifications/count', { signal }),
    readNotification: id => api.put(`/api/feed/notifications/${id}/read`),
    readAllNotifications: () => api.put('/api/feed/notifications/read-all'),
    createComment: (id, values) => api.post(`/api/feed/posts/${id}/comments`, values),
    editComment: (id, values) => api.put(`/api/feed/comments/${id}`, values),
    deleteComment: id => api.delete(`/api/feed/comments/${id}`),
    reportComment: (id, values) => api.post(`/api/feed/comments/${id}/reports`, values),
    reports: (params, signal) => api.get('/api/admin/feed/comment-reports', { params, signal }),
    report: (id, signal) => api.get(`/api/admin/feed/comment-reports/${id}`, { signal }),
    currentComment: (id, signal) => api.get(`/api/admin/feed/comments/${id}`, { signal }),
    reviewReport: (id, values) => api.patch(`/api/admin/feed/comment-reports/${id}`, values),
    visibility: (id, values) => api.patch(`/api/admin/feed/comments/${id}/visibility`, values),
};
