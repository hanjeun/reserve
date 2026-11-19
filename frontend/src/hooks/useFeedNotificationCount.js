import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../store/useAuthStore';
import { interactionKeys, useFeedInteractions } from './feedInteractionQueries';
import service from '../services/feedInteractionService';
import useLiveUpdatesStatus from './useLiveUpdatesStatus';

export default function useFeedNotificationCount() {
    const user = useAuthStore(state => state.user);
    const live = useLiveUpdatesStatus();
    const config = useFeedInteractions();
    const enabled = Boolean(user) && config.data?.notificationsEnabled === true;
    const query = useQuery({ queryKey: interactionKeys.notificationCount(), queryFn: ({ signal }) => service.notificationCount(signal),
        enabled, staleTime: 20_000, refetchInterval: live.present ? false : 30_000,
        refetchIntervalInBackground: false, refetchOnReconnect: false, retry: false });
    return { ...query, enabled, pending: Boolean(user) && config.isPending,
        visible: Boolean(user) && config.data?.notificationsEnabled !== false };
}
