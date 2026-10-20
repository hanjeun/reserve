import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import Pagination from '../../components/common/Pagination';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar, DataState, PageContainer, PageTitle } from '../../components/common';
import { ArrowLeftOutlined } from '../../components/common/icons';
import InterfaceIcon from '../../components/common/InterfaceIcon';
import IconTool from '../../components/common/IconTool';
import FeedEditor from '../../components/feed/FeedEditor';
import useAuthStore from '../../store/useAuthStore';
import FeedPostCard from '../../components/feed/FeedPostCard';
import FeedModalLoading from '../../components/feed/FeedModalLoading';
import FeedSkeleton, { FeedPageSkeleton } from '../../components/feed/FeedSkeleton';
import { feedKeys, useFeedConfig, useFeedProfile } from '../../hooks/feedQueries';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useFeedActions from '../../hooks/useFeedActions';
import feedService from '../../services/feedService';
import { FEED_PAGE_SIZE, feedPage, feedTotal } from '../../utils/feed';
import { discoveryTabDestination } from '../../utils/discoveryNavigation';
import useListQueryNormalization from '../../hooks/useListQueryNormalization';
import useGoBack from '../../hooks/useGoBack';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { httpStatusOf, isMissingRequestError } from '../../utils/listErrorMessage';
import { isBlockingListReadError, isReadAccessDenied } from '../../hooks/liveUpdateQueries';

const FeedReportModal = lazy(() => import('../../components/feed/FeedReportModal'));
const retryProfileRead = (count, error) => httpStatusOf(error) !== 429 && !isReadAccessDenied(error) && count < 1;

