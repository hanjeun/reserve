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
             * ?¸ì¦ ?íƒœ ?•ì¸
             * @param {boolean} force - trueë©?isLoggedIn ?íƒœ?€ ê´€ê³„ì—†???œë²„???”ì²­
             * 
             * ?œë‚˜ë¦¬ì˜¤:
             * 1. ???œìž‘ ??force=trueë¡??¸ì¶œ ???œë²„??ë¬´ì¡°ê±??”ì²­
             * 2. access_token ë§Œë£Œ ??401 ë°œìƒ ??axios ?¸í„°?‰í„°ê°€ /refresh ?¸ì¶œ
             * 3. refresh_token?¼ë¡œ ??access_token ë°œê¸‰ ???ëž˜ ?”ì²­ ?¬ì‹œ??
             * 4. refresh_token??ë§Œë£Œ ??ë¡œê·¸?„ì›ƒ ì²˜ë¦¬
             */
            checkAuth: async (force = false) => {
                // localStorage??ë¡œê·¸???íƒœê°€ ?†ê³ , ê°•ì œ ?¤í–‰???„ë‹ˆë©??¤í‚µ
                // ?? ???œìž‘ ?œì—??force=trueë¡??¸ì¶œ?˜ì—¬ refresh_token?¼ë¡œ ë³µêµ¬ ?œë„
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
                    // 401 ?ëŸ¬ ??axios ?¸í„°?‰í„°ê°€ refreshë¥??œë„?˜ê³ ,
                    // ê·¸ê²ƒ???¤íŒ¨?˜ë©´ ?¬ê¸°ë¡???
                    set({ user: null, isLoggedIn: false });
                    return null;
                }
            },

            /**
             * ??ì´ˆê¸°?????¸ì¦ ?íƒœ ë³µêµ¬ ?œë„
             * refresh_token??ì¿ í‚¤???ˆìœ¼ë©??ë™ ë¡œê·¸??
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
                    // ë¹„ë¡œê·¸ì¸ ?íƒœ (refresh ?¤íŒ¨ ?¬í•¨)
                    // localStorage??interceptor?ì„œ ? ì??˜ë?ë¡??¬ê¸°?œëŠ” Zustand ?íƒœë§??•ë¦¬
                    set({ user: null, isLoggedIn: false });
                    return null;
                }
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                isLoggedIn: state.isLoggedIn,
            }),
        }
    )
);

export default useAuthStore;
