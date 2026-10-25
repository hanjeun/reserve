import { useContext, useEffect } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { extractImageHint, rememberImageHints, getImageHint, forgetImageHint } from '../utils/imageHintCache';
import { httpStatusOf } from '../utils/listErrorMessage';

/* 인증 골격에는 QueryClient가 없어 공개 사진 크기 힌트만 읽는다. */
const useStoreImageHint = storeId => {
    const client = useContext(QueryClientContext);
    const queries = client?.getQueryCache().findAll({ predicate: query => {
        const key = query.queryKey;
        return key[0] === 'stores' && (key[1] === 'list' || key[1] === 'detail' && key.length === 3)
            || key[0] === 'home' && key[1] === 'recommended-stores' || key[0] === 'waiting-stores';
    } }) ?? [];
    const denied = queries.some(query => query.queryKey[0] === 'stores' && query.queryKey[1] === 'detail'
        && String(query.queryKey[2]) === String(storeId) && [401, 403, 404, 410].includes(httpStatusOf(query.state.error)));
    let current;
    for (const query of queries.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt
        || Number(b.queryKey[1] === 'detail') - Number(a.queryKey[1] === 'detail'))) {
        const data = query.state.data;
        if (!data) continue;
        const candidates = query.queryKey[1] === 'detail' ? [data]
            : (data.pages ?? [data]).flatMap(page => page?.content ?? []);
        current = candidates.find(store => String(store.id) === String(storeId));
        if (current) break;
    }
    useEffect(() => {
        if (denied) forgetImageHint(storeId);
        else if (current) rememberImageHints(current);
    }, [current, denied, storeId]);
    if (denied) return null;
    return current ? extractImageHint(current) : getImageHint(storeId);
};

export default useStoreImageHint;
