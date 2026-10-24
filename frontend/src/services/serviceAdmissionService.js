import api from '../api/axios';
import { assertCurrentSession } from '../api/sessionScope';
import { completeServiceAdmission, observeServiceAdmission } from '../api/serviceAdmissionGate';
import { serviceEntryStatus } from '../utils/serviceAdmissionStatus';

const path = '/api/service-admission';

/** Verify common capacity before consuming a scarce campaign grant. Never submits business data. */
export async function prepareCoreWork({ method, url, epoch, signal }) {
    assertCurrentSession(epoch);
    const config = { method, url, _sessionEpoch: epoch };
    let value;
    try { value = await api.get(path, { signal, _sessionEpoch: epoch }); }
    catch (error) {
        assertCurrentSession(epoch);
        // A legacy server may lack this optional status route. This grants no server authority:
        // the final creation endpoint still enforces its own capacity/authentication checks.
        if (error?.status === 404) return true;
        if (error?.status === 503 && error?.data?.code === 'SERVICE_ADMISSION_UNAVAILABLE') {
            observeServiceAdmission(config, error.data);
        }
        throw error;
    }
    assertCurrentSession(epoch);
    const status = serviceEntryStatus(value);
    if (status.state === 'ADMITTED' || status.mode === 'OFF' && status.state === 'BYPASS') {
        completeServiceAdmission(epoch);
        return true;
    }
    observeServiceAdmission(config, { code: 'SERVICE_ADMISSION_REQUIRED', mode: status.mode });
    return false;
}

export default {
    status: signal => api.get(path, { signal }),
    join: signal => api.post(path, undefined, { signal }),
    cancel: signal => api.delete(path, { signal }),
};
