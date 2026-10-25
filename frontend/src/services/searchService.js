import api from '../api/axios';
import { SEARCH_GROUP_LIMIT } from '../constants/searchCatalog';
import { normalizeSearchResponse } from '../utils/searchResults';

const searchParams = (keyword, filters) => ({ keyword, limit: SEARCH_GROUP_LIMIT,
    ...(filters ? { scope: filters.scope, term: filters.term, ...(filters.date ? { date: filters.date } : {}),
        ...(filters.region ? { region: filters.region } : {}) } : {}) });

export default {
    public: (keyword, signal, filters) => api.get('/api/search', { params: searchParams(keyword, filters), signal, skipAuthRefresh: true })
        .then(response => normalizeSearchResponse(response, keyword, ['stores', 'benefits', 'feed'])),
    personal: (keyword, signal, role, filters) => api.get('/api/search/me', { params: searchParams(keyword, filters), signal })
        .then(response => normalizeSearchResponse(response, keyword, ['reservations', 'waiting', 'messages'], role)),
    reservation: (id, signal) => api.get(`/api/reservations/${id}`, { signal }),
    waiting: (id, signal) => api.get(`/api/waiting/my/${id}`, { signal }),
};
