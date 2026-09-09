import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';
import { advanceSession, currentSession, isCurrentSession } from '../api/sessionScope';
import useLocationStore from './useLocationStore';

const STARTUP_AUTH_RETRY_DELAYS_MS = [400, 1200];
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const isTransientAuthError = (error) => {
    if (error?.isSessionExpired || error?.isStaleSession) return false;
    return error?.status == null || error.status === 408 || error.status === 429 || error.status >= 500;
};

const identity = user => user ? `${user.id ?? user.email}:${user.role}` : 'anonymous';
const applyUser = (set, get, user, force = false) => {
    const changed = force || identity(get().user) !== identity(user);
    const sessionRevision = changed ? advanceSession() : currentSession().epoch;
    if (changed) useLocationStore.getState().setLiveLocation(null);
    set({ user, isLoggedIn: Boolean(user), isLoggingOut: false, sessionRevision });
};

const useAuthStore = create(
    persist(
        (set, get) => ({
            user: null,
            sessionRevision: currentSession().epoch,
            isLoggedIn: false,
            isLoggingOut: false,

            setLoggingOut: (val) => set({ isLoggingOut: val }),

            login: (userData) => applyUser(set, get, userData, true),

            // 프로필 표시 갱신은 새 로그인과 다르다. 다른 계정의 늦은 콜백은 반영하지 않는다.
            updateUser: (userData) => {
                if (identity(get().user) === identity(userData)) applyUser(set, get, userData);
            },

            logout: () => {
                applyUser(set, get, null, true);
                set({ isLoggingOut: true });
                localStorage.removeItem('auth-storage');
            },

            /**
             * 인증 상태 확인
             * force=true면 서버에 무조건 요청
             */
            checkAuth: async (force = false, options = {}) => {
                if (!get().isLoggedIn && !force) return null;
                const { rethrowTransient = false, timeout } = options;
                const started = currentSession().epoch;
                try {
                    const userData = await api.get('/api/member/me', timeout ? { timeout } : undefined);
                    if (!isCurrentSession(started)) return null;
                    if (userData && userData.email) {
                        applyUser(set, get, userData);
                        return userData;
                    }
                    applyUser(set, get, null);
                    return null;
                } catch (err) {
                    if (!isCurrentSession(started)) return null;
                    // 인증 만료(401/403) 또는 세션 만료가 확정된 경우에만 로그아웃 처리
                    // 네트워크 오류 등 일시적인 문제로는 기존 로그인 상태를 유지
                    if (err?.status === 401 || err?.status === 403 || err?.isSessionExpired) {
                        applyUser(set, get, null);
                    } else if (rethrowTransient) {
                        throw err;
                    }
                    return null;
                }
            },

            /**
             * 앱 초기화 시 인증 상태 복구
             */
            initializeAuth: async () => {
                for (let attempt = 0; attempt <= STARTUP_AUTH_RETRY_DELAYS_MS.length; attempt += 1) {
                    if (attempt > 0) await wait(STARTUP_AUTH_RETRY_DELAYS_MS[attempt - 1]);
                    try {
                        return await get().checkAuth(true, { rethrowTransient: true, timeout: 8000 });
                    } catch (error) {
                        if (!isTransientAuthError(error) || attempt === STARTUP_AUTH_RETRY_DELAYS_MS.length) {
                            return null;
                        }
                    }
                }
                return null;
            },
        }),
        {
            name: 'auth-storage',
            // localStorage에는 UI 표시용 데이터만 저장
            // 실제 인증/권한 검증은 100% 쿠키 토큰에 위임
            partialize: (state) => ({
                user: state.user ? {
                    id:                       state.user.id,
                    name:                     state.user.name,
                    email:                    state.user.email,
                    role:                     state.user.role,
                    profileImage:             state.user.profileImage,
                    profileImageUrl:          state.user.profileImageUrl,   // 소셜 로그인 프로필 URL 없는 필드에 대비
                    emailNotificationEnabled: state.user.emailNotificationEnabled,
                    termsAgreed:              state.user.termsAgreed,
                    phone:                    state.user.phone,
                    status:                   state.user.status,
                    suspendedUntil:           state.user.suspendedUntil,
                    suspendReason:            state.user.suspendReason,
                } : null,
                isLoggedIn: state.isLoggedIn,
            }),
        }
    )
);

// 같은 출처의 다른 탭도 쿠키를 공유한다. 계정이 바뀌면 이전 화면/요청을 폐기하고 서버에서 다시 인증한다.
if (typeof window !== 'undefined') {
    const onStorage = event => {
        if (event.key !== 'auth-storage' && event.key !== null) return;
        let externalUser = null;
        try { externalUser = event.newValue ? JSON.parse(event.newValue)?.state?.user : null; }
        catch { /* 손상된 저장값도 인증 근거로 사용하지 않는다. */ }
        if (identity(externalUser) !== identity(useAuthStore.getState().user)) {
            advanceSession();
            window.location.reload();
        }
    };
    window.addEventListener('storage', onStorage);
    import.meta.hot?.dispose(() => window.removeEventListener('storage', onStorage));
}

export default useAuthStore;
