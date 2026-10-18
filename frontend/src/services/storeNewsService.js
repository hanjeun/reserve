import api from '../api/axios';

export default {
    upload: file => {
        const form = new FormData(); form.append('file', file);
        return api.post('/api/store-news/media', form);
    },
    applications: (params, signal) => api.get('/api/admin/promotions/applications', { params, signal }),
    application: (id, signal) => api.get(`/api/admin/promotions/applications/${id}`, { signal }),
    review: (id, values) => api.patch(`/api/admin/promotions/applications/${id}`, values),
    config: signal => api.get('/api/store-news/config', { signal }),
    stores: signal => api.get('/api/store-news/stores', { signal }),
    mine: (params, signal) => api.get('/api/store-news/me', { params, signal }),
    detail: (id, signal) => api.get(`/api/store-news/${id}`, { signal }),
    create: values => api.post('/api/store-news', values),
    update: (id, values) => api.put(`/api/store-news/${id}`, values),
    remove: id => api.delete(`/api/store-news/${id}`),
};
