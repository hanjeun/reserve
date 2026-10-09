import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    RECENT_SEARCH_LIMIT,
    RECENT_SEARCH_MAX_LENGTH,
    RECENT_SEARCH_STORAGE_KEY,
    addRecentSearch,
    clearRecentSearches,
    installRecentSearchPrivacyBoundary,
    readRecentSearches,
    recentSearchOwner,
    removeRecentSearch,
} from '../recentSearches';

const authFixture = initial => {
    let state = initial;
    const listeners = new Set();
    return {
        getState: () => state,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        change: patch => {
            const previous = state;
            state = { ...state, ...patch };
            listeners.forEach(listener => listener(state, previous));
        },
    };
};

describe('browser recent search bounds and privacy', () => {
    beforeEach(() => clearRecentSearches());
    afterEach(() => vi.restoreAllMocks());

    it('keeps a bounded newest-first list and moves an existing term to the front', () => {
        for (let i = 0; i < RECENT_SEARCH_LIMIT + 4; i++) addRecentSearch('guest', `검색 ${i}`);
        const terms = readRecentSearches('guest');
        expect(terms).toHaveLength(RECENT_SEARCH_LIMIT);
        expect(terms[0]).toBe('검색 13');
        expect(terms.at(-1)).toBe('검색 4');
        addRecentSearch('guest', '  검색 7  ');
        expect(readRecentSearches('guest')).toEqual(['검색 7', ...terms.filter(term => term !== '검색 7')]);
    });

    it('skips empty, control-character and oversized terms without changing valid history', () => {
        addRecentSearch('guest', '안산 공방');
        for (const term of ['   ', '줄\n바꿈', '가'.repeat(RECENT_SEARCH_MAX_LENGTH + 1)]) {
            addRecentSearch('guest', term);
        }
        expect(readRecentSearches('guest')).toEqual(['안산 공방']);
    });

    it('removes one term and clears all persisted history', () => {
        addRecentSearch('guest', '안산 공방');
        addRecentSearch('guest', '서울 스튜디오');
        expect(removeRecentSearch('guest', '안산 공방')).toEqual(['서울 스튜디오']);
        clearRecentSearches();
        expect(readRecentSearches('guest')).toEqual([]);
        expect(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)).toBeNull();
    });

    it('hides another account history and excludes email from the owner', () => {
        const owner = recentSearchOwner({ id: 7, email: 'member@example.test' });
        addRecentSearch(owner, '안산 공방');
        expect(owner).toBe('member:7');
        expect(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)).not.toContain('member@example.test');
        expect(readRecentSearches('member:8')).toEqual([]);
        expect(readRecentSearches('guest')).toEqual([]);
        expect(recentSearchOwner({ email: 'member@example.test' })).toBeNull();
    });

    it('clears history for login, logout and account change without requiring an open search page', () => {
        const auth = authFixture({ user: null, sessionRevision: 0 });
        const dispose = installRecentSearchPrivacyBoundary(auth);
        try {
            addRecentSearch('guest', '공방');
            auth.change({ user: { id: 7 }, sessionRevision: 1 });
            expect(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)).toBeNull();
            addRecentSearch('member:7', '클리닉');
            auth.change({ user: { id: 8 }, sessionRevision: 2 });
            expect(readRecentSearches('member:7')).toEqual([]);
            addRecentSearch('member:8', '스튜디오');
            auth.change({ user: null, sessionRevision: 3 });
            expect(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)).toBeNull();
        } finally {
            dispose();
        }
    });

    it('keeps profile display updates but clears a new session for the same member', () => {
        const auth = authFixture({ user: { id: 7, name: '이전 이름' }, sessionRevision: 1 });
        const dispose = installRecentSearchPrivacyBoundary(auth);
        try {
            addRecentSearch('member:7', '공방');
            auth.change({ user: { id: 7, name: '변경 이름' } });
            expect(readRecentSearches('member:7')).toEqual(['공방']);
            auth.change({ sessionRevision: 2 });
            expect(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)).toBeNull();
        } finally {
            dispose();
        }
    });

    it('clears mismatched storage at installation and discards damaged records', () => {
        addRecentSearch('member:7', '공방');
        const auth = authFixture({ user: null, sessionRevision: 0 });
        installRecentSearchPrivacyBoundary(auth)();
        expect(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)).toBeNull();
        for (const value of ['{broken', JSON.stringify({ owner: 'guest', terms: ['공방'] }), 'x'.repeat(12_001)]) {
            localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, value);
            expect(readRecentSearches('guest')).toEqual([]);
            expect(localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)).toBeNull();
        }
    });

    it('falls back within the tab when persistent storage is blocked', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        addRecentSearch('guest', '안산 공방');
        expect(readRecentSearches('guest')).toEqual(['안산 공방']);
        removeRecentSearch('guest', '안산 공방');
        expect(readRecentSearches('guest')).toEqual([]);
    });
});
