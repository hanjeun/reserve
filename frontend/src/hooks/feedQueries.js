import { useQuery } from '@tanstack/react-query';
import feedService from '../services/feedService';

export const feedKeys = {
    all: () => ['feed'],
    config: () => ['feed', 'config'],
    regions: () => ['feed', 'regions'],
    list: params => ['feed', 'posts', params],
    detail: id => ['feed', 'post', id],
    profile: () => ['feed', 'me', 'profile'],
    mine: params => ['feed', 'me', 'posts', params],
    author: id => ['feed', 'author', id],
    authorPosts: (id, params) => ['feed', 'author', id, 'posts', params],
    reports: params => ['admin', 'feed', 'reports', params],
    report: id => ['admin', 'feed', 'report', id],
    audit: params => ['admin', 'feed', 'audit', params],
};

export const useFeedConfig = () => useQuery({
    queryKey: feedKeys.config(), queryFn: ({ signal }) => feedService.config(signal),
    staleTime: 60_000, retry: false,
});

export const useFeedProfile = enabled => useQuery({
    queryKey: feedKeys.profile(), queryFn: ({ signal }) => feedService.myProfile(signal), enabled,
});

export const invalidateFeed = client => Promise.all([
    client.invalidateQueries({ queryKey: feedKeys.all() }),
    client.invalidateQueries({ queryKey: ['admin', 'feed'] }),
]);
