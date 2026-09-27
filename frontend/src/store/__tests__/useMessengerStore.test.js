import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useAuthStore from '../useAuthStore';
import useMessengerStore from '../useMessengerStore';

// 인증의 observable 경계만 사용한다. 실제 auth persist·HTTP·브라우저 저장소는 불러오지 않는다.
vi.mock('../useAuthStore', async () => {
    const { create } = await import('zustand');
    return { default: create(() => ({ user: null, sessionRevision: 0 })) };
});

const owner = { id: 7, email: 'owner@example.test', role: 'BUSINESS' };
const other = { id: 8, email: 'other@example.test', role: 'USER' };
const initialState = () => ({
    open: false,
    view: 'home',
    activeThread: false,
    selection: { kind: 'support' },
    sessionIdentity: null,
    drafts: {},
});
const store = () => useMessengerStore.getState();

describe('useMessengerStore session drafts and entry points', () => {
    beforeEach(() => {
        useAuthStore.setState({ user: null, sessionRevision: 0 });
        useMessengerStore.setState(initialState());
        useAuthStore.setState({ user: owner, sessionRevision: 1 });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        useAuthStore.setState({ user: null, sessionRevision: 0 });
        useMessengerStore.setState(initialState());
    });

    it('keeps support, customer-store, and owner-room drafts separate', () => {
        store().setDraft('support', '서비스 문의');
        store().setDraft('store:31', '손님으로 남길 문의');
        store().setDraft('owner:21', '사장님으로 남길 답변');
        store().openStore(31);
        store().openOwnerRoom(21);
        store().openSupport();

        expect(store().drafts).toEqual({
            support: '서비스 문의',
            'store:31': '손님으로 남길 문의',
            'owner:21': '사장님으로 남길 답변',
        });
    });

    it('caps each draft at 2000 characters and removes only a cleared draft', () => {
        store().setDraft('store:31', '가'.repeat(2001));
        store().setDraft('owner:21', '보존할 답변');

        expect(store().drafts['store:31']).toBe('가'.repeat(2000));
        store().setDraft('store:31', '');
        expect(store().drafts).toEqual({ 'owner:21': '보존할 답변' });
        store().setDraft('owner:21', null);
        expect(store().drafts).toEqual({});
    });

    it('caps drafts at 20 and evicts the least recently edited conversation', () => {
        for (let index = 0; index < 20; index += 1) {
            store().setDraft(`store:${index}`, `초안 ${index}`);
        }
        store().setDraft('store:0', '다시 편집한 초안');
        store().setDraft('store:20', '새 대화 초안');

        expect(Object.keys(store().drafts)).toHaveLength(20);
        expect(store().drafts['store:1']).toBeUndefined();
        expect(store().drafts['store:0']).toBe('다시 편집한 초안');
        expect(store().drafts['store:20']).toBe('새 대화 초안');
        expect(Object.keys(store().drafts)[0]).toBe('store:2');
    });

    it('opens the launcher home rather than resuming a previously selected thread', () => {
        store().openStore(31);
        store().closePanel();
        store().openPanel();

        expect(store()).toMatchObject({ open: true, view: 'home', activeThread: false });
        store().togglePanel();
        expect(store().open).toBe(false);
        store().togglePanel();
        expect(store()).toMatchObject({ open: true, view: 'home', activeThread: false });
    });

    it.each([
        ['openSupport', [], { kind: 'support' }],
        ['openStore', ['31'], { kind: 'store', storeId: 31 }],
        ['openOwnerRoom', ['21'], { kind: 'owner', roomId: 21 }],
    ])('opens a direct conversation with %s', (action, argumentsList, selection) => {
        store()[action](...argumentsList);

        expect(store()).toMatchObject({
            open: true, view: 'conversations', activeThread: true, selection,
        });
    });

    it('keeps drafts when closing a panel or moving back to home and conversations', () => {
        store().setDraft('store:31', '전송 전 초안');
        store().openStore(31);
        store().closePanel();

        expect(store().open).toBe(false);
        expect(store().drafts['store:31']).toBe('전송 전 초안');
        store().showHome();
        expect(store()).toMatchObject({ view: 'home', activeThread: false });
        store().showConversations();
        expect(store()).toMatchObject({ view: 'conversations', activeThread: false });
        store().showSettings();
        expect(store()).toMatchObject({ view: 'settings', activeThread: false });
        expect(store().drafts['store:31']).toBe('전송 전 초안');
    });

    it.each([
        ['logout', { user: null, sessionRevision: 2 }, 'anonymous:2'],
        ['account switch', { user: other, sessionRevision: 2 }, '8:USER:2'],
        ['same-account login', { user: owner, sessionRevision: 2 }, '7:BUSINESS:2'],
        ['role change', { user: { ...owner, role: 'ADMIN' }, sessionRevision: 1 }, '7:ADMIN:1'],
    ])('immediately clears session data on %s without a mounted shell', (_label, auth, identity) => {
        store().openStore(31);
        store().setDraft('store:31', '이전 세션 초안');

        useAuthStore.setState(auth);

        expect(store()).toMatchObject({
            open: false,
            view: 'home',
            activeThread: false,
            selection: { kind: 'support' },
            sessionIdentity: identity,
            drafts: {},
        });
    });

    it('keeps drafts on a profile update within the same session identity', () => {
        store().setDraft('store:31', '계속 편집할 초안');
        const identity = store().sessionIdentity;

        useAuthStore.setState({ user: { ...owner, name: '바뀐 이름' }, sessionRevision: 1 });
        store().syncIdentity(identity);

        expect(store().sessionIdentity).toBe(identity);
        expect(store().drafts['store:31']).toBe('계속 편집할 초안');
    });

    it('rejects late writes and clears captured by an earlier session', () => {
        const previousIdentity = store().sessionIdentity;
        store().setDraft('store:31', '이전 초안', previousIdentity);
        useAuthStore.setState({ user: owner, sessionRevision: 2 });
        store().setDraft('store:31', '새 세션 초안');

        store().setDraft('store:31', '늦게 도착한 전송 실패', previousIdentity);
        store().setDraft('owner:21', '다른 대화의 늦은 초안', previousIdentity);
        store().setDraft('store:31', '', previousIdentity);

        expect(store().drafts).toEqual({ 'store:31': '새 세션 초안' });
    });

    it('never persists draft operations or identity transitions to browser storage', () => {
        const storageReads = vi.spyOn(Storage.prototype, 'getItem');
        const storageWrites = vi.spyOn(Storage.prototype, 'setItem');
        const storageRemovals = vi.spyOn(Storage.prototype, 'removeItem');
        store().openStore(31);
        store().setDraft('store:31', '메모리에만 있는 초안');
        store().closePanel();
        store().openPanel();
        useAuthStore.setState({ user: other, sessionRevision: 2 });

        expect(storageReads).not.toHaveBeenCalled();
        expect(storageWrites).not.toHaveBeenCalled();
        expect(storageRemovals).not.toHaveBeenCalled();
        expect(useMessengerStore.persist).toBeUndefined();
    });
});
