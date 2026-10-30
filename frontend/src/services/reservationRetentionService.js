import api from '../api/axios';
import { API_ENDPOINTS } from '../constants';

const paths = API_ENDPOINTS.RESERVATION_RETENTION;
export default {
    availability: () => api.get(paths.AVAILABILITY),
    evidence: (id, purpose) => api.post(paths.EVIDENCE(id), { purpose }),
    hold: (id, purpose, caseReference) => api.post(paths.HOLD(id), { purpose, caseReference }),
    release: (id, caseReference) => api.post(paths.RELEASE(id), { caseReference }),
};
