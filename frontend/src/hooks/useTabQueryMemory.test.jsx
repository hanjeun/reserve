import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { WorkspaceActivityContext } from '../components/layout/workspaceActivity';
import useTabQueryMemory from './useTabQueryMemory';

const auth = vi.hoisted(() => ({ user: null, sessionRevision: 1 }));
vi.mock('../store/useAuthStore', () => ({ default: selector => selector(auth) }));

const KEYS = { members: ['search', 'page'], stores: ['domain', 'page'] };
const initialProps = { scope: '/admin', tab: 'members', search: 'search=member&page=3&domain=FOOD' };
const useMemory = ({ scope, tab, search }) => useTabQueryMemory(scope, tab, search, KEYS);

beforeEach(() => {
    auth.user = { id: 7, role: 'ADMIN' };
    auth.sessionRevision = 1;
});

describe('tab query memory boundaries', () => {
    it('remembers each tab without retaining another tab keys or attribution', () => {
        const { result, rerender } = renderHook(useMemory, { initialProps });
        rerender({ ...initialProps, tab: 'stores', search: 'domain=FOOD&page=2&search=ignored&utm_source=guide' });

        expect(result.current('members')).toBe('search=member&page=3');
        expect(result.current('stores')).toBe('domain=FOOD&page=2');
    });

    it('does not overwrite a hidden panel memory with the active panel URL', () => {
        let active = true;
        const wrapper = ({ children }) => <WorkspaceActivityContext.Provider value={active}>{children}</WorkspaceActivityContext.Provider>;
        const { result, rerender } = renderHook(useMemory, { initialProps, wrapper });
        active = false;
        rerender({ ...initialProps, search: 'search=unrelated&page=99' });

        expect(result.current('members')).toBe('search=member&page=3');
    });

    it.each(['account', 'session', 'role', 'scope'])('discards inactive memory and old callbacks after a %s change', change => {
        const { result, rerender } = renderHook(useMemory, { initialProps });
        const oldCallback = result.current;
        rerender({ ...initialProps, tab: 'stores', search: 'domain=all&page=2' });
        if (change === 'account') auth.user = { id: 8, role: 'ADMIN' };
        if (change === 'session') auth.sessionRevision = 2;
        if (change === 'role') auth.user = { id: 7, role: 'BUSINESS' };
        rerender({ ...initialProps, scope: change === 'scope' ? '/business' : '/admin', tab: 'stores', search: 'domain=all&page=2' });

        expect(result.current('members')).toBeUndefined();
        expect(oldCallback('members')).toBeUndefined();
        expect(result.current('stores')).toBe('domain=all&page=2');
    });
});
