import axios from 'axios';
import { currentSession, assertCurrentSession, StaleSessionError } from './sessionScope';
import { skeletonDelayInterceptor } from '../utils/skeletonDelay';
import { canonicalApiPath, versionedApiUrl } from './apiVersion';
import { ServiceAdmissionRequiredError, observeServiceAdmission, isServiceAdmissionBlocked,
    notifyServiceAdmission, waitForServiceAdmission } from './serviceAdmissionGate';
import { assertOverloadCooldown, observeOverloadCooldown } from './overloadCooldown';

const instance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    withCredentials: true,  // 쿠키 자동 전송 (access_token, refresh_token)
    timeout: 30000,         // 30초 (이미지 업로드 등 대용량 요청 대비)
});

let refreshFlight = null;

// 세션 만료 전용 에러 클래스
class SessionExpiredError extends Error {
    constructor() {
        super('다시 로그인해주세요.');
        this.name = 'SessionExpiredError';
        this.isSessionExpired = true;
    }
}

// 인증 관련 엔드포인트 목록 (refresh 재시도 제외 대상)
const AUTH_BYPASS_ROUTES = [
    '/api/auth/login',
    '/api/auth/signup',
    '/api/password-reset',
    '/api/email',
];

const isAuthEndpoint = (url) => {
    const path = canonicalApiPath(url);
    return AUTH_BYPASS_ROUTES.some(route => path === route || path.startsWith(`${route}/`));
};

// 상태 코드별 기본 에러 메시지
const getStatusMessage = (status) => {
    if (status === 403) return '권한이 없어요.';
    if (status === 404) return '정보를 찾을 수 없어요.';
    if (status === 409) return '이미 사용 중이에요.';
    if (status === 429) return '잠시 후 다시 시도해주세요.';
    if (status >= 500) return '서버 오류가 발생했어요.';
    return '요청에 실패했어요.';
};

// 401 처리: 토큰 재발급 또는 대기열 처리
const handle401 = async (originalRequest) => {
    const scope = originalRequest._sessionEpoch;
    assertCurrentSession(scope);
    originalRequest._retry = true;
    if (!refreshFlight || refreshFlight.scope !== scope) {
        refreshFlight = { scope, promise: instance.post('/api/auth/refresh', undefined, { _sessionEpoch: scope }) };
    }
    const flight = refreshFlight;
    try {
        await flight.promise;
        assertCurrentSession(scope);
        return instance(originalRequest);
    } catch (error) {
        // 이전 계정의 refresh 실패가 새 계정의 세션·요청을 바꾸지 않게 한다.
        assertCurrentSession(scope);
        if (error?.status !== 401 && error?.status !== 403) throw error;
        if (canonicalApiPath(originalRequest.url) !== '/api/member/me') {
            // 공개 화면은 API에서 이동시키지 않는다. 개인 캐시를 비우고 보호 라우트의 가드에 맡긴다.
            globalThis.dispatchEvent(new CustomEvent('reserve:session-expired', { detail: { epoch: scope } }));
        }
        throw new SessionExpiredError();
    } finally {
        if (refreshFlight === flight) refreshFlight = null;
    }
};

instance.interceptors.request.use(
    async (config) => {
        const session = currentSession();
        config._sessionEpoch ??= session.epoch;
        assertCurrentSession(config._sessionEpoch);
        config.signal = config.signal ? AbortSignal.any([config.signal, session.signal]) : session.signal;
        assertOverloadCooldown(config);
        if (isServiceAdmissionBlocked(config)) {
            notifyServiceAdmission(config);
            if (!['get', 'head'].includes((config.method || 'get').toLowerCase())) throw new ServiceAdmissionRequiredError();
            await waitForServiceAdmission(config._sessionEpoch, config.signal);
            assertCurrentSession(config._sessionEpoch);
        }
        config.url = versionedApiUrl(config.url);
        await skeletonDelayInterceptor(config);
        assertCurrentSession(config._sessionEpoch);
        if (!(config.data instanceof FormData)) {
            config.headers['Content-Type'] = 'application/json';
        }
        return config;
    },
    (error) => { throw error; }
);

