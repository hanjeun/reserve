import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoreForm } from '../useStoreForm';
import useStoreDraftPreferences from '../useStoreDraftPreferences';
import useAuthStore from '../../store/useAuthStore';
import { readStoreDraft, saveStoreDraft } from '../../utils/storeDraftStorage';
import { readRegistrationNavigation } from '../../utils/storeRegistrationNavigation';
import { storeService } from '../../services';

vi.mock('../../utils/storeDraftStorage', async (importOriginal) => ({
    ...(await importOriginal()),
    deleteStoreDraft: vi.fn().mockResolvedValue(undefined),
    fingerprintStoreDraftBase: vi.fn(() => 'base'),
    hydrateDraftImages: vi.fn(() => ({ files: [], objectUrls: [] })),
    hydrateStoreFormValues: vi.fn((values) => values),
    makeStoreDraftKey: vi.fn(({ userId, mode, storeId }) => (
        userId == null ? null : `member:${userId}:store:${mode}:${storeId ?? 'new'}`
    )),
    purgeExpiredStoreDrafts: vi.fn().mockResolvedValue(0),
    readStoreDraft: vi.fn().mockResolvedValue(null),
    saveStoreDraft: vi.fn().mockResolvedValue({ savedAt: 1 }),
}));

vi.mock('../../utils/form', () => ({ buildStoreFormData: vi.fn(() => new FormData()) }));
vi.mock('../../utils/storeRegistrationNavigation', async importOriginal => ({
    ...(await importOriginal()),
    readRegistrationNavigation: vi.fn(),
}));

vi.mock('../../services', async (importOriginal) => ({
    ...(await importOriginal()),
    storeService: { createStore: vi.fn().mockResolvedValue({}), updateStore: vi.fn().mockResolvedValue({}) },
}));

const form = {
    getFieldsValue: vi.fn(() => ({ name: '테스트 가게' })),
    setFieldsValue: vi.fn(),
};

const wrapper = ({ children }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
        <QueryClientProvider client={client}>
            <AntApp>
                <MemoryRouter>{children}</MemoryRouter>
            </AntApp>
        </QueryClientProvider>
    );
};
beforeEach(() => { readRegistrationNavigation.mockReset(); });

