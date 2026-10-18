import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { DataState, PageContainer, PageTitle } from '../../components/common';
import IconTool from '../../components/common/IconTool';
import { ArrowLeftOutlined } from '../../components/common/icons';
import FeedPostCard from '../../components/feed/FeedPostCard';
import FeedComments from '../../components/feed/FeedComments';
import FeedModalLoading from '../../components/feed/FeedModalLoading';
import FeedEditor from '../../components/feed/FeedEditor';
import FeedSkeleton, { FeedPageSkeleton } from '../../components/feed/FeedSkeleton';
import useAuthStore from '../../store/useAuthStore';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useGoBack from '../../hooks/useGoBack';
import useFeedActions from '../../hooks/useFeedActions';
import { feedKeys, useFeedConfig, useFeedProfile } from '../../hooks/feedQueries';
import feedService from '../../services/feedService';
import { discoveryTabDestination } from '../../utils/discoveryNavigation';
import { httpStatusOf, isMissingRequestError } from '../../utils/listErrorMessage';

const FeedReportModal = lazy(() => import('../../components/feed/FeedReportModal'));

export default function FeedDetail() {
    const { id } = useParams();
    const postId = Number(id);
    const validId = Number.isSafeInteger(postId) && postId > 0;
    const user = useAuthStore(state => state.user);
    const navigate = useNavigate();
    const config = useFeedConfig();
    const enabled = config.data?.enabled === true;
    const profile = useFeedProfile(enabled && Boolean(user));
    const [editing, setEditing] = useState(false);
    const [composerMounted, setComposerMounted] = useState(false);
    const [reportMounted, setReportMounted] = useState(false);
    const [reportId, setReportId] = useState(null);
    const post = useQuery({ queryKey: feedKeys.detail(postId), queryFn: ({ signal }) => feedService.detail(postId, signal),
        enabled: enabled && validId, staleTime: 30_000 });
    const unavailable = [config, post].some(query => [401, 403].includes(httpStatusOf(query.error))) || isMissingRequestError(post.error);
    const backgroundFailure = [config, post].find(query => query.isError && query.data !== undefined);
    useDocumentTitle(!unavailable && post.data?.author?.nickname ? `${post.data.author.nickname}의 게시물` : '피드 게시물');
    const back = discoveryTabDestination('/feed');
    const goBack = useGoBack(back);
    const { onDelete, onShare, requestReport } = useFeedActions({ onDeleted: () => navigate(back, { replace: true }) });
    const renderPost = () => {
        if (!validId) return <DataState state="empty" title="게시물을 찾을 수 없어요." />;
        if (config.isPending && !config.data) return <FeedSkeleton detail postId={postId} />;
        if (config.isError && (!config.data || [401, 403].includes(httpStatusOf(config.error)))) return <DataState state="error" title="피드 상태를 불러오지 못했어요." error={config.error} onRetry={config.refetch} retrying={config.isFetching} />;
        if (!enabled) return <DataState state="empty" title="피드를 준비하고 있어요." />;
        if (post.isPending && !post.data) return <FeedSkeleton detail postId={postId} />;
        if (post.isError && (!post.data || unavailable)) return <DataState state={isMissingRequestError(post.error) ? 'empty' : 'error'} requestType="detail" title={isMissingRequestError(post.error) ? '게시물을 찾을 수 없어요.' : '게시물을 불러오지 못했어요.'}
            error={post.error} onRetry={isMissingRequestError(post.error) ? undefined : post.refetch} retrying={post.isFetching} />;
        return <FeedPostCard post={post.data} detail onShare={onShare} onDelete={onDelete}
            onEdit={profile.data ? () => {
                setComposerMounted(true);
                setEditing(true);
            } : undefined} onReport={item => requestReport(item, id => { setReportMounted(true); setReportId(id); })} />;
    };
    if (!editing && !reportId && validId && (!config.data && config.isPending || enabled && !post.data && post.isPending)) return <FeedPageSkeleton kind="feed-detail" postId={postId} />;
    return <PageContainer size="md" paddingTop="12px" paddingX="0px" paddingBottom="40px" style={{ maxWidth: 640, backgroundColor: 'transparent' }} className="reserve-feed-page" aria-labelledby="feed-post-title">
        <header className="reserve-feed-heading"><IconTool kind="navigation" label="이전 화면으로 돌아가기" icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={goBack} /><PageTitle level={1} id="feed-post-title">게시물</PageTitle></header>
        {!unavailable && backgroundFailure && <DataState compact state="error" title="게시물을 갱신하지 못했어요." error={backgroundFailure.error} onRetry={backgroundFailure.refetch} retrying={backgroundFailure.isFetching} />}
        {renderPost()}
        {enabled && !unavailable && post.data?.state === 'PUBLISHED' && <FeedComments key={postId} postId={postId} />}
        {composerMounted && enabled && !unavailable && post.data && config.data && <FeedEditor open={editing}
            post={post.data} config={config.data} onClose={() => setEditing(false)} onSaved={(saved, draft) => {
                setEditing(false); if (draft) navigate('/feed?view=drafts');
            }} />}
        <Suspense fallback={<FeedModalLoading kind="report" open={Boolean(reportId)} onClose={() => setReportId(null)} />}>
            {reportMounted && <FeedReportModal postId={reportId} onClose={() => setReportId(null)} />}
        </Suspense>
    </PageContainer>;
}
