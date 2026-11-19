import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Tabs } from 'antd';
import PropTypes from 'prop-types';
import Pagination from '../../components/common/Pagination';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar, Card, DataState, PageContainer, PageTitle } from '../../components/common';
import { ArrowLeftOutlined, StarFilled } from '../../components/common/icons';
import InterfaceIcon from '../../components/common/InterfaceIcon';
import IconTool from '../../components/common/IconTool';
import FeedEditor from '../../components/feed/FeedEditor';
import useAuthStore from '../../store/useAuthStore';
import FeedPostCard from '../../components/feed/FeedPostCard';
import FeedModalLoading from '../../components/feed/FeedModalLoading';
import FeedSkeleton, { FeedPageSkeleton } from '../../components/feed/FeedSkeleton';
import ReviewPhotos from '../../components/review/ReviewPhotos';
import { feedKeys, useFeedConfig, useFeedProfile } from '../../hooks/feedQueries';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useFeedActions from '../../hooks/useFeedActions';
import feedService from '../../services/feedService';
import { authorPath, FEED_PAGE_SIZE, feedDate, feedPage, feedTotal, postCommentsPath } from '../../utils/feed';
import { storeDetailPath } from '../../utils/storePublicAddress';
import { discoveryTabDestination } from '../../utils/discoveryNavigation';
import useListQueryNormalization from '../../hooks/useListQueryNormalization';
import useGoBack from '../../hooks/useGoBack';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { httpStatusOf, isMissingRequestError } from '../../utils/listErrorMessage';
import { isBlockingListReadError, isReadAccessDenied, refetchFailedReads } from '../../hooks/liveUpdateQueries';

const FeedReportModal = lazy(() => import('../../components/feed/FeedReportModal'));
const retryRead = (count, error) => httpStatusOf(error) !== 429 && !isReadAccessDenied(error) && count < 1;

const sections = {
    posts: { label: '게시물', subject: '게시물을', empty: '공개한 게시물이 없어요.', read: 'authorPosts' },
    comments: { label: '댓글', subject: '댓글을', empty: '공개한 댓글이 없어요.', read: 'authorComments' },
    reviews: { label: '리뷰', subject: '리뷰를', empty: '공개한 리뷰가 없어요.', read: 'authorReviews' },
};

function ActivityCards({ items, active }) {
    return <div className="reserve-feed-list reserve-profile-activity">
        {active === 'comments' ? items.map(comment => {
            const path = postCommentsPath(comment.postPublicId, comment.commentPublicId);
            return <article key={comment.commentPublicId}>
                <Card><Card.Body>
                    <header className="reserve-profile-activity-meta">
                        <time dateTime={comment.createdAt}>{feedDate(comment.createdAt, { dateOnly: true })}</time>
                        {path && <Link className="reserve-text-link" to={path}>댓글 보기</Link>}
                    </header>
                    <p>{comment.content || '사진 댓글'}</p>
                </Card.Body></Card>
            </article>;
        }) : items.map(review => {
            const path = storeDetailPath({ publicId: review.storePublicId });
            return <article key={review.id}>
                <Card><Card.Body>
                    <header className="reserve-profile-activity-meta">
                        {path ? <Link className="reserve-text-link" to={path} state={{ openReviewId: review.id }}>{review.storeName}</Link>
                            : <strong>{review.storeName}</strong>}
                        <span><StarFilled aria-hidden="true" /> {review.rating}점</span>
                        <time dateTime={review.createdAt}>{feedDate(review.createdAt, { dateOnly: true })}</time>
                    </header>
                    <ReviewPhotos photos={review.photos} />
                    <p className="reserve-review-title">{review.title}</p>
                    <p>{review.content}</p>
                </Card.Body></Card>
            </article>;
        })}
    </div>;
}
ActivityCards.propTypes = { items: PropTypes.array.isRequired, active: PropTypes.string.isRequired };

