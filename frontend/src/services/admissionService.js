import api from '../api/axios';

const BASE = '/api/reservations/admission';
const path = id => `${BASE}/${encodeURIComponent(id)}`;

const admissionService = {
    find: ({ storeId, date, time }, signal) => api.get(BASE, { params: { storeId, date, time }, signal }),
    join: (id, signal) => api.post(path(id), undefined, { signal }),
    status: (id, ticket, signal) => api.post(`${path(id)}/status`, { ticket }, { signal }),
    cancel: (id, ticket, signal) => api.delete(path(id), { data: { ticket }, signal }),
};

export default admissionService;
