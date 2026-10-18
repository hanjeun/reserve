import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import Pagination from '../../components/common/Pagination';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { DataState, FilterMenu } from '../../components/common';
import { PageTitle } from '../../components/common/PageTypography';
import FeedPostCard from '../../components/feed/FeedPostCard';
import FeedModalLoading from '../../components/feed/FeedModalLoading';
import FeedEditor from '../../components/feed/FeedEditor';
import IconTool from '../../components/common/IconTool';
import AnimatedContent from '../../components/common/AnimatedContent';
import InterfaceIcon from '../../components/common/InterfaceIcon';
import { BellOutlined } from '../../components/common/icons';
import useFeedNotificationCount from '../../hooks/useFeedNotificationCount';
import FeedRegionSheet from '../../components/feed/FeedRegionSheet';
import { formatRegionLabel } from '../../constants/regions';
import FeedSkeleton, { FeedPageSkeleton } from '../../components/feed/FeedSkeleton';
import useAuthStore from '../../store/useAuthStore';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useFeedActions from '../../hooks/useFeedActions';
import { feedKeys, useFeedConfig, useFeedProfile } from '../../hooks/feedQueries';
import feedService from '../../services/feedService';
import { FEED_PAGE_SIZE, feedPage, feedTotal, feedRegion } from '../../utils/feed';
import { saveRedirect } from '../../utils/redirect';
import useListQueryNormalization from '../../hooks/useListQueryNormalization';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { httpStatusOf } from '../../utils/listErrorMessage';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';

const FeedReportModal = lazy(() => import('../../components/feed/FeedReportModal'));
const views = [{ value: 'all', label: '최신순' }, { value: 'favorites', label: '관심 가게' },
    { value: 'mine', label: '내 게시물' }, { value: 'drafts', label: '임시저장' }];

