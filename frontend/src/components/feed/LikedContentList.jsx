import PropTypes from 'prop-types';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, DataState } from '../common';
import IconTool from '../common/IconTool';
import { HeartFilled } from '../common/icons';
import FeedSkeleton from './FeedSkeleton';
import FeedPostCard from './FeedPostCard';
import PostInteractionBar from './PostInteractionBar';
import ContentLikeButton from './ContentLikeButton';
import FeedMediaStrip from './FeedMediaStrip';
import { BenefitRow } from '../store-news/StoreNewsPresentation';
import { interactionKeys, invalidateInteractions } from '../../hooks/feedInteractionQueries';
import useFeedActions from '../../hooks/useFeedActions';
import useMessage from '../../hooks/useMessage';
import service from '../../services/feedInteractionService';
import { authorPath, feedMediaUrl, feedTotal } from '../../utils/feed';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { httpStatusOf } from '../../utils/listErrorMessage';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';

export default function LikedContentList({ type = 'ALL' }) {
    const params = { type, size: 20 };
    const client = useQueryClient();
    const { message } = useMessage();
    const { onShare } = useFeedActions();
    const list = useInfiniteQuery({ queryKey: interactionKeys.mine(params), initialPageParam: 0,
        queryFn: ({ pageParam, signal }) => service.mine({ ...params, page: pageParam }, signal),
        getNextPageParam: (last, pages) => pages.reduce((count, page) => count + (page.content?.length || 0), 0) < feedTotal(last) ? pages.length : undefined });
    const listRef = useRef(null);
    const unavailable = [401, 403].includes(httpStatusOf(list.error));
    useListRefreshAnchor(listRef, type, list.isFetching && !list.isFetchingNextPage, unavailable ? null : list.data);
    const remove = useMutation({ mutationFn: async ({ item, session }) => {
        assertCurrentSession(session); const saved = await service.setLike(item.type, item.targetId, false); assertCurrentSession(session); return saved;
    },
        onSuccess: (_, variables) => { if (isCurrentSession(variables.session)) void invalidateInteractions(client); }, onError: failure => {
            if (failure.isStaleSession) return;
            if (failure.status === 404) void invalidateInteractions(client); else message.error(failure.message);
        } });
    const items = [...new Map((list.data?.pages.flatMap(page => page.content || []) || []).map(item => [item.id, item])).values()];
    if (list.isPending && !list.data) return <FeedSkeleton />;
    if (isBlockingListReadError(list.error, items)) return <DataState state="error" compact title="좋아요한 내용을 불러오지 못했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />;
    const backgroundError = list.isError && list.data && <DataState compact state="error" title="좋아요한 내용을 갱신하지 못했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />;
    if (!items.length) return <>{backgroundError}<DataState state="empty" kind="favorite"
        title={type === 'POST' ? '좋아요한 게시물이 없어요.' : type === 'NEWS' ? '좋아요한 가게 소식이 없어요.' : type === 'COMMENT' ? '좋아요한 댓글이 없어요.' : '좋아요한 내용이 없어요.'} /></>;
    return <>{backgroundError}
    <div ref={listRef} className="reserve-feed-list" aria-busy={list.isFetching}>
        {items.map(item => !item.available ? <div key={item.id} data-list-item-id={`liked:${item.id}`} className="reserve-liked-unavailable">
            <p className="reserve-feed-note">현재 공개되지 않는 {item.type === 'NEWS' ? '가게 소식' : item.type === 'COMMENT' ? '댓글' : '게시물'}이에요.</p>
            <IconTool label="좋아요 취소" icon={<HeartFilled aria-hidden="true" style={{ color: 'var(--c-error)' }} />} loading={remove.isPending} onClick={() => remove.mutate({ item, session: currentSession().epoch })} />
        </div> : item.post ? <FeedPostCard key={item.id} post={item.post} listItemId={`liked:${item.id}`} onShare={onShare} />
            : item.comment ? <article key={item.id} data-list-item-id={`liked:${item.id}`} className="reserve-feed-post">
                <Link to={authorPath(item.comment.author.publicId)}><Avatar src={item.comment.author.avatarUrl} size={36} referrerPolicy="no-referrer" /></Link>
                <div className="reserve-feed-post-content"><strong>{item.comment.author.nickname}</strong><p className="reserve-feed-note">좋아요한 댓글</p>
                    <Link to={`/feed/posts/${item.comment.postId}#comment-${item.comment.id}`} className="reserve-feed-post-text">{item.comment.content || '사진 댓글 보기'}</Link>
                    <FeedMediaStrip label="댓글" images={(item.comment.images || []).map(image => ({ ...image, src: feedMediaUrl(image.url) })).filter(image => image.src)} />
                    <ContentLikeButton type="COMMENT" targetId={item.targetId} initialStatus={{ liked: true, likeCount: item.comment.likeCount || 0, commentCount: 0 }} />
                </div></article>
            : <div key={item.id} data-list-item-id={`liked:${item.id}`} className="reserve-liked-section"><BenefitRow item={item.news} />
                <PostInteractionBar type="NEWS" targetId={item.targetId} /></div>)}
    </div>{list.hasNextPage && <Button variant="ghost-sm" size="sm" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage({ cancelRefetch: false })}>좋아요 더 보기</Button>}</>;
}
LikedContentList.propTypes = { type: PropTypes.oneOf(['ALL', 'POST', 'NEWS', 'COMMENT']) };
