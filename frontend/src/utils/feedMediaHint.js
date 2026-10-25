import { feedMediaUrl } from './feed';

/* 사진 크기만 재사용하며 목록 응답을 상세 쿼리의 초기 데이터로 사용하지 않는다. */
export function readFeedMediaHint(client, postId) {
    const id = Number(postId);
    if (!Number.isSafeInteger(id) || id <= 0) return undefined;
    const queries = client?.getQueryCache?.().findAll({ queryKey: ['feed'] }) || [];
    let latest;
    for (const query of queries) {
        const key = query.queryKey;
        const state = query.state;
        if (state.error || !state.data) continue;
        const detail = key[1] === 'post' && Number(key[2]) === id;
        const list = key[1] === 'posts' || key[1] === 'me' && key[2] === 'posts'
            || key[1] === 'author' && key[3] === 'posts';
        const post = detail ? state.data : list ? state.data.content?.find(item => Number(item.id) === id) : null;
        if (!post || !Array.isArray(post.images) || latest && latest.updatedAt >= state.dataUpdatedAt) continue;
        latest = { updatedAt: state.dataUpdatedAt, images: post.state === 'DELETED' ? [] : post.images
            .filter(image => typeof image.url === 'string' && feedMediaUrl(image.url))
            .map(image => ({ width: image.width, height: image.height })) };
    }
    return latest?.images;
}
