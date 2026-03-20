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
             * @param {boolean} force - true면 isLoggedIn 상태에 관계없이 서버에 요청
             *
             * 시나리오:
             * 1. 앱 시작 시 force=true로 호출 → 서버에 무조건 요청
             * 2. access_token 만료 시 401 발생 → axios 인터셉터가 /refresh 호출
             * 3. refresh_token으로 새 access_token 발급 → 원래 요청 재시도
             * 4. refresh_token도 만료 → 로그아웃 처리
             */
            checkAuth: async (force = false) => {
                // localStorage에 로그인 상태가 없고, 강제 실행이 아니면 스킵
                if (!get().isLoggedIn && !force) {
                    return null;
                }

                try {
                    const userData = await api.get('/api/member/me');

                    if (userData && userData.email) {
                        set({ user: userData, isLoggedIn: true });
                        return userData;
                    }

                    set({ user: null, isLoggedIn: false });
                    return null;
                } catch {
                    // 401 에러 시 axios 인터셉터가 refresh를 시도하고,
                    // 그것도 실패하면 여기로 옴
                    set({ user: null, isLoggedIn: false });
                    return null;
                }
            },

            /**
             * 앱 초기화 시 인증 상태 복구 시도
             * refresh_token이 쿠키에 있으면 자동 로그인
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
                } catch {
                    // 비로그인 상태 (refresh 실패 포함)
                    // localStorage는 interceptor에서 정리하고, Zustand 상태만 정리
                    set({ user: null, isLoggedIn: false });
                    return null;
                }
            },
        }),
        {
            name: 'auth-storage',
            // localStorage에는 UI 표시용 데이터만 저장 (password 제외)
            // 실제 인증/권한 검증은 100% 쿠키 토큰에 위임
            partialize: (state) => ({
                user: state.user ? {
                    name:  state.user.name,
                    email: state.user.email,
                    role:  state.user.role,
                    profileImage: state.user.profileImage,
                    emailNotificationEnabled: state.user.emailNotificationEnabled,
                    phone: state.user.phone,
                } : null,
                isLoggedIn: state.isLoggedIn,
            }),
        }
    )
);

export default useAuthStore;