export default function FeedAuthor() {
    const { publicId } = useParams();
    const navigate = useNavigate();
    const goBack = useGoBack(discoveryTabDestination('/feed'));
    const user = useAuthStore(state => state.user);
    const [editingPost, setEditingPost] = useState(null);
    const [editorMounted, setEditorMounted] = useState(false);
    const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId || '');
    const [params, setParams] = useSearchParams();
    useListQueryNormalization(params);
    const page = feedPage(params.get('page'));
    const config = useFeedConfig();
    const enabled = config.data?.enabled === true && validId;
    const ownProfile = useFeedProfile(enabled && Boolean(user));
    const mine = ![401, 403].includes(httpStatusOf(ownProfile.error)) && ownProfile.data?.publicId === publicId;
    const author = useQuery({ queryKey: feedKeys.author(publicId), queryFn: ({ signal }) => feedService.author(publicId, signal), enabled,
        retry: retryProfileRead });
    const authorUnavailable = [401, 403].includes(httpStatusOf(author.error)) || isMissingRequestError(author.error);
    const listParams = { page: page - 1, size: FEED_PAGE_SIZE };
    const posts = useQuery({ queryKey: feedKeys.authorPosts(publicId, listParams),
        queryFn: ({ signal }) => feedService.authorPosts(publicId, listParams, signal), enabled: enabled && Boolean(author.data) && !authorUnavailable,
        staleTime: 30_000, placeholderData: keepPreviousData, retry: retryProfileRead });
    const listRef = useRef(null);
    const unavailable = authorUnavailable || [config, posts].some(query => [401, 403].includes(httpStatusOf(query.error)));
    const blockingError = isBlockingListReadError(posts.error, posts.data?.content);
    const backgroundFailure = [config, author, ...(!blockingError ? [posts] : [])].find(query => query.isError && query.data !== undefined);
    useListRefreshAnchor(listRef, `${publicId}:${page}`, posts.isFetching && !posts.isPlaceholderData, unavailable ? null : posts.data);
    const totalPages = Math.max(1, Math.ceil(feedTotal(posts.data) / FEED_PAGE_SIZE));
    useEffect(() => {
        if (!posts.isSuccess || posts.isFetching || posts.isPlaceholderData || page <= totalPages) return;
        setParams(previous => {
            if (previous.get('page') !== params.get('page')) return previous;
            const next = new URLSearchParams(previous);
            next.set('page', String(totalPages));
            return next;
        }, { replace: true });
    }, [posts.isSuccess, posts.isFetching, posts.isPlaceholderData, page, totalPages, params, setParams]);
    const [reportId, setReportId] = useState(null);
    const [reportMounted, setReportMounted] = useState(false);
    const { onDelete, onShare, requestReport } = useFeedActions();
    useDocumentTitle(!unavailable && author.data?.nickname ? `${author.data.nickname}의 피드` : '피드 공개 프로필');
    const renderList = () => {
        if (!validId) return <DataState state="empty" title="공개 프로필을 찾을 수 없어요." />;
        if (config.isPending && !config.data) return <FeedSkeleton />;
        if (config.isError && (!config.data || [401, 403].includes(httpStatusOf(config.error)))) return <DataState state="error" title="피드 상태를 불러오지 못했어요." error={config.error} onRetry={config.refetch} retrying={config.isFetching} />;
        if (!config.data?.enabled) return <DataState state="empty" kind="feed" title="피드를 준비하고 있어요." />;
        if (author.isError && (!author.data || authorUnavailable)) return <DataState state={isMissingRequestError(author.error) ? 'empty' : 'error'} requestType="detail" title="공개 프로필을 불러올 수 없어요."
            error={author.error} onRetry={isMissingRequestError(author.error) ? undefined : author.refetch} retrying={author.isFetching} />;
        if (!author.data && author.isPending || !posts.data && posts.isPending) return <FeedSkeleton />;
        if (blockingError || posts.isError && unavailable) return <DataState state="error" title="게시물을 불러오지 못했어요." error={posts.error} onRetry={posts.refetch} retrying={posts.isFetching} />;
        if (!posts.data?.content?.length) return <DataState state="empty" kind="feed" title="공개한 게시물이 없어요." />;
        return <div className="reserve-feed-list" aria-busy={posts.isFetching}>{posts.data.content.map(post => <FeedPostCard key={post.id} post={post} listItemId={`post:${post.id}`}
            onEdit={mine ? item => { setEditorMounted(true); setEditingPost(item); } : undefined}
            onDelete={onDelete} onShare={onShare} onReport={item => requestReport(item, id => { setReportMounted(true); setReportId(id); })} />)}</div>;
    };
    if (!editingPost && !reportId && validId && (!config.data && config.isPending || enabled && (!author.data && author.isPending || author.data && !authorUnavailable && !posts.data && posts.isPending))) {
        return <FeedPageSkeleton kind="feed-author" />;
    }
    return <PageContainer ref={listRef} size="md" paddingTop="12px" paddingX="0px" paddingBottom="40px" style={{ maxWidth: 640, backgroundColor: 'transparent' }} className="reserve-feed-page" aria-labelledby="feed-author-title">
        <header className="reserve-feed-heading"><IconTool kind="navigation" label="이전 화면으로 돌아가기" icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={goBack} /><PageTitle level={1} id="feed-author-title">공개 프로필</PageTitle></header>
        {enabled && !unavailable && author.data && <div className="reserve-feed-profile"><Avatar src={author.data.avatarUrl} size={64} referrerPolicy="no-referrer" />
            <div><h2>{author.data.nickname}</h2><p>{author.data.bio}</p></div>
            {mine && <IconTool label="공개 프로필 수정" icon={<InterfaceIcon name="edit" />}
                onClick={() => navigate('/my-page?tab=public-profile')} />}</div>}
        {!unavailable && backgroundFailure && <DataState compact state="error" title="게시물을 갱신하지 못했어요." error={backgroundFailure.error} onRetry={backgroundFailure.refetch} retrying={backgroundFailure.isFetching} />}
        {renderList()}
        {enabled && !unavailable && !blockingError && posts.data && feedTotal(posts.data) > FEED_PAGE_SIZE && <nav className="reserve-feed-pagination" aria-label="작성자 게시물 페이지">
            <Pagination current={page} total={feedTotal(posts.data)} pageSize={FEED_PAGE_SIZE} showSizeChanger={false}
                onChange={value => { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }} />
        </nav>}
        {editorMounted && mine && enabled && !unavailable && config.data && <FeedEditor open={Boolean(editingPost)} post={editingPost}
            config={config.data} onClose={() => setEditingPost(null)} onSaved={() => setEditingPost(null)} />}
        <Suspense fallback={<FeedModalLoading kind="report" open={Boolean(reportId)} onClose={() => setReportId(null)} />}>{reportMounted && <FeedReportModal postId={reportId} onClose={() => setReportId(null)} />}</Suspense>
    </PageContainer>;
}
