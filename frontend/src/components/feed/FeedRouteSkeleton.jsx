import PropTypes from 'prop-types';
import { useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { FeedNotificationsPageSkeleton, FeedPageSkeleton } from './FeedSkeleton';
import useAuthStore from '../../store/useAuthStore';
import { feedKeys } from '../../hooks/feedQueries';
import { feedRegion, FEED_DIRECTORY_VIEWS } from '../../utils/feed';
import { interactionKeys } from '../../hooks/feedInteractionQueries';

export default function FeedRouteSkeleton({ pathname, search = '' }) {
    const detail = pathname.startsWith('/feed/posts/');
    const profile = pathname.startsWith('/feed/u/');
    const signedIn = useAuthStore((state) => Boolean(state.user));
    // 인증 복구 전 부트 셸에는 QueryClient가 없다. 뼈대는 조회를 시작하지 않고 기존 공개 설정만 읽는다.
    const client = useContext(QueryClientContext);
    const config = client?.getQueryData(feedKeys.config());
    const interactions = client?.getQueryData(interactionKeys.config());
    const params = new URLSearchParams(search);
    const view = FEED_DIRECTORY_VIEWS.some(item => item.value === params.get('view')) ? params.get('view') : 'all';
    if (pathname === '/feed/notifications') return <FeedNotificationsPageSkeleton view={params.get('view') === 'unread' ? 'unread' : 'all'} enabled={interactions?.notificationsEnabled !== false} />;
    return (
        <FeedPageSkeleton
            kind={detail ? 'feed-detail' : profile ? 'feed-author' : 'feed'}
            postId={detail ? Number(pathname.match(/^\/feed\/posts\/([1-9]\d*)\/?$/)?.[1]) : undefined}
            signedIn={signedIn}
            authPending={!client}
            enabled={config?.enabled !== false}
            notificationsEnabled={interactions?.notificationsEnabled !== false}
            ownView={view === 'mine' || view === 'drafts'}
            view={view}
            region={feedRegion(params.get('region')) || ''}
        />
    );
}
FeedRouteSkeleton.propTypes = { pathname: PropTypes.string.isRequired, search: PropTypes.string };
