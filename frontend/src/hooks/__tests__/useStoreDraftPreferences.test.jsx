import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useAuthStore from '../../store/useAuthStore';
import useStoreDraftPreferences from '../useStoreDraftPreferences';

const owner = { id: 7, role: 'BUSINESS' };
const otherOwner = { id: 8, role: 'ADMIN' };
const settingKey = id => `reserve:store-draft:auto-save:member:${id}`;
const usePreference = () => useStoreDraftPreferences(useAuthStore(state => state.user));

describe('account-scoped store draft preference', () => {
    beforeEach(() => {
        localStorage.clear();
        window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
        useAuthStore.setState({ user: owner, isLoggedIn: true });
    });

    it('defaults on and shares changes between consumers without carrying them to another account', () => {
        const first = renderHook(usePreference);
        const second = renderHook(usePreference);
        expect(first.result.current.autoSaveEnabled).toBe(true);
        act(() => first.result.current.setAutoSaveEnabled(false));
        expect(second.result.current.autoSaveEnabled).toBe(false);
        expect(localStorage.getItem(settingKey(7))).toBe('false');

        const oldSetter = first.result.current.setAutoSaveEnabled;
        act(() => useAuthStore.setState({ user: otherOwner }));
        expect(first.result.current.autoSaveEnabled).toBe(true);
        act(() => oldSetter(true));
        expect(localStorage.getItem(settingKey(7))).toBe('false');
        expect(localStorage.getItem(settingKey(8))).toBeNull();
        act(() => useAuthStore.setState({ user: owner }));
        expect(first.result.current.autoSaveEnabled).toBe(false);
    });

    it('synchronizes another tab and prevents normal or signed-out accounts from changing the preference', () => {
        const hook = renderHook(usePreference);
        act(() => {
            localStorage.setItem(settingKey(7), 'false');
            window.dispatchEvent(new StorageEvent('storage', { key: settingKey(7), storageArea: localStorage }));
        });
        expect(hook.result.current.autoSaveEnabled).toBe(false);
        for (const user of [{ id: 7, role: 'USER' }, null]) {
            act(() => useAuthStore.setState({ user }));
            expect(hook.result.current.autoSaveEnabled).toBe(false);
            act(() => hook.result.current.setAutoSaveEnabled(true));
            expect(localStorage.getItem(settingKey(7))).toBe('false');
        }
    });

    it('honors a disabled preference in memory when browser writes are unavailable', () => {
        const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
        const hook = renderHook(usePreference);
        act(() => hook.result.current.setAutoSaveEnabled(false));
        expect(hook.result.current.autoSaveEnabled).toBe(false);
        write.mockRestore();
    });
});
