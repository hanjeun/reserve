import { useCallback, useEffect, useState } from 'react';
import useAuthStore from '../store/useAuthStore';
import {
    RECENT_SEARCH_STORAGE_KEY,
    addRecentSearch,
    clearRecentSearches,
    readRecentSearches,
    recentSearchOwner,
    removeRecentSearch,
} from '../utils/recentSearches';

export default function useRecentSearches() {
    const owner = useAuthStore(state => recentSearchOwner(state.user));
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const [record, setRecord] = useState(() => ({ owner, sessionRevision, terms: readRecentSearches(owner) }));
    const terms = record.owner === owner && record.sessionRevision === sessionRevision ? record.terms : [];

    useEffect(() => {
        const reload = () => setRecord({ owner, sessionRevision, terms: readRecentSearches(owner) });
        reload();
        const onStorage = event => {
            if (event.key === RECENT_SEARCH_STORAGE_KEY || event.key === null) reload();
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [owner, sessionRevision]);

    const update = useCallback(operation => {
        const current = useAuthStore.getState();
        if (recentSearchOwner(current.user) !== owner || current.sessionRevision !== sessionRevision) return;
        setRecord({ owner, sessionRevision, terms: operation() });
    }, [owner, sessionRevision]);

    const add = useCallback(term => update(() => addRecentSearch(owner, term)), [owner, update]);
    const remove = useCallback(term => update(() => removeRecentSearch(owner, term)), [owner, update]);
    const clear = useCallback(() => update(clearRecentSearches), [update]);

    return { terms, add, remove, clear };
}
