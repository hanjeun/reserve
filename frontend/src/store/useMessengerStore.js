import { create } from 'zustand';
import useAuthStore from './useAuthStore';

const memberSupport = () => ({ kind: 'support' });
export const messengerIdentityOf = ({ user, sessionRevision }) => user
    ? `${user.id ?? user.email}:${user.role}:${sessionRevision}`
    : `anonymous:${sessionRevision}`;
const MAX_DRAFTS = 20;
const MAX_DRAFT_LENGTH = 2000;

/**
 * MessengerShell의 화면 상태와 세션 메모리 초안. DB·localStorage에는 입력을 저장하지 않는다.
 * 대화별 초안은 최대 20개/2000자이며 새로고침·로그아웃·재로그인 때 초기화한다.
 */
const useMessengerStore = create((set, get) => ({
    open: false,
    view: 'home',
    activeThread: false,
    selection: memberSupport(),
    sessionIdentity: messengerIdentityOf(useAuthStore.getState()),
    drafts: {},

    syncIdentity: (identity) => {
        if (get().sessionIdentity === identity) return;
        set({ open: false, view: 'home', activeThread: false, selection: memberSupport(), drafts: {}, sessionIdentity: identity });
    },
    openSupport: () => set({ open: true, view: 'conversations', activeThread: true, selection: memberSupport() }),
    openStore: (storeId) => set({
        open: true,
        view: 'conversations',
        activeThread: true,
        selection: { kind: 'store', storeId: Number(storeId) },
    }),
    openOwnerRoom: (roomId) => set({
        open: true,
        view: 'conversations',
        activeThread: true,
        selection: { kind: 'owner', roomId: Number(roomId) },
    }),
    select: (selection) => set({ selection, view: 'conversations', activeThread: true }),
    showHome: () => set({ view: 'home', activeThread: false }),
    showConversations: () => set({ view: 'conversations', activeThread: false }),
    showSettings: () => set({ view: 'settings', activeThread: false }),
    setDraft: (key, text, identity = get().sessionIdentity) => {
        if (identity !== get().sessionIdentity) return;
        const value = String(text ?? '').slice(0, MAX_DRAFT_LENGTH);
        set((state) => {
            const drafts = { ...state.drafts };
            delete drafts[key];
            if (value) drafts[key] = value;
            const keys = Object.keys(drafts);
            keys.slice(0, Math.max(0, keys.length - MAX_DRAFTS)).forEach(old => delete drafts[old]);
            return { drafts };
        });
    },
    openPanel: () => set({ open: true, view: 'home', activeThread: false }),
    closePanel: () => set({ open: false }),
    togglePanel: () => set((state) => state.open
        ? { open: false }
        : { open: true, view: 'home', activeThread: false }),
}));

// Shell이 없는 순간에도 계정 전환과 같은 계정 재로그인의 초안을 즉시 폐기한다.
useAuthStore.subscribe((state, previous) => {
    if (messengerIdentityOf(state) !== messengerIdentityOf(previous)) {
        useMessengerStore.getState().syncIdentity(messengerIdentityOf(state));
    }
});

export default useMessengerStore;