export default function FeedAuthor() {
    const { publicId } = useParams();
    const navigate = useNavigate();
    const goBack = useGoBack(discoveryTabDestination('/feed'));
    const user = useAuthStore(state => state.user);
    const [editingPost, setEditingPost] = useState(null);
    const [editorMounted, setEditorMounted] = useState(false);
    const [reportId, setReportId] = useState(null);
    const [reportMounted, setReportMounted] = useState(false);
    const validId = Boolean(authorPath(publicId));
    const [params, setParams] = useSearchParams();
    useListQueryNormalization(params);
    const page = feedPage(params.get('page'));
    const config = useFeedConfig();
    const author = useQuery({ queryKey: feedKeys.author(publicId), queryFn: ({ signal }) => feedService.author(publicId, signal),
        enabled: validId, retry: retryRead });
    const authorUnavailable = isReadAccessDenied(author.error) || isMissingRequestError(author.error);
    const fallbackOwner = Boolean(validId && user && author.data?.mine == null && config.data?.enabled);
    const ownProfile = useFeedProfile(fallbackOwner);
    const mine = author.data?.mine ?? (!isReadAccessDenied(ownProfile.error) && ownProfile.data?.publicId === publicId);
    const activityAvailable = author.data?.activityAvailable === true;
    const tabs = config.data?.enabled ? ['posts', 'comments', 'reviews'] : activityAvailable ? ['reviews'] : [];
    const requested = params.get('tab');
    const active = tabs.includes(requested) ? requested : tabs[0];
    const section = sections[active];
    const activityRestricted = Boolean(section && active !== 'posts' && !activityAvailable);
    const listEnabled = validId && Boolean(author.data) && !authorUnavailable && Boolean(section) && !activityRestricted;
    const listParams = { page: page - 1, size: FEED_PAGE_SIZE };
    const list = useQuery({ queryKey: feedKeys.authorActivity(publicId, active, listParams),
        queryFn: ({ signal }) => feedService[section.read](publicId, listParams, signal), enabled: listEnabled,
        staleTime: 30_000, placeholderData: (previous, query) => query?.queryKey[2] === publicId && query.queryKey[3] === active
            ? keepPreviousData(previous) : undefined, retry: retryRead });
    const listRef = useRef(null);
    const accessesDenied = authorUnavailable || listEnabled && (isReadAccessDenied(list.error) || isMissingRequestError(list.error));
    const blockingError = listEnabled && (accessesDenied || isBlockingListReadError(list.error, list.data?.content));
    const authorFailure = validId && author.isError && (!author.data || authorUnavailable);
    const configFailure = config.isError && (!config.data || !config.data.enabled);
    const initialConfig = config.isPending && !config.data;
    const reads = [config, ...(validId ? [author] : []), ...(listEnabled ? [list] : []), ...(fallbackOwner ? [ownProfile] : [])];
    const background = !authorFailure && !blockingError && !configFailure
        && [...(listEnabled ? [list] : []), author, config].find(query => query.isError && query.data !== undefined);
    const profileFailure = !authorFailure && !blockingError && !background && fallbackOwner && list.data && ownProfile.isError;
    const retrying = reads.some(query => query.isFetching);
    const retryReads = () => refetchFailedReads(reads);
    useListRefreshAnchor(listRef, [publicId, active, page].join(':'), list.isFetching && !list.isPlaceholderData,
        accessesDenied ? null : list.data);
    const total = feedTotal(list.data);
    const totalPages = Math.max(1, Math.ceil(total / FEED_PAGE_SIZE));
    useEffect(() => {
        if (!listEnabled || !list.isSuccess || list.isFetching || list.isPlaceholderData || page <= totalPages) return;
        setParams(previous => {
            if (previous.get('page') !== params.get('page') || previous.get('tab') !== params.get('tab')) return previous;
            const next = new URLSearchParams(previous);
            next.set('page', String(totalPages));
            return next;
        }, { replace: true });
    }, [listEnabled, list.isSuccess, list.isFetching, list.isPlaceholderData, page, totalPages, params, setParams]);

    const { onDelete, onShare, requestReport } = useFeedActions();
    useDocumentTitle(!accessesDenied && author.data?.nickname ? author.data.nickname + '의 프로필' : '프로필');
    const renderList = () => {
        if (!validId) return <DataState state="empty" title="프로필을 찾을 수 없어요." />;
        if (authorFailure) return <DataState state={isMissingRequestError(author.error) ? 'empty' : 'error'} requestType="detail"
            title="프로필을 불러올 수 없어요." error={author.error} onRetry={isMissingRequestError(author.error) ? undefined : retryReads} retrying={retrying} />;
        if (blockingError) return <DataState state="error" title={section.subject + ' 불러오지 못했어요.'} error={list.error}
            onRetry={retryReads} retrying={retrying} />;
        if (!section && configFailure) return <DataState state="error" title="활동을 불러오지 못했어요." error={config.error}
            onRetry={retryReads} retrying={retrying} />;
        if (!section) return <DataState state="empty" kind="feed" title="프로필에 표시할 활동이 없어요." />;
        const kind = active === 'reviews' ? 'review' : 'feed';
        if (activityRestricted) return <DataState state="empty" kind={kind} title={section.label + ' 목록을 아직 공개하지 않았어요.'} />;
        if (!list.data && list.isPending) return <FeedSkeleton />;
        if (!list.data?.content?.length) return <DataState state="empty" kind={kind} title={section.empty} />;
        if (active !== 'posts') return <ActivityCards active={active} items={list.data.content} />;
        return <div className="reserve-feed-list" aria-busy={list.isFetching}>{list.data.content.map(post => <FeedPostCard key={post.id} post={post} listItemId={'post:' + post.id}
            onEdit={mine ? item => { setEditingPost(item); setEditorMounted(true); } : undefined}
            onDelete={onDelete} onShare={onShare} onReport={item => requestReport(item, id => { setReportId(id); setReportMounted(true); })} />)}</div>;
    };

    if (validId && !authorFailure && (author.isPending && !author.data || initialConfig)) return <FeedPageSkeleton kind="feed-author" />;

    return <PageContainer ref={listRef} size="md" paddingTop="12px" paddingX="0px" paddingBottom="40px"
        style={{ maxWidth: 640, backgroundColor: 'transparent' }} className="reserve-feed-page" aria-labelledby="feed-author-title">
        <header className="reserve-feed-heading">
            <IconTool kind="navigation" label="이전 화면으로 돌아가기" icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={goBack} />
            <PageTitle level={1} id="feed-author-title">프로필</PageTitle>
        </header>
        {!accessesDenied && author.data && <div className="reserve-feed-profile">
            <Avatar src={author.data.avatarUrl} size={64} referrerPolicy="no-referrer" />
            <div><h2>{author.data.nickname}</h2><p>{author.data.bio?.trim() || '소개가 없어요.'}</p></div>
            {mine && <IconTool label="프로필 수정" icon={<InterfaceIcon name="edit" />} onClick={() => navigate('/my-page?tab=profile')} />}
        </div>}
        {!accessesDenied && mine && activityAvailable && !author.data?.visibility
            && <p className="reserve-feed-note">댓글과 리뷰를 다른 사람에게 보여줄 범위는 프로필 수정에서 정할 수 있어요.</p>}
        {!accessesDenied && author.data && tabs.length > 1 && <Tabs className="reserve-pill-tabs reserve-profile-tabs" activeKey={active} tabBarGutter={8}
            items={tabs.map(key => ({ key, label: sections[key].label }))}
            onChange={key => setParams(previous => { const next = new URLSearchParams(previous); next.set('tab', key); next.delete('page'); return next; })} />}
        {profileFailure && <DataState compact state="error" title="프로필을 불러오지 못했어요." error={ownProfile.error} onRetry={retryReads} retrying={retrying} />}
        {!accessesDenied && background && <DataState compact state="error" title={(section?.subject || '활동을') + ' 갱신하지 못했어요.'}
            error={background.error} onRetry={retryReads} retrying={retrying} />}
        {renderList()}
        {listEnabled && !accessesDenied && !blockingError && total > FEED_PAGE_SIZE && <nav className="reserve-feed-pagination" aria-label={section.label + ' 목록 페이지'}>
            <Pagination current={page} total={total} pageSize={FEED_PAGE_SIZE} showSizeChanger={false}
                onChange={value => { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }} />
        </nav>}
        {editorMounted && mine && config.data?.enabled && !accessesDenied && <FeedEditor open={Boolean(editingPost)} post={editingPost}
            config={config.data} onClose={() => setEditingPost(null)} onSaved={() => setEditingPost(null)} />}
        <Suspense fallback={<FeedModalLoading kind="report" open={Boolean(reportId)} onClose={() => setReportId(null)} />}>
            {reportMounted && <FeedReportModal postId={reportId} onClose={() => setReportId(null)} />}
        </Suspense>
    </PageContainer>;
}
