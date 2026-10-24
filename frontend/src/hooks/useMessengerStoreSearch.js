import { useQuery } from '@tanstack/react-query';
import useDebounce from './useDebounce';
import { storeKeys } from './queryKeys';
import storeService from '../services/storeService';
import useMessengerStore from '../store/useMessengerStore';
import { normalizeListPage } from '../utils/listResponse';
import { isReadAccessDenied } from './liveUpdateQueries';
import { shouldRetryChatList } from '../components/chat/chatListQueryPolicy';

export const MESSENGER_STORE_PAGE_SIZE = 20;

/** Public search only. Opening a room remains an explicit result-selection action. */
export default function useMessengerStoreSearch({ keyword, page, composing = false, enabled = true }) {
    const identity = useMessengerStore(state => state.sessionIdentity);
    const normalized = keyword.trim();
    const debounced = useDebounce(composing ? '' : normalized, 300);
    const ready = !composing && normalized.length > 0 && normalized === debounced;
    const params = { keyword: normalized, sort: 'rating', page, size: MESSENGER_STORE_PAGE_SIZE };
    const query = useQuery({
        queryKey: [...storeKeys.list(params), 'messenger', identity, composing],
        queryFn: ({ signal }) => storeService.getStores(params, signal).then(data => normalizeListPage(data, page)),
        enabled: enabled && ready,
        staleTime: 0,
        retry: shouldRetryChatList,
        refetchOnWindowFocus: false,
    });
    const hasData = ready && query.data !== undefined && !isReadAccessDenied(query.error);
    const stores = hasData ? query.data.content : [];
    const count = query.data?.page?.totalElements ?? query.data?.totalElements;
    return { query, keyword: normalized, ready, hasData, stores,
        total: hasData && Number.isSafeInteger(count) && count >= 0 ? count : stores.length };
}