instance.interceptors.response.use(
    (response) => {
        assertCurrentSession(response.config._sessionEpoch);

        if (response.status === 204) return null;
        // 인증·세션 관문을 통과한 사진 다운로드만 binary 본문을 반환한다.
        if (response.config.responseType === 'blob' && response.data instanceof Blob) return response.data;
        const res = response.data;
        if (!res || typeof res !== 'object') throw new Error('서버 응답 형식을 확인할 수 없어요.');
        if (res.success) return res.data;
        throw new Error(res.message ?? '요청에 실패했어요.');
    },
    async (error) => {
        if (error instanceof StaleSessionError || error?.isServiceAdmissionRequired || error?.isOverloadRateLimited || error?.name === 'AbortError') throw error;
        const originalRequest = error.config;
        if (originalRequest?._sessionEpoch != null) assertCurrentSession(originalRequest._sessionEpoch);
        if (axios.isCancel(error)) throw error;

        const gate = error.response?.data?.data;
        if ([429, 503].includes(error.response?.status) && originalRequest
            && canonicalApiPath(originalRequest.url) !== '/api/service-admission'
            && observeServiceAdmission(originalRequest, gate)) {
            // 조회만 재개하며 거절된 쓰기는 자동 재실행하지 않는다.
            if (['get', 'head'].includes((originalRequest.method || 'get').toLowerCase()) && !originalRequest._serviceAdmissionRetry) {
                await waitForServiceAdmission(originalRequest._sessionEpoch, originalRequest.signal);
                assertCurrentSession(originalRequest._sessionEpoch);
                return instance({ ...originalRequest, _serviceAdmissionRetry: true });
            }
            const denied = new ServiceAdmissionRequiredError(error.response.data?.message);
            denied.status = error.response.status;
            denied.data = gate;
            throw denied;
        }

        if (
            error.response?.status === 401 &&
            originalRequest &&
            !originalRequest._retry &&
            !originalRequest.skipAuthRefresh &&
            canonicalApiPath(originalRequest.url) !== '/api/auth/refresh' &&
            !isAuthEndpoint(originalRequest.url)
        ) {
            return handle401(originalRequest);
        }

        if (error.response) {
            const overloaded = originalRequest && observeOverloadCooldown(originalRequest, error.response);
            if (overloaded) throw overloaded;
            const msg = error.response.data?.message || getStatusMessage(error.response.status);
            const err = new Error(msg);
            // 구조화된 에러 데이터(예: 정지 status/until/reason)를 손실 없이 동행
            // 호출측에서 err.data로 접근 가능 (e.g. err.data?.reason)
            err.data = error.response.data?.data;
            err.status = error.response.status;
            throw err;
        }

                /*
                 * 응답이 없으면 취소·시간 초과·오프라인을 구분한다. navigator.onLine은 false일 때만 오프라인 근거로 사용하며 그 밖의 원인은 단정하지 않는다.
                 */
        if (error.code === 'ECONNABORTED') {
            // 30초(timeout) 초과. 서버는 살아 있는데 느린 것이므로 회선 얘기를 꺼내면 안 된다.
            throw new Error('응답이 너무 늦어요. 잠시 후 다시 시도해주세요.');
        }
        if (globalThis.navigator?.onLine === false) {
            throw new Error('인터넷 연결이 끊겼어요.');
        }
        // 서버 다운 · 연결 거부 · DNS · CORS — 원인이 어디든 "연결이 안 됐다"는 사실은 참이다.
        // 범인을 지목하지 않으면서 다음 행동은 알려주는 문장.
        throw new Error('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    }
);

// async 인터셉터가 실행되기 전(같은 tick의 계정 전환 포함)에 호출 세대를 고정한다.
const scopedConfig = (config = {}) => ({ ...config, _sessionEpoch: config._sessionEpoch ?? currentSession().epoch });
const api = Object.assign(config => instance(scopedConfig(config)), instance);
for (const method of ['get', 'delete', 'head', 'options']) {
    api[method] = (url, config) => instance[method](url, scopedConfig(config));
}
for (const method of ['post', 'put', 'patch']) {
    api[method] = (url, data, config) => instance[method](url, data, scopedConfig(config));
}
api.request = config => instance(scopedConfig(config));

// 인터셉터는 AxiosResponse 대신 응답 데이터·null·Blob을 반환한다.
// 본문의 status는 업무 상태이므로 HTTP 상태와 구분한다.
/**
 * @typedef {Omit<import('axios').AxiosInstance, 'request' | 'get' | 'delete' | 'head' | 'options' | 'post' | 'put' | 'patch'> & {
 *   <T = any>(config: import('axios').AxiosRequestConfig): Promise<T>,
 *   request<T = any>(config: import('axios').AxiosRequestConfig): Promise<T>,
 *   get<T = any>(url: string, config?: import('axios').AxiosRequestConfig): Promise<T>,
 *   delete<T = any>(url: string, config?: import('axios').AxiosRequestConfig): Promise<T>,
 *   head<T = any>(url: string, config?: import('axios').AxiosRequestConfig): Promise<T>,
 *   options<T = any>(url: string, config?: import('axios').AxiosRequestConfig): Promise<T>,
 *   post<T = any>(url: string, data?: any, config?: import('axios').AxiosRequestConfig): Promise<T>,
 *   put<T = any>(url: string, data?: any, config?: import('axios').AxiosRequestConfig): Promise<T>,
 *   patch<T = any>(url: string, data?: any, config?: import('axios').AxiosRequestConfig): Promise<T>
 * }} PayloadApi
 */
export default /** @type {PayloadApi} */ (api);