describe('useStoreForm draft scheduling', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
        useAuthStore.setState({
            user: { id: 7, role: 'BUSINESS' },
            isLoggedIn: true,
        });
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('saves after one second of idle time', async () => {
        const { result } = renderHook(() => useStoreForm({ form }), { wrapper });

        act(() => result.current.handleValuesChange());
        await act(async () => { vi.advanceTimersByTime(999); });
        expect(saveStoreDraft).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1);
            await Promise.resolve();
        });
        expect(saveStoreDraft).toHaveBeenCalledTimes(1);
    });

    it('flushes within five seconds while input keeps changing', async () => {
        const { result } = renderHook(() => useStoreForm({ form }), { wrapper });

        act(() => result.current.handleValuesChange());
        for (let elapsed = 900; elapsed <= 4500; elapsed += 900) {
            await act(async () => { vi.advanceTimersByTime(900); });
            act(() => result.current.handleValuesChange());
        }
        expect(saveStoreDraft).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(500);
            await Promise.resolve();
        });
        expect(saveStoreDraft).toHaveBeenCalledTimes(1);
    });

    it('cancels pending automatic writes and does not flush on pagehide or unmount after disabling', async () => {
        const preference = renderHook(() => useStoreDraftPreferences(useAuthStore(state => state.user)));
        const draft = renderHook(() => useStoreForm({ form }), { wrapper });
        act(() => draft.result.current.handleValuesChange());
        act(() => preference.result.current.setAutoSaveEnabled(false));
        await act(async () => { vi.advanceTimersByTime(5000); });
        act(() => window.dispatchEvent(new Event('pagehide')));
        draft.unmount();
        await act(async () => { await Promise.resolve(); });
        expect(saveStoreDraft).not.toHaveBeenCalled();
    });

    it('retains draft restoration and manual photo saves while automatic saving is disabled', async () => {
        localStorage.setItem('reserve:store-draft:auto-save:member:7', 'false');
        const { result } = renderHook(() => useStoreForm({ form }), { wrapper });
        await act(async () => { await Promise.resolve(); });
        expect(readStoreDraft).toHaveBeenCalledWith('member:7:store:create:new');
        const photo = { uid: 'photo', originFileObj: new File(['photo'], '사진.png', { type: 'image/png' }) };
        act(() => result.current.handleMainImageChange({ fileList: [photo] }));
        act(() => result.current.handleValuesChange());
        await act(async () => { vi.advanceTimersByTime(5000); });
        expect(saveStoreDraft).not.toHaveBeenCalled();
        await act(async () => { await result.current.saveDraftNow(); });
        expect(saveStoreDraft).toHaveBeenCalledWith(expect.objectContaining({
            key: 'member:7:store:create:new', mainImage: [photo], values: { name: '테스트 가게' },
        }));
        expect(result.current.draftState).toMatchObject({ status: 'saved', autoSaveEnabled: false });
    });

    it('lets an in-progress manual save finish when automatic saving is switched off', async () => {
        let finishSave;
        saveStoreDraft.mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
        const preference = renderHook(() => useStoreDraftPreferences(useAuthStore(state => state.user)));
        const draft = renderHook(() => useStoreForm({ form }), { wrapper });
        let pendingSave;
        await act(async () => {
            pendingSave = draft.result.current.saveDraftNow();
            await Promise.resolve();
        });
        act(() => preference.result.current.setAutoSaveEnabled(false));
        expect(draft.result.current.draftState).toMatchObject({ status: 'saving', autoSaveEnabled: false });
        await act(async () => {
            finishSave({ savedAt: 2 });
            await pendingSave;
        });
        expect(draft.result.current.draftState).toMatchObject({ status: 'saved', savedAt: 2, autoSaveEnabled: false });
    });

    it.each([
        ['account', { user: { id: 8, role: 'BUSINESS' } }],
        ['session', { sessionRevision: 91 }],
    ])('rejects old form writes after a %s transition', async (_name, nextState) => {
        useAuthStore.setState({ sessionRevision: 90 });
        const draft = renderHook(() => useStoreForm({ form }), { wrapper });
        act(() => draft.result.current.handleValuesChange());
        act(() => useAuthStore.setState(nextState));
        await act(async () => { vi.advanceTimersByTime(5000); });
        await act(async () => { await draft.result.current.saveDraftNow(); });
        draft.unmount();
        await act(async () => { await Promise.resolve(); });
        expect(saveStoreDraft).not.toHaveBeenCalled();
    });

    it('restores tab navigation before disk lookup even when automatic saving is disabled', async () => {
        localStorage.setItem('reserve:store-draft:auto-save:member:7', 'false');
        readRegistrationNavigation.mockReturnValue({
            values: { name: '돌아온 가게', _onboardingStep: 'identity' },
            mainImage: [], detailImages: [], changed: true,
            state: { status: 'pending', savedAt: 123, error: null },
        });
        const diskReads = readStoreDraft.mock.calls.length;
        const { result } = renderHook(() => useStoreForm({ form }), { wrapper });
        await act(async () => { await Promise.resolve(); });
        expect(form.setFieldsValue).toHaveBeenCalledWith(expect.objectContaining({
            name: '돌아온 가게', _onboardingStep: 'identity', mainImage: [], detailImages: [],
        }));
        expect(readStoreDraft.mock.calls).toHaveLength(diskReads);
        expect(result.current.draftState).toMatchObject({ status: 'saved', savedAt: 123, autoSaveEnabled: false });
    });

    it('applies only the current StrictMode navigation restore setup', async () => {
        readRegistrationNavigation.mockReturnValue({
            values: { name: 'StrictMode 복귀 가게', _onboardingStep: 'waiting' },
            mainImage: [], detailImages: [], changed: true,
            state: { status: 'idle', savedAt: null, error: null },
        });
        const strictWrapper = ({ children }) => <React.StrictMode>{wrapper({ children })}</React.StrictMode>;
        renderHook(() => useStoreForm({ form }), { wrapper: strictWrapper });
        await act(async () => { await Promise.resolve(); });
        const applies = form.setFieldsValue.mock.calls.filter(([values]) => values.name === 'StrictMode 복귀 가게');
        expect(applies).toHaveLength(1);
    });
});

describe('useStoreForm detail image order', () => {
    beforeEach(() => {
        localStorage.clear();
        window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
        useAuthStore.setState({ user: { id: 7, role: 'BUSINESS' }, isLoggedIn: true });
    });

    it('hydrates an explicitly disabled photo autoplay setting without replacing it with the default', () => {
        renderHook(() => useStoreForm({
            mode: 'edit', initialData: { id: 3, name: '가게', imageAutoplayEnabled: false }, storeId: 3, form,
        }), { wrapper });
        expect(form.setFieldsValue).toHaveBeenCalledWith(expect.objectContaining({ imageAutoplayEnabled: false }));
    });

    it('sends the on-screen order even when a new photo is dragged before existing ones', async () => {
        const initialData = { id: 3, name: '가게', detailImageUrls: ['https://cdn.example.test/a.png', 'https://cdn.example.test/b.png'] };
        const { result } = renderHook(
            () => useStoreForm({ mode: 'edit', initialData, storeId: 3, form }),
            { wrapper },
        );
        const [existingA, existingB] = result.current.detailImages;
        const newPhoto = { uid: 'new-1', name: 'new.png', originFileObj: new File(['x'], 'new.png', { type: 'image/png' }) };

        act(() => result.current.handleDetailImagesChange({ fileList: [newPhoto, existingB, existingA] }));
        await act(async () => { await result.current.handleSubmit({ name: '가게' }); });

        const sent = storeService.updateStore.mock.calls.at(-1)[1];
        expect(sent.getAll('existingDetailImageUrls')).toEqual(['https://cdn.example.test/b.png', 'https://cdn.example.test/a.png']);
        expect(sent.getAll('detailImages')).toHaveLength(1);
        expect(sent.getAll('detailImageOrder')).toEqual(['n0', 'e0', 'e1']);
    });
});
