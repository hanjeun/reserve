import api from '../api/axios';

const publicRead = (url, params, signal) => api.get(url, { params, signal, skipAuthRefresh: true });

export default {
    config: signal => publicRead('/api/feed/config', undefined, signal),
    regions: signal => publicRead('/api/feed/regions', undefined, signal),
    list: (params, signal) => params?.favoriteOnly ? api.get('/api/feed/posts', { params, signal }) : publicRead('/api/feed/posts', params, signal),
    detail: (id, signal) => publicRead(`/api/feed/posts/${id}`, undefined, signal),
    author: (id, signal) => publicRead(`/api/feed/authors/${encodeURIComponent(id)}`, undefined, signal),
    authorPosts: (id, params, signal) => publicRead(`/api/feed/authors/${encodeURIComponent(id)}/posts`, params, signal),
    myProfile: signal => api.get('/api/feed/me/profile', { signal }),
    saveProfile: values => api.put('/api/feed/me/profile', values),
    uploadProfileAvatar: file => {
        const form = new FormData();
        form.append('image', file);
        return api.put('/api/feed/me/profile/avatar', form);
    },
    deleteProfileAvatar: () => api.delete('/api/feed/me/profile/avatar'),
    myPosts: (params, signal) => api.get('/api/feed/me/posts', { params, signal }),
    upload: file => {
        const form = new FormData();
        form.append('file', file);
        return api.post('/api/feed/media', form);
    },
    create: values => api.post('/api/feed/posts', values),
    update: (id, values) => api.put(`/api/feed/posts/${id}`, values),
    remove: id => api.delete(`/api/feed/posts/${id}`),
    report: (id, values) => api.post(`/api/feed/posts/${id}/reports`, values),
    reports: (params, signal) => api.get('/api/admin/feed/reports', { params, signal }),
    reportDetail: (id, signal) => api.get(`/api/admin/feed/reports/${id}`, { signal }),
    audit: (params, signal) => api.get('/api/admin/feed/audit', { params, signal }),
    updateReport: (id, values) => api.patch(`/api/admin/feed/reports/${id}`, values),
    visibility: (id, values) => api.patch(`/api/admin/feed/posts/${id}/visibility`, values),
    newsVisibility: (id, values) => api.patch(`/api/admin/promotions/${id}/visibility`, values),
};
