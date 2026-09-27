import api from '../api/axios';

const noticeService = {
    getHighlights: (limit = 3) => api.get('/api/notices/highlights', { params: { limit } }),
};

export default noticeService;
