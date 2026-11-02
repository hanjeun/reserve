import PropTypes from 'prop-types';
import { lazy, Suspense, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, DataState, StoreCardSkeleton } from '../common';
import IconTool from '../common/IconTool';
import { HeartFilled } from '../common/icons';
import StoreListRowSkeleton from '../store/StoreListRowSkeleton';
import LikedContentItem from './LikedContentItem';
import { interactionKeys, invalidateInteractions } from '../../hooks/feedInteractionQueries';
import useFeedActions from '../../hooks/useFeedActions';
import useMessage from '../../hooks/useMessage';
import service from '../../services/feedInteractionService';
import { feedTotal } from '../../utils/feed';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { httpStatusOf } from '../../utils/listErrorMessage';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';

const FeedReportModal = lazy(() => import('./FeedReportModal'));

export default function LikedContentList({ type = 'ALL', view = 'cards' }) {
    const params = { type, size: 20 };
    const client = useQueryClient();
    const { message } = useMessage();
    const { onShare } = useFeedActions();
    const [reportTarget, setReportTarget] = useState(null);
    const [reportMounted, setReportMounted] = useState(false);
    const report = item => { setReportMounted(true); setReportTarget({ type: item.type, id: item.targetId }); };
    const list = useInfiniteQuery({ queryKey: interactionKeys.mine(params), initialPageParam: 0,
        queryFn: ({ pageParam, signal }) => service.mine({ ...params, page: pageParam }, signal),
        getNextPageParam: (last, pages) => pages.reduce((count, page) => count + (page.content?.length || 0), 0) < feedTotal(last) ? pages.length : undefined });
    const listRef = useRef(null);
    const unavailable = [401, 403].includes(httpStatusOf(list.error));
    useListRefreshAnchor(listRef, JSON.stringify([type, view]), list.isFetching && !list.isFetchingNextPage, unavailable ? null : list.data);
    const remove = useMutation({ mutationFn: async ({ item, session }) => {
        assertCurrentSession(session); const saved = await service.setLike(item.type, item.targetId, false); assertCurrentSession(session); return saved;
    },
        onSuccess: (_, variables) => { if (isCurrentSession(variables.session)) void invalidateInteractions(client); }, onError: failure => {
            if (failure.isStaleSession) return;
            if (failure.status === 404) void invalidateInteractions(client); else message.error(failure.message);
        } });
    const items = [...new Map((list.data?.pages.flatMap(page => page.content || []) || []).map(item => [item.id, item])).values()];
    const className = view === 'list' ? 'reserve-store-list-rows' : 'rsv-fav-grid';
    const reportDialog = <Suspense fallback={null}>{reportMounted && <FeedReportModal postId={reportTarget?.type === 'POST' ? reportTarget.id : null}
        newsId={reportTarget?.type === 'NEWS' ? reportTarget.id : null} commentId={reportTarget?.type === 'COMMENT' ? reportTarget.id : null}
        onClose={() => setReportTarget(null)} />}</Suspense>;
    if (list.isPending && !list.data) return <div className={className}>{view === 'list' ? <StoreListRowSkeleton count={6} /> : <StoreCardSkeleton count={6} />}</div>;
    if (isBlockingListReadError(list.error, items)) return <DataState state="error" kind="favorite" title="좋아요한 내용을 불러오지 못했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />;
    const backgroundError = list.isError && list.data && <DataState compact state="error" title="좋아요한 내용을 갱신하지 못했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />;
    if (!items.length) return <>{backgroundError}<DataState state="empty" kind="favorite"
        title={type === 'POST' ? '좋아요한 게시물이 없어요.' : type === 'NEWS' ? '좋아요한 가게 소식이 없어요.' : type === 'COMMENT' ? '좋아요한 댓글이 없어요.' : '좋아요한 내용이 없어요.'} />{reportDialog}</>;
    return <>{backgroundError}
    <div ref={listRef} className={className} aria-busy={list.isFetching}>
        {items.map(item => !item.available || !(item.post || item.comment || item.news) ? <div key={item.id} data-list-item-id={`liked:${item.id}`} className="reserve-liked-unavailable">
            <p className="reserve-feed-note">현재 공개되지 않는 {item.type === 'NEWS' ? '가게 소식' : item.type === 'COMMENT' ? '댓글' : '게시물'}이에요.</p>
            <IconTool label="좋아요 취소" icon={<HeartFilled aria-hidden="true" style={{ color: 'var(--c-error)' }} />} loading={remove.isPending} onClick={() => remove.mutate({ item, session: currentSession().epoch })} />
        </div> : <LikedContentItem key={item.id} item={item} view={view} onShare={onShare} onReport={report} />)}
    </div>{list.hasNextPage && <Button variant="ghost-sm" size="sm" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage({ cancelRefetch: false })}>좋아요 더 보기</Button>}
    {reportDialog}</>;
}
LikedContentList.propTypes = { type: PropTypes.oneOf(['ALL', 'POST', 'NEWS', 'COMMENT']), view: PropTypes.oneOf(['cards', 'list']) };
