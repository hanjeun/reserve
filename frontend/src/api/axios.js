import axios from 'axios';
import { skeletonDelayInterceptor } from '../utils/skeletonDelay';

const instance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    withCredentials: true,  // 쿠키 자동 전송 (access_token, refresh_token)
    timeout: 30000,         // 30초 (이미지 업로드 등 대용량 요청 대비)
});

let isRefreshing = false;
let failedQueue  = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) prom.reject(error);
        else prom.resolve(token);
    });
    failedQueue = [];
};

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

const isAuthEndpoint = (url) => AUTH_BYPASS_ROUTES.some(route => url?.includes(route));

// 상태 코드별 기본 에러 메시지
const getStatusMessage = (status) => {
    if (status === 403) return '권한이 없습니다.';
    if (status === 404) return '정보를 찾을 수 없습니다.';
    if (status === 409) return '이미 사용 중입니다.';
    if (status === 429) return '잠시 후 다시 시도해주세요.';
    if (status >= 500) return '서버 오류가 발생했습니다.';
    return '요청에 실패했습니다.';
};

// 401 처리: 토큰 재발급 또는 대기열 처리
const handle401 = async (originalRequest) => {
    if (isRefreshing) {
        return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
        })
            .then(() => instance(originalRequest))
            .catch(err => { throw err; });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
        await instance.post('/api/auth/refresh');
        processQueue(null);
        return instance(originalRequest);
    } catch (refreshError) {
        processQueue(refreshError);
        const isInitCall = originalRequest.url?.includes('/api/member/me');
        if (!isInitCall) {
            localStorage.removeItem('auth-storage');
            if (!globalThis.location.pathname.includes('/login')) {
                globalThis.location.href = '/login';
            }
        }
        throw new SessionExpiredError();
    } finally {
        isRefreshing = false;
    }
};

// Request Interceptor: Content-Type 자동 설정 + 개발 환경 스켈레톤 딜레이
instance.interceptors.request.use(
    async (config) => {
        await skeletonDelayInterceptor(config);
        if (!(config.data instanceof FormData)) {
            config.headers['Content-Type'] = 'application/json';
        }
        return config;
    },
    (error) => { throw error; }
);

// Response Interceptor: ApiResponse 처리 + 토큰 자동 재발급
instance.interceptors.response.use(
    (response) => {
        const res = response.data;
        if (res.success) return res.data;
        throw new Error(res.message ?? '요청에 실패했습니다.');
    },
    async (error) => {
        const originalRequest = error.config;

        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/api/auth/refresh') &&
            !isAuthEndpoint(originalRequest.url)
        ) {
            return handle401(originalRequest);
        }

        if (error.response) {
            const msg = error.response.data?.message || getStatusMessage(error.response.status);
            const err = new Error(msg);
            // 구조화된 에러 데이터(예: 정지 status/until/reason)를 손실 없이 동행
            // 호출측에서 err.data로 접근 가능 (e.g. err.data?.reason)
            err.data = error.response.data?.data;
            err.status = error.response.status;
            throw err;
        }

                /*
         * 여기까지 왔다 = 응답을 **아예 못 받았다**. 원인이 셋인데 셋 다 다른 얘기다.
         *
         * ★ 예전엔 전부 "네트워크를 확인해주세요" 였다(2026-08-29 수정).
         *   셋 중 둘은 손님이 확인할 게 없는 상황인데 손님 회선을 범인으로 지목했다.
         *   개발 중엔 백엔드를 껐을 뿐인데 와이파이를 의심하게 만든다.
         *
         * ★ 그리고 진짜 오프라인이면 `OfflineBanner` 가 이미 상단에 그 말을 하고 있다
         *   (`useOnlineStatus`). 즉 **배너가 없는데 이 토스트가 뜬다 = 회선은 멀쩡하다**가
         *   이미 확정된 상태다. 앱이 아는 걸 토스트만 모르고 엉뚱한 데를 가리키고 있었다.
         *
         * `navigator.onLine` 은 false 일 때만 믿는다 — true 는 "인터페이스가 살아있다"까지만
         * 보장한다(useOnlineStatus 주석 참고). 여기선 그 비대칭이 맞게 작동한다:
         * false 면 오프라인이 확실하고, true 면 원인을 단정하지 않는 문장으로 빠진다.
         */
        if (error.code === 'ECONNABORTED') {
            // 30초(timeout) 초과. 서버는 살아 있는데 느린 것이므로 회선 얘기를 꺼내면 안 된다.
            throw new Error('응답이 너무 늦어요. 잠시 후 다시 시도해주세요.');
        }
        if (globalThis.navigator?.onLine === false) {
            throw new Error('인터넷 연결이 끊겼습니다.');
        }
        // 서버 다운 · 연결 거부 · DNS · CORS — 원인이 어디든 "연결이 안 됐다"는 사실은 참이다.
        // 범인을 지목하지 않으면서 다음 행동은 알려주는 문장.
        throw new Error('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    }
);

export default instance;
