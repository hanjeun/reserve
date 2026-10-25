import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../store/useAuthStore';
import searchService from '../services/searchService';
import { StaleSessionError } from '../api/sessionScope';
import { canSearchPersonal, isLocalNavigationSearch, normalizeSearchKeyword, searchCatalog, SEARCH_KEYWORD_MAX_LENGTH } from '../constants/searchCatalog';
import { clearDeniedQueryData } from './liveUpdateQueries';
import { PERSONAL_SEARCH_SCOPES, searchPlanKey, understandSearch } from '../utils/searchUnderstanding';
import { recordSearchMetric } from '../utils/searchDiagnostics';

export const unifiedSearchKeys = {
    public: (keyword, filters) => ['unified-search', 'public', keyword, ...(filters ? [searchPlanKey(filters)] : [])],
    personal: (id, revision, keyword, filters) => ['unified-search', 'personal', id, revision, keyword, ...(filters ? [searchPlanKey(filters)] : [])],
};
const denied = error => error?.isSessionExpired || error?.isStaleSession || error?.isInvalidSearchResponse || [401, 403, 404, 410].includes(Number(error?.status ?? error?.response?.status));
const sameOwner = (id, revision) => {
    const auth = useAuthStore.getState();
    return canSearchPersonal(auth) && auth.user.id === id && auth.sessionRevision === revision;
};
async function activeQuerySignal(context, client, queryKey) {
    // StrictMode 설정을 공유한 뒤 signal을 읽고 관찰자가 없으면 요청하지 않는다.
    await Promise.resolve();
    if (!client.getQueryCache().find({ queryKey, exact: true })?.getObserversCount()) throw new DOMException('검색 요청을 취소했어요.', 'AbortError');
    const signal = context.signal;
    signal.throwIfAborted();
    return signal;
}

export default function useUnifiedSearch({ keyword, submittedKeyword = '', confirmed = false, composing = false, enabled = true, choice = '', submittedAt = null }) {
    const auth = useAuthStore();
    const client = useQueryClient();
    const cacheMetricRef = useRef(null);
    const normalized = normalizeSearchKeyword(keyword);
    const submitted = normalizeSearchKeyword(submittedKeyword);
    const valid = normalized.length > 0 && normalized.length <= SEARCH_KEYWORD_MAX_LENGTH;
    const ready = valid && !composing;
    const isConfirmed = ready && confirmed && normalized === submitted;
    const catalog = valid ? searchCatalog(normalized, auth) : [];
    const plan = useMemo(() => understandSearch(isConfirmed ? submitted : normalized, { choice, now: submittedAt == null ? new Date() : new Date(submittedAt) }), [isConfirmed, submitted, normalized, choice, submittedAt]);
    const awaitingChoice = plan.choices.length > 0;
    const filters = plan.scope !== 'all' || plan.term !== normalized || plan.date || plan.region ? plan : null;
    const localOnly = isConfirmed && !plan.date && !plan.region && isLocalNavigationSearch(submitted, auth);
    const remoteConfirmed = isConfirmed && !localOnly && !awaitingChoice;
    const publicAllowed = !PERSONAL_SEARCH_SCOPES.includes(plan.scope);
    const personalScopeAllowed = plan.scope === 'all' || PERSONAL_SEARCH_SCOPES.includes(plan.scope);
    const personalAllowed = canSearchPersonal(auth);
    const id = auth.user?.id ?? null;
    const revision = auth.sessionRevision;
    // 입력 중에는 같은 유휴 키를 쓰고 이전 단어 재입력만으로 확정 조회를 재개하지 않는다.
    const publicKey = unifiedSearchKeys.public(remoteConfirmed && publicAllowed ? submitted : null, remoteConfirmed && publicAllowed ? filters : null);
    const personalKey = unifiedSearchKeys.personal(id, revision, remoteConfirmed && personalAllowed && personalScopeAllowed ? submitted : null, remoteConfirmed && personalAllowed && personalScopeAllowed ? filters : null);
    const publicQuery = useQuery({
        queryKey: publicKey,
        queryFn: async context => {
            if (!remoteConfirmed || !enabled) return null;
            const signal = await activeQuerySignal(context, client, publicKey);
            recordSearchMetric('publicRequest');
            return filters ? searchService.public(submitted, signal, filters) : searchService.public(submitted, signal);
        },
        enabled: enabled && remoteConfirmed && publicAllowed,
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
                recordSearchMetric('personalRequest');
                const response = await (filters ? searchService.personal(submitted, signal, auth.user?.role, filters)
                    : searchService.personal(submitted, signal, auth.user?.role));
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
        enabled: enabled && remoteConfirmed && personalAllowed && personalScopeAllowed,
        retry: false, gcTime: 0, staleTime: 0,
        refetchOnWindowFocus: false, refetchOnReconnect: false,
        meta: { sensitive: true },
    });
    useEffect(() => {
        if (!remoteConfirmed) { cacheMetricRef.current = null; return; }
        const key = JSON.stringify(publicKey);
        if (publicAllowed && publicQuery.isSuccess && !publicQuery.isFetching && !publicQuery.isFetchedAfterMount && cacheMetricRef.current !== key) {
            cacheMetricRef.current = key; recordSearchMetric('publicCacheHit');
        }
    }, [remoteConfirmed, publicAllowed, publicKey, publicQuery.isSuccess, publicQuery.isFetching, publicQuery.isFetchedAfterMount]);
    useEffect(() => useAuthStore.subscribe((next, previous) => {
        if (next.user?.id === previous.user?.id && next.sessionRevision === previous.sessionRevision && canSearchPersonal(next)) return;
        const queryKey = ['unified-search', 'personal', previous.user?.id ?? null, previous.sessionRevision];
        void client.cancelQueries({ queryKey });
        client.removeQueries({ queryKey });
    }), [client]);
    return { keyword: normalized, submittedKeyword: submitted, valid, ready, confirmed: isConfirmed, remoteConfirmed, localOnly, catalog, plan, awaitingChoice,
        authRequired: PERSONAL_SEARCH_SCOPES.includes(plan.scope) && !personalAllowed && !auth.authRestoring,
        publicQuery, personalQuery, personalAllowed, restoring: auth.authRestoring,
        publicData: remoteConfirmed && !denied(publicQuery.error) ? publicQuery.data : undefined,
        personalData: remoteConfirmed && personalAllowed && !denied(personalQuery.error) ? personalQuery.data : undefined };
}
