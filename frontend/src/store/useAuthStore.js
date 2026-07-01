import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';

const useAuthStore = create(
    persist(
        (set, get) => ({
            user: null,
            isLoggedIn: false,
            isLoggingOut: false,

            setLoggingOut: (val) => set({ isLoggingOut: val }),

            login: (userData) => set({ user: userData, isLoggedIn: true, isLoggingOut: false }),

            logout: () => {
                set({ isLoggingOut: true });
                set({ user: null, isLoggedIn: false });
                localStorage.removeItem('auth-storage');
            },

            /**
             * 인증 상태 확인
             * force=true면 서버에 무조건 요청
             */
            checkAuth: async (force = false) => {
                if (!get().isLoggedIn && !force) return null;
                try {
                    const userData = await api.get('/api/member/me');
                    if (userData && userData.email) {
                        set({ user: userData, isLoggedIn: true });
                        return userData;
                    }
                    set({ user: null, isLoggedIn: false });
                    return null;
                } catch (err) {
                    // 인증 만료(401/403) 또는 세션 만료가 확정된 경우에만 로그아웃 처리
                    // 네트워크 오류 등 일시적인 문제로는 기존 로그인 상태를 유지
                    if (err?.status === 401 || err?.status === 403 || err?.isSessionExpired) {
                        set({ user: null, isLoggedIn: false });
                    }
                    return null;
                }
            },

            /**
             * 앱 초기화 시 인증 상태 복구
             */
            initializeAuth: async () => {
                try {
                    const userData = await api.get('/api/member/me');
                    if (userData?.email) {
                        set({ user: userData, isLoggedIn: true });
                        return userData;
                    }
                    set({ user: null, isLoggedIn: false });
                    return null;
                } catch (err) {
                    if (err?.status === 401 || err?.status === 403 || err?.isSessionExpired) {
                        set({ user: null, isLoggedIn: false });
                    }
                    return null;
                }
            },
        }),
        {
            name: 'auth-storage',
            // localStorage에는 UI 표시용 데이터만 저장
            // 실제 인증/권한 검증은 100% 쿠키 토큰에 위임
            partialize: (state) => ({
                user: state.user ? {
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

export default useAuthStore;
