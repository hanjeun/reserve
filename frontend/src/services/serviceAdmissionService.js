import api from '../api/axios';
import { assertCurrentSession } from '../api/sessionScope';
import { completeServiceAdmission, observeServiceAdmission } from '../api/serviceAdmissionGate';
import { serviceEntryStatus } from '../utils/serviceAdmissionStatus';

const path = '/api/service-admission';

/* 개별 입장권을 소비하기 전에 공통 정원을 확인하며 업무 데이터를 제출하지 않는다. */
export async function prepareCoreWork({ method, url, epoch, signal }) {
    assertCurrentSession(epoch);
    const config = { method, url, _sessionEpoch: epoch };
    let value;
    try { value = await api.get(path, { signal, _sessionEpoch: epoch }); }
    catch (error) {
        assertCurrentSession(epoch);
        // 선택적 입장 상태 경로가 없는 서버에서도 최종 생성 API의 정원·인증 검증은 유지된다.

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