export default function Feed() {
    useDocumentTitle('피드', 'RESERVE 회원이 나누는 글과 사진을 만나보세요.');
    const user = useAuthStore(state => state.user);
    const [params, setParams] = useSearchParams();
    useListQueryNormalization(params);
    const view = views.some(item => item.value === params.get('view')) ? params.get('view') : 'all';
    const page = feedPage(params.get('page'));
    const region = feedRegion(params.get('region'));
    const config = useFeedConfig();
    const enabled = config.data?.enabled === true;
    const profile = useFeedProfile(enabled && Boolean(user));
    const notificationCount = useFeedNotificationCount();
    const [composer, setComposer] = useState(null);
    const [mountedModals, setMountedModals] = useState({ compose: false, report: false });
    const mountModal = kind => setMountedModals(current => current[kind] ? current : { ...current, [kind]: true });
    const [reportId, setReportId] = useState(null);
    const [regionOpen, setRegionOpen] = useState(false);
    const { onDelete, onShare, requestReport } = useFeedActions();
    const ownView = view === 'mine' || view === 'drafts';
    const requiresLogin = view !== 'all';
    const listParams = { page: page - 1, size: FEED_PAGE_SIZE,
        ...(ownView ? { drafts: view === 'drafts' } : { region: region || undefined, favoriteOnly: view === 'favorites' }) };
    const list = useQuery({ queryKey: ownView ? feedKeys.mine(listParams) : feedKeys.list(listParams),
        queryFn: ({ signal }) => ownView ? feedService.myPosts(listParams, signal) : feedService.list(listParams, signal),
        enabled: enabled && (!requiresLogin || Boolean(user)), staleTime: 30_000, placeholderData: keepPreviousData });
    const listRef = useRef(null);
    const unavailable = [config, list].some(query => [401, 403].includes(httpStatusOf(query.error)));
    const posts = (list.data?.content || []).filter(post => post.state !== 'DELETED');
    const blockingError = isBlockingListReadError(list.error, posts);
    const backgroundFailure = [config, ...(!blockingError ? [list] : [])].find(query => query.isError && query.data !== undefined);
    useListRefreshAnchor(listRef, `${view}:${region || ''}:${page}`, list.isFetching && !list.isPlaceholderData, unavailable ? null : list.data);
    const totalPages = Math.max(1, Math.ceil(feedTotal(list.data) / FEED_PAGE_SIZE));
    useEffect(() => {
        if (!list.isSuccess || list.isFetching || list.isPlaceholderData || page <= totalPages) return;
        setParams(previous => {
            if (previous.get('page') !== params.get('page')) return previous;
            const next = new URLSearchParams(previous);
            next.set('page', String(totalPages));
            return next;
        }, { replace: true });
    }, [list.isSuccess, list.isFetching, list.isPlaceholderData, page, totalPages, params, setParams]);
    const loginFrom = { pathname: '/feed', search: params.size ? `?${params}` : '' };
    const rememberLogin = () => saveRedirect(`${loginFrom.pathname}${loginFrom.search}`);
    const setFilter = (key, value) => {
        const next = new URLSearchParams(params);
        if (value == null) next.delete(key); else next.set(key, value);
        next.set('page', '1');
        setParams(next);
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    };
    const write = () => { mountModal('compose'); setComposer({ post: null }); };
    const renderList = () => {
        if (config.isPending && !config.data) return <FeedSkeleton />;
        if (config.isError && (!config.data || [401, 403].includes(httpStatusOf(config.error)))) return <DataState state="error" title="피드 상태를 불러오지 못했어요." error={config.error} onRetry={config.refetch} retrying={config.isFetching} />;
        if (!enabled) return <DataState state="empty" kind="feed" title="피드를 준비하고 있어요." description="글·사진을 나눌 수 있도록 준비 중이에요." />;
        if (requiresLogin && !user) return <DataState state="empty" title="로그인하면 이용할 수 있어요." action={<Link to="/login" state={{ from: loginFrom }} onClick={rememberLogin}>로그인</Link>} />;
        if (list.isPending && !list.data) return <FeedSkeleton />;
        if (blockingError || list.isError && unavailable) return <DataState state="error" title="게시물을 불러오지 못했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />;
        if (!posts.length) return <DataState state="empty" kind="feed" title={view === 'drafts' ? '임시저장한 글이 없어요.' : !ownView && region ? '이 지역에 게시된 글이 없어요.' : '아직 게시물이 없어요.'}
            description={view === 'favorites' ? '찜한 가게가 연결된 게시물을 모아 보여줘요.' : undefined} />;
        return <div className="reserve-feed-list" aria-busy={list.isFetching}>
            {posts.map(post => <FeedPostCard key={post.id} post={post} listItemId={`post:${post.id}`} onEdit={item => { mountModal('compose'); setComposer({ post: item }); }}
                onDelete={onDelete} onShare={onShare} onReport={item => requestReport(item, id => { mountModal('report'); setReportId(id); })} />)}
        </div>;
    };
    // 목록 실패 뒤 첫 닉네임 저장/작성으로 재조회해도 열린 작성기를 페이지 골격으로 언마운트하지 않는다.
    if (!composer && !reportId && (!config.data && config.isPending || enabled && (!requiresLogin || user) && !list.data && list.isPending)) {
        return <FeedPageSkeleton view={view} enabled={enabled || config.isPending} signedIn={Boolean(user)} notificationsEnabled={notificationCount.enabled} />;
    }
    return <section ref={listRef} className="reserve-benefits-page reserve-feed-page reserve-feed-directory" aria-labelledby="feed-title">
        <PageTitle level={1} id="feed-title">피드</PageTitle>
        {enabled && <div className="reserve-feed-directory-tools" data-discovery-swipe-ignore="true">
            <div className="reserve-feed-write-tools">
                {user ? <><IconTool label="새 글 작성" icon={<InterfaceIcon name="compose" />} onClick={write}
                    unavailableReason={profile.isError && (profile.data === undefined || [401, 403].includes(httpStatusOf(profile.error))) ? '공개 프로필을 다시 불러온 뒤 작성해주세요.' : ''} />
                    <IconTool label={view === 'drafts' ? '최신 피드로 돌아가기' : '임시저장한 글'} icon={<InterfaceIcon name="folder" />} active={view === 'drafts'} onClick={() => setFilter('view', view === 'drafts' ? 'all' : 'drafts')} />
                    {notificationCount.enabled && <IconTool label={`피드 알림${notificationCount.data?.unread ? `, 안 읽은 알림 ${notificationCount.data.unread}개` : ''}`} to="/feed/notifications"
                        icon={<span className="reserve-feed-notification-icon"><BellOutlined />{notificationCount.data?.unread > 0 && <span className="reserve-feed-notification-badge" aria-hidden="true">{Math.min(99, notificationCount.data.unread)}{notificationCount.data.unread > 99 ? '+' : ''}</span>}</span>} />}</>
                    : <IconTool label="로그인하고 글쓰기" icon={<InterfaceIcon name="compose" />} to="/login" onClick={rememberLogin} />}
            </div>
            <div className="reserve-feed-column-tools">
            {!ownView && <IconTool label={`피드 지역 선택, ${region ? formatRegionLabel(region) : '전체 피드'}`}
                kind="navigation" icon={<InterfaceIcon name="map" />} active={Boolean(region)} expanded={regionOpen} onClick={() => setRegionOpen(true)} />}
            <FilterMenu appearance="plain" options={views} value={view} aria-label="피드 보기" onChange={value => setFilter('view', value)} />
            </div>
        </div>}
        {enabled && user && profile.isError && (profile.data === undefined || [401, 403].includes(httpStatusOf(profile.error))) && <DataState state="error" title="공개 프로필을 불러오지 못했어요." error={profile.error} onRetry={profile.refetch} retrying={profile.isFetching} />}
        {enabled && user && profile.isError && profile.data !== undefined && ![401, 403].includes(httpStatusOf(profile.error)) && <DataState compact state="error" title="공개 프로필을 갱신하지 못했어요." error={profile.error} onRetry={profile.refetch} retrying={profile.isFetching} />}
        {!unavailable && backgroundFailure && <DataState compact state="error" title="피드를 갱신하지 못했어요." error={backgroundFailure.error} onRetry={backgroundFailure.refetch} retrying={backgroundFailure.isFetching} />}
        <AnimatedContent className="reserve-feed-content" motionKey={`${view}:${region || ''}:${page}`} ready={!list.isPlaceholderData && !list.isPending}>{renderList()}</AnimatedContent>
        {enabled && !unavailable && !blockingError && list.data && (!requiresLogin || user) && feedTotal(list.data) > FEED_PAGE_SIZE && <nav className="reserve-feed-pagination" aria-label="피드 페이지">
            <Pagination current={page} total={feedTotal(list.data)} pageSize={FEED_PAGE_SIZE} showSizeChanger={false}
                onChange={value => { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }} />
        </nav>}
        <FeedRegionSheet open={regionOpen && !ownView && enabled} value={region || ''} onClose={() => setRegionOpen(false)}
            onApply={value => { setFilter('region', value); setRegionOpen(false); }} />
        {mountedModals.compose && user && enabled && !unavailable && <FeedEditor open={Boolean(composer)}
            post={composer?.post} config={config.data}
            onClose={() => setComposer(null)} onSaved={(saved, draft) => {
                setComposer(null);
                if (draft) setFilter('view', 'drafts'); else if (view === 'drafts') setFilter('view', 'mine');
            }} />}
        <Suspense fallback={<FeedModalLoading kind="report" open={Boolean(reportId)} onClose={() => setReportId(null)} />}>
            {mountedModals.report && <FeedReportModal postId={reportId} onClose={() => setReportId(null)} />}
        </Suspense>
    </section>;
}
