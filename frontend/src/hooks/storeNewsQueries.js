import { useQuery } from '@tanstack/react-query';
import storeNewsService from '../services/storeNewsService';
import { benefitKeys } from './queryKeys';
import { interactionKeys } from './feedInteractionQueries';

export const storeNewsKeys = {
    all: () => ['store-news'],
    applications: params => ['store-news', 'applications', params],
    application: id => ['store-news', 'application', id],
    config: () => ['store-news', 'config'],
    stores: () => ['store-news', 'stores'],
    mine: params => ['store-news', 'me', params],
    detail: id => ['store-news', 'detail', id],
};
export const useStoreNewsConfig = enabled => useQuery({ queryKey: storeNewsKeys.config(),
    queryFn: ({ signal }) => storeNewsService.config(signal), enabled, staleTime: 60_000, retry: false });
export const invalidateStoreNews = (client, { metadata = true } = {}) => Promise.all([
    client.invalidateQueries({ queryKey: storeNewsKeys.all(), predicate: query => metadata || !['config', 'stores'].includes(query.queryKey[1]) }),
    client.invalidateQueries({ queryKey: benefitKeys.all() }),
    client.invalidateQueries({ queryKey: ['admin', 'feed'] }),
    client.invalidateQueries({ queryKey: interactionKeys.all(), predicate: query => query.queryKey[2] === 'mine'
        || query.queryKey[2] === 'status' && query.queryKey[3] === 'NEWS' }),
]);
