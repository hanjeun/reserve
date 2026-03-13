import axios from 'axios';
import { skeletonDelayInterceptor } from '../utils/skeletonDelay';

const instance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
    withCredentials: true,  // 쿠키 자동 전송 (access_token, refresh_token)
    timeout: 10000,
});

// 토큰 재발급 중인지 추적
let isRefreshing = false;
// 재발급 대기 중인 요청들
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) prom.reject(error);
        else prom.resolve(token);
    });
    failedQueue = [];
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
    (error) => Promise.reject(error)
);

// Response Interceptor: ApiResponse 처리 + 토큰 자동 재발급
instance.interceptors.response.use(
    (response) => {
        const res = response.data;
        if (res.success) return res.data;
        return Promise.reject({ message: res.message });
    },
    async (error) => {
        const originalRequest = error.config;

        // 401: 토큰 만료 → refresh 시도
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/api/auth/refresh')
        ) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(() => instance(originalRequest))
                  .catch(err => Promise.reject(err));
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
                    if (!window.location.pathname.includes('/login')) {
                        window.location.href = '/login';
                    }
                }

                return Promise.reject({ message: '다시 로그인해주세요.', isSessionExpired: true });
            } finally {
                isRefreshing = false;
            }
        }

        // 그 외 에러
        if (error.response) {
            const serverMsg = error.response.data?.message;
            const status = error.response.status;

            // 서버가 직접 메시지를 내려주면 그대로 사용
            if (serverMsg) return Promise.reject(serverMsg);

            // 서버 메시지 없을 때 상태 코드별 기본 메시지
            if (status === 403) return Promise.reject('권한이 없습니다.');
            if (status === 404) return Promise.reject('정보를 찾을 수 없습니다.');
            if (status === 409) return Promise.reject('이미 사용 중입니다.');
            if (status === 429) return Promise.reject('잠시 후 다시 시도해주세요.');
            if (status >= 500) return Promise.reject('서버 오류가 발생했습니다.');
            return Promise.reject('요청에 실패했습니다.');
        }

        // 네트워크 오류
        return Promise.reject('네트워크를 확인해주세요.');
    }
);

export default instance;
