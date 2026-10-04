import api from '../api/axios';

const chatRetentionService = {
    policy: () => api.get('/api/chat/retention-policy', { skipAuthRefresh: true }),
    get: (reportId) => api.get(`/api/admin/chat/reports/${reportId}/retention`),
    update: (reportId, data) => api.patch(`/api/admin/chat/reports/${reportId}/retention`, data),
};

export default chatRetentionService;
