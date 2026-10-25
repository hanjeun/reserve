import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../store/useAuthStore';
import searchService from '../services/searchService';
import { StaleSessionError } from '../api/sessionScope';
import { canSearchPersonal, isLocalNavigationSearch, normalizeSearchKeyword, searchCatalog, SEARCH_KEYWORD_MAX_LENGTH } from '../constants/searchCatalog';
import { clearDeniedQueryData } from './liveUpdateQueries';

export const unifiedSearchKeys = {
    public: keyword => ['unified-search', 'public', keyword],
    personal: (id, revision, keyword) => ['unified-search', 'personal', id, revision, keyword],
};
const denied = error => error?.isSessionExpired || error?.isStaleSession || error?.isInvalidSearchResponse || [401, 403, 404, 410].includes(Number(error?.status ?? error?.response?.status));
const sameOwner = (id, revision) => {
    const auth = useAuthStore.getState();
    return canSearchPersonal(auth) && auth.user.id === id && auth.sessionRevision === revision;
};
async function activeQuerySignal(context, client, queryKey) {
    // Share StrictMode setup before consuming the signal; skip API dispatch when no observer remains.
    await Promise.resolve();
    if (!client.getQueryCache().find({ queryKey, exact: true })?.getObserversCount()) throw new DOMException('검색 요청을 취소했어요.', 'AbortError');
    const signal = context.signal;
    signal.throwIfAborted();
    return signal;
}

export default function useUnifiedSearch({ keyword, submittedKeyword = '', confirmed = false, composing = false, enabled = true }) {
    const auth = useAuthStore();
    const client = useQueryClient();
    const normalized = normalizeSearchKeyword(keyword);
    const submitted = normalizeSearchKeyword(submittedKeyword);
    const valid = normalized.length > 0 && normalized.length <= SEARCH_KEYWORD_MAX_LENGTH;
    const ready = valid && !composing;
    const isConfirmed = ready && confirmed && normalized === submitted;
    const catalog = ready ? searchCatalog(normalized, auth) : [];
    const localOnly = isConfirmed && isLocalNavigationSearch(submitted, auth);
    const remoteConfirmed = isConfirmed && !localOnly;
    const personalAllowed = canSearchPersonal(auth);
    const id = auth.user?.id ?? null;
    const revision = auth.sessionRevision;
    // Editing reuses one idle key. Returning to an old draft cannot reactivate a submitted query.
    const publicKey = unifiedSearchKeys.public(remoteConfirmed ? submitted : null);
    const personalKey = unifiedSearchKeys.personal(id, revision, remoteConfirmed && personalAllowed ? submitted : null);
    const publicQuery = useQuery({
        queryKey: publicKey,
        queryFn: async context => {
            if (!remoteConfirmed || !enabled) return null;
            return searchService.public(submitted, await activeQuerySignal(context, client, publicKey));
        },
        enabled: enabled && remoteConfirmed,
        retry: false, staleTime: 30_000,
        refetchOnWindowFocus: false, refetchOnReconnect: false,
    });
    const personalQuery = useQuery({
        queryKey: personalKey,
        queryFn: async context => {
            if (!remoteConfirmed || !enabled || !sameOwner(id, revision)) throw new StaleSessionError();
            const signal = await activeQuerySignal(context, client, personalKey);
            if (!sameOwner(id, revision)) throw new StaleSessionError();
            try {
                const response = await searchService.personal(submitted, signal, auth.user?.role);
                if (!sameOwner(id, revision)) throw new StaleSessionError();
                return response;
            } catch (error) {
                const query = client.getQueryCache().find({ queryKey: personalKey, exact: true });
                if (query) {
                    clearDeniedQueryData(error, query);
                    if (denied(error)) query.setState({ data: undefined, dataUpdatedAt: 0 });
                }
                throw error;
            }
        },
        enabled: enabled && remoteConfirmed && personalAllowed,
        retry: false, gcTime: 0, staleTime: 0,
        refetchOnWindowFocus: false, refetchOnReconnect: false,
        meta: { sensitive: true },
    });
    useEffect(() => useAuthStore.subscribe((next, previous) => {
        if (next.user?.id === previous.user?.id && next.sessionRevision === previous.sessionRevision && canSearchPersonal(next)) return;
        const queryKey = ['unified-search', 'personal', previous.user?.id ?? null, previous.sessionRevision];
        void client.cancelQueries({ queryKey });
        client.removeQueries({ queryKey });
    }), [client]);
    return { keyword: normalized, submittedKeyword: submitted, valid, ready, confirmed: isConfirmed, remoteConfirmed, localOnly, catalog,
        publicQuery, personalQuery, personalAllowed, restoring: auth.authRestoring,
        publicData: remoteConfirmed && !denied(publicQuery.error) ? publicQuery.data : undefined,
        personalData: remoteConfirmed && personalAllowed && !denied(personalQuery.error) ? personalQuery.data : undefined };
}
