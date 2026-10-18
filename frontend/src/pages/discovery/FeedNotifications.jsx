import { useEffect, useRef } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, DataState, FilterMenu, PageContainer, PageTitle } from '../../components/common';
import IconTool from '../../components/common/IconTool';
import Pagination from '../../components/common/Pagination';
import { FeedNotificationsPageSkeleton } from '../../components/feed/FeedSkeleton';
import AnimatedContent from '../../components/common/AnimatedContent';
import { interactionKeys, useFeedInteractions } from '../../hooks/feedInteractionQueries';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useListQueryNormalization from '../../hooks/useListQueryNormalization';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { httpStatusOf } from '../../utils/listErrorMessage';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import useMessage from '../../hooks/useMessage';
import service from '../../services/feedInteractionService';
import { feedDate, feedPage, feedRelativeDate, feedTotal } from '../../utils/feed';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';
import { ArrowLeftOutlined, CheckOutlined } from '../../components/common/icons';
import { discoveryTabDestination } from '../../utils/discoveryNavigation';
import { FEED_NOTIFICATION_RETENTION_NOTE, FEED_NOTIFICATION_VIEWS } from '../../constants/feedNotifications';

const actionText = kind => ({ COMMENT: '내 글에 댓글을 남겼어요.', REPLY: '답글을 남겼어요.', COMMENT_LIKE: '내 댓글을 좋아해요.' }[kind] || '내 글에 반응했어요.');

export default function FeedNotifications() {
    useDocumentTitle('피드 알림');
    const [params, setParams] = useSearchParams();
    useListQueryNormalization(params);
    const page = feedPage(params.get('page'));
    const view = params.get('view') === 'unread' ? 'unread' : 'all';
    const config = useFeedInteractions();
    const client = useQueryClient();
    const navigate = useNavigate();
    const { message } = useMessage();
    const enabled = config.data?.notificationsEnabled === true;
    const request = { unread: view === 'unread', page: page - 1, size: 20 };
    const list = useQuery({ queryKey: interactionKeys.notifications(request), queryFn: ({ signal }) => service.notifications(request, signal),
        enabled, placeholderData: keepPreviousData, staleTime: 20_000 });
    const listRef = useRef(null);
    const unavailable = [config, list].some(query => [401, 403].includes(httpStatusOf(query.error)));
    const blockingError = isBlockingListReadError(list.error, list.data?.content);
    const backgroundFailure = [config, ...(!blockingError ? [list] : [])].find(query => query.isError && query.data !== undefined);
    useListRefreshAnchor(listRef, `${view}:${page}`, list.isFetching && !list.isPlaceholderData, unavailable ? null : list.data);
    const lastPage = Math.max(1, Math.ceil(feedTotal(list.data) / 20));
    useEffect(() => {
        if (!list.isSuccess || list.isFetching || list.isPlaceholderData || page <= lastPage) return;
        setParams(previous => {
            const currentView = previous.get('view') === 'unread' ? 'unread' : 'all';
            if (currentView !== view || feedPage(previous.get('page')) !== page) return previous;
            const next = new URLSearchParams(previous); next.set('page', String(lastPage)); return next;
        }, { replace: true });
    }, [list.isSuccess, list.isFetching, list.isPlaceholderData, view, page, lastPage, setParams]);
    const mark = useMutation({ mutationFn: async ({ id, session }) => {
        assertCurrentSession(session);
        if (id) await service.readNotification(id); else await service.readAllNotifications();
        assertCurrentSession(session);
    }, onSuccess: (_, variables) => { if (isCurrentSession(variables.session)) void client.invalidateQueries({ queryKey: ['feed', 'interactions', 'notifications'] }); },
    onError: failure => { if (!failure.isStaleSession) message.error(failure.message); } });
    const content = () => {
        const failure = config.isError && (!config.data || [401, 403].includes(httpStatusOf(config.error))) ? config
            : blockingError || list.isError && unavailable ? list : null;
        if (failure) return <DataState state="error" title="알림을 불러오지 못했어요." error={failure.error}
            onRetry={failure.refetch} retrying={failure.isFetching} />;
        if (!enabled) return <DataState state="empty" kind="notification" title="피드 알림을 준비하고 있어요." />;
        if (!list.data?.content?.length) return <DataState state="empty" kind="notification" title={view === 'unread' ? '안 읽은 알림이 없어요.' : '아직 새 알림이 없어요.'} />;
        return <ul className="reserve-feed-notification-list" aria-busy={list.isFetching}>
            {list.data.content.map(item => <li key={item.id} data-list-item-id={`notification:${item.id}`} className={item.read ? '' : 'is-unread'}>
                <Link to={`/feed/posts/${item.postId}#comment-${item.commentId}`} onClick={() => { if (!item.read) mark.mutate({ id: item.id, session: currentSession().epoch }); }}>
                    <Avatar src={item.actor?.avatarUrl} size={36} referrerPolicy="no-referrer" />
                    <span><strong>{item.actor?.nickname || '회원'}</strong><span>{actionText(item.kind)}</span>
                        <time dateTime={item.createdAt} title={feedDate(item.createdAt)}>{feedRelativeDate(item.createdAt)}</time></span>
                    {!item.read && <span className="reserve-feed-unread-dot" aria-label="안 읽음" />}
                </Link>
            </li>)}
        </ul>;
    };
    if (!config.data && config.isPending || enabled && !list.data && list.isPending) return <FeedNotificationsPageSkeleton view={view} />;
    return <PageContainer ref={listRef} size="md" className="reserve-feed-page reserve-feed-notifications-page" style={{ maxWidth: 640 }}>
        <PageTitle level={1}>피드 알림</PageTitle>
        <div className="reserve-feed-notification-tools"><div className="reserve-feed-notification-back"><IconTool kind="navigation" label="피드로" icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={() => navigate(discoveryTabDestination('/feed'))} /></div>
            <IconTool label="모두 읽음" icon={<CheckOutlined aria-hidden="true" />} loading={mark.isPending} disabled={!enabled || unavailable} onClick={() => mark.mutate({ session: currentSession().epoch })} />
            <FilterMenu appearance="plain" value={view} options={FEED_NOTIFICATION_VIEWS} aria-label="알림 보기" onChange={value => setParams(previous => {
                const next = new URLSearchParams(previous); next.set('view', value); next.set('page', '1'); return next;
            })} /></div>
        {!unavailable && backgroundFailure && <DataState compact state="error" title="알림을 갱신하지 못했어요." error={backgroundFailure.error} onRetry={backgroundFailure.refetch} retrying={backgroundFailure.isFetching} />}
        <AnimatedContent motionKey={`${view}:${page}`} ready={!config.isPending && (!enabled || !list.isPending && !list.isPlaceholderData)}>{content()}</AnimatedContent>
        {enabled && !unavailable && !blockingError && list.data && feedTotal(list.data) > 20 && <Pagination current={page} total={feedTotal(list.data)} pageSize={20} showSizeChanger={false}
            onChange={value => setParams(previous => { const next = new URLSearchParams(previous); next.set('page', String(value)); return next; })} />}
        <p className="reserve-feed-note">{FEED_NOTIFICATION_RETENTION_NOTE}</p>
    </PageContainer>;
}
