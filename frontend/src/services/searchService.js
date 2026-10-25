import api from '../api/axios';
import { SEARCH_GROUP_LIMIT } from '../constants/searchCatalog';
import { normalizeSearchResponse } from '../utils/searchResults';

export default {
    public: (keyword, signal) => api.get('/api/search', { params: { keyword, limit: SEARCH_GROUP_LIMIT }, signal, skipAuthRefresh: true })
        .then(response => normalizeSearchResponse(response, keyword, ['stores', 'benefits', 'feed'])),
    personal: (keyword, signal, role) => api.get('/api/search/me', { params: { keyword, limit: SEARCH_GROUP_LIMIT }, signal })
        .then(response => normalizeSearchResponse(response, keyword, ['reservations', 'waiting', 'messages'], role)),
    reservation: (id, signal) => api.get(`/api/reservations/${id}`, { signal }),
    waiting: (id, signal) => api.get(`/api/waiting/my/${id}`, { signal }),
};
