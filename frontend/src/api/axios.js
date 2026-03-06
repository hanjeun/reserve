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
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
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

        // 401 에러이고, 재시도하지 않은 요청이며, refresh 요청이 아닌 경우
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/api/auth/refresh')
        ) {
            // 이미 재발급 중이면 대기열에 추가
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(() => {
                    return instance(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // refresh_token으로 새 access_token 발급 시도
                await instance.post('/api/auth/refresh');
                
                processQueue(null);
                
                // 원래 요청 재시도
                return instance(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError);

                const isInitCall = originalRequest.url?.includes('/api/member/me');

                if (isInitCall) {
                    // 앱 초기화 시 refresh 실패 = 단순 비로그인 상태
                    // localStorage 유지, 리다이렉트 없음
                } else {
                    // 세션 진행 중 만료
                    localStorage.removeItem('auth-storage');
                    if (!window.location.pathname.includes('/login')) {
                        window.location.href = '/login';
                    }
                }

                return Promise.reject('세션이 만료되었습니다. 다시 로그인해주세요.');
            } finally {
                isRefreshing = false;
            }
        }

        // 401이 아닌 다른 에러
        if (error.response) {
            return Promise.reject(error.response.data?.message || '서버 에러가 발생했습니다.');
        }
        
        return Promise.reject(error.message || '네트워크 에러가 발생했습니다.');
    }
);

export default instance;
