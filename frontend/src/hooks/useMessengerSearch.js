import { useQuery } from '@tanstack/react-query';
import useMessengerStoreSearch from './useMessengerStoreSearch';
import useMessengerStore from '../store/useMessengerStore';
import { chatService } from '../services';
import { isReadAccessDenied } from './liveUpdateQueries';
import { shouldRetryChatList } from '../components/chat/chatListQueryPolicy';

export default function useMessengerSearch({ keyword, page, category = 'all', composing = false, enabled = true }) {
    const identity = useMessengerStore(state => state.sessionIdentity);
    const stores = useMessengerStoreSearch({ keyword, page, composing, enabled: enabled && ['all', 'stores'].includes(category) });
    const scope = category === 'stores' ? 'all' : category;
    const query = useQuery({
        queryKey: ['chat', 'search', identity, scope, stores.keyword, page],
        queryFn: ({ signal }) => chatService.search(stores.keyword, scope, page, signal),
        enabled: enabled && stores.ready && category !== 'stores',
        staleTime: 0, gcTime: 0, retry: shouldRetryChatList, refetchOnWindowFocus: false,
    });
    const hasData = stores.ready && query.data !== undefined && !isReadAccessDenied(query.error);
    return { stores, query, ready: stores.ready, keyword: stores.keyword, hasData,
        conversations: hasData && Array.isArray(query.data.conversations) ? query.data.conversations : [],
        messages: hasData && Array.isArray(query.data.messages) ? query.data.messages : [],
        more: hasData && Boolean(query.data.moreConversations || query.data.moreMessages) };
}
