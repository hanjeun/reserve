import { useQuery } from '@tanstack/react-query';
import { hasAdminAccess } from '../constants/roles';
import useAuthStore from '../store/useAuthStore';
import { listMailDrafts } from '../utils/mailDraftStorage';

export default function useMailDrafts(active = true) {
    const ownerId = useAuthStore(state => hasAdminAccess(state.user?.role) ? state.user.id : null);
    const revision = useAuthStore(state => state.sessionRevision);
    const queryKey = ['local-mail-drafts', ownerId, revision];
    const query = useQuery({
        queryKey, queryFn: () => listMailDrafts(ownerId), enabled: active && ownerId != null,
        networkMode: 'always', gcTime: 0, staleTime: 0, retry: false, refetchOnReconnect: false,
    });
    return { ownerId, queryKey, query };
}
