import api from '../api/axios';

const REPORTS = '/api/service-reports';
const ADMIN_QUEUE = '/api/admin/report-queue';

export default {
    submit: body => api.post(REPORTS, body),
    mine: (params, signal) => api.get(`${REPORTS}/mine`, { params, signal }),
    appeal: (id, body) => api.post(`${REPORTS}/${id}/appeal`, body),
    adminList: (params, signal) => api.get(ADMIN_QUEUE, { params, signal }),
    adminDetail: (id, params, signal) => api.get(`${ADMIN_QUEUE}/${id}`, { params, signal }),
    decide: (id, body) => api.patch(`${ADMIN_QUEUE}/${id}`, body),
};
