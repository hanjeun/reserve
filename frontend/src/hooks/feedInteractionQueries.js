import { useQuery } from '@tanstack/react-query';
import service from '../services/feedInteractionService';

export const interactionKeys = {
    all: () => ['feed', 'interactions'],
    config: () => ['feed', 'interactions', 'config'],
    status: (type, id) => ['feed', 'interactions', 'status', type, id],
    mine: params => ['feed', 'interactions', 'mine', params],
    comments: id => ['feed', 'interactions', 'comments', id],
    replies: id => ['feed', 'interactions', 'replies', id],
    comment: id => ['feed', 'interactions', 'comment', id],
    notifications: params => ['feed', 'interactions', 'notifications', params],
    notificationCount: () => ['feed', 'interactions', 'notifications', 'count'],
    reports: params => ['admin', 'feed', 'comment-reports', params],
    report: id => ['admin', 'feed', 'comment-report', id],
    current: id => ['admin', 'feed', 'comment', id],
};
export const useFeedInteractions = () => useQuery({ queryKey: interactionKeys.config(),
    queryFn: ({ signal }) => service.config(signal), staleTime: 60_000, retry: false });
export const invalidateInteractions = client => Promise.all([
    client.invalidateQueries({ queryKey: interactionKeys.all() }),
    client.invalidateQueries({ queryKey: ['admin', 'feed'] }),
]);
