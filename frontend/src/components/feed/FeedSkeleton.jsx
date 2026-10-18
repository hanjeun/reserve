import PropTypes from 'prop-types';
import { useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import Bone from '../common/Bone';
import IconToolSkeleton from '../common/IconToolSkeleton';
import SkeletonText from '../common/SkeletonText';
import PageContainer from '../common/PageContainer';
import { PageTitle } from '../common/PageTypography';
import { FilterMenuSkeleton } from '../common/FilterToolbarSkeleton';
import { StateIllustrationSkeleton } from '../common/StateIllustration';
import { fontSize, spacing } from '../../styles/tokens';
import ManagementListToolbar from '../common/ManagementListToolbar';
import { REPORT_STATUS_OPTIONS } from '../admin/managementReviewQuery';
import { FEED_NOTIFICATION_RETENTION_NOTE, FEED_NOTIFICATION_VIEWS } from '../../constants/feedNotifications';
import { readFeedMediaHint } from '../../utils/feedMediaHint';

function FeedPreparationSkeleton({ title = '피드를 준비하고 있어요.', description = '글·사진을 나눌 수 있도록 준비 중이에요.' }) {
    return <section className="reserve-data-state" aria-hidden="true" style={{
        '--data-state-icon-size': spacing[10], '--data-state-title-size': fontSize['2xl'], '--data-state-description-size': fontSize.base,
    }}>
        <StateIllustrationSkeleton size="md" />
        <div className="reserve-data-state__copy"><p className="reserve-data-state__title"><SkeletonText>{title}</SkeletonText></p>
            {description && <p className="reserve-data-state__description"><SkeletonText>{description}</SkeletonText></p>}</div>
    </section>;
}
FeedPreparationSkeleton.propTypes = { title: PropTypes.string, description: PropTypes.string };

export function FeedPageSkeleton({ kind = 'feed', view = 'all', enabled = true, signedIn = false, notificationsEnabled = false, postId }) {
    const detail = kind === 'feed-detail';
    const profile = kind === 'feed-author';
    if (!detail && !profile) return <section className="reserve-benefits-page reserve-feed-page reserve-feed-directory" aria-label="피드를 불러오는 중" aria-busy="true">
        <PageTitle level={1} loading>피드</PageTitle>
        {enabled && <div className="reserve-feed-directory-tools" aria-hidden="true">
            <div className="reserve-feed-write-tools"><IconToolSkeleton />
                {signedIn && <IconToolSkeleton />}{signedIn && notificationsEnabled && <IconToolSkeleton />}</div>
            <div className="reserve-feed-column-tools">
                {view !== 'mine' && view !== 'drafts' && <IconToolSkeleton kind="navigation" />}
                <FilterMenuSkeleton select={{ value: view, options: [{ value: 'all', label: '최신순' }, { value: 'favorites', label: '관심 가게' }, { value: 'mine', label: '내 게시물' }, { value: 'drafts', label: '임시저장' }] }} />
            </div>
        </div>}
        {enabled ? <FeedSkeleton /> : <FeedPreparationSkeleton />}
    </section>;
    return <PageContainer size="md" paddingTop="12px" paddingX="0px" paddingBottom="40px" style={{ maxWidth: 640, backgroundColor: 'transparent' }} className="reserve-feed-page" aria-label="피드를 불러오는 중" aria-busy="true">
        <header className="reserve-feed-heading"><IconToolSkeleton kind="navigation" /><PageTitle level={1} loading>{detail ? '게시물' : '공개 프로필'}</PageTitle></header>
        {profile && <div className="reserve-feed-profile"><Bone width={64} height={64} borderRadius={50} />
            <div><h2><SkeletonText>공개 닉네임</SkeletonText></h2><p><SkeletonText>소개를 불러오는 중</SkeletonText></p></div></div>}
        <FeedSkeleton detail={detail} postId={postId} />
    </PageContainer>;
}
FeedPageSkeleton.propTypes = { kind: PropTypes.string, ownView: PropTypes.bool, signedIn: PropTypes.bool, view: PropTypes.string, region: PropTypes.string, enabled: PropTypes.bool, notificationsEnabled: PropTypes.bool, postId: PropTypes.number };

export function FeedReportListSkeleton({ label = '피드·가게 소식 신고를 불러오는 중' }) {
    return <ul className="reserve-feed-report-list" aria-label={label} aria-busy="true">
        {['first', 'second', 'third', 'fourth'].map(key => <li key={key}><div><Bone width={110} height={22} />
            <Bone width={150} height={13} style={{ marginTop: 8 }} /></div><Bone width={68} height={36} /></li>)}
    </ul>;
}
FeedReportListSkeleton.propTypes = { label: PropTypes.string };

export function FeedNotificationsSkeleton() {
    return <ul className="reserve-feed-notification-list" aria-label="피드 알림을 불러오는 중" aria-busy="true">
        {['first', 'second', 'third', 'fourth'].map(key => <li key={key}><div className="reserve-feed-notification-skeleton" aria-hidden="true">
            <Bone width={36} height={36} borderRadius={50} />
            <div><Bone width={90} height={18} /><Bone width={190} height={16} style={{ marginTop: 6 }} /><Bone width={50} height={13} style={{ marginTop: 6 }} /></div>
        </div></li>)}
    </ul>;
}

export function FeedNotificationsPageSkeleton({ view = 'all', enabled = true }) {
    return <PageContainer size="md" className="reserve-feed-page reserve-feed-notifications-page" style={{ maxWidth: 640 }} aria-label="피드 알림을 불러오는 중" aria-busy="true">
        <PageTitle level={1} loading>피드 알림</PageTitle>
        <div className="reserve-feed-notification-tools" aria-hidden="true">
            <div className="reserve-feed-notification-back"><IconToolSkeleton kind="navigation" /></div>
            <IconToolSkeleton />
            <FilterMenuSkeleton select={{ value: view, options: FEED_NOTIFICATION_VIEWS }} />
        </div>
        {enabled ? <FeedNotificationsSkeleton /> : <FeedPreparationSkeleton title="피드 알림을 준비하고 있어요." description={null} />}
        <p className="reserve-feed-note"><SkeletonText>{FEED_NOTIFICATION_RETENTION_NOTE}</SkeletonText></p>
    </PageContainer>;
}
FeedNotificationsPageSkeleton.propTypes = { view: PropTypes.string, enabled: PropTypes.bool };

export function FeedReportsSkeleton({ mode = 'reports', status = 'ALL' }) {
    return <div><ManagementListToolbar leading={<div className="reserve-segmented"><Bone width="100%" height={44} /></div>}
        trailing={mode !== 'audit' && <FilterMenuSkeleton select={{ value: status, options: REPORT_STATUS_OPTIONS }} />} />
        <FeedReportListSkeleton label={mode === 'comments' ? '댓글 신고를 불러오는 중' : mode === 'audit' ? '처리 기록을 불러오는 중' : undefined} /></div>;
}
FeedReportsSkeleton.propTypes = { mode: PropTypes.string, status: PropTypes.string };

function FeedMediaSkeleton({ images }) {
    if (!images) return <div className="reserve-feed-gallery"><Bone width="100%" height={260} borderRadius={12} /></div>;
    if (!images.length) return null;
    return <div className="reserve-feed-gallery" aria-hidden="true">
        <div className={`reserve-feed-media-strip${images.length === 1 ? ' is-single' : ''}`}>
            {images.map((image, index) => <div key={index} className="reserve-feed-media-item"
                style={{ '--feed-media-ratio': image.width > 0 && image.height > 0 ? image.width / image.height : 4 / 3 }}>
                <Bone height="100%" borderRadius="inherit" />
            </div>)}
        </div>
    </div>;
}
FeedMediaSkeleton.propTypes = { images: PropTypes.arrayOf(PropTypes.object) };

export default function FeedSkeleton({ detail = false, postId }) {
    const client = useContext(QueryClientContext);
    const images = detail ? readFeedMediaHint(client, postId) : undefined;
    return <div className="reserve-feed-skeleton" aria-label="피드를 불러오는 중" aria-busy="true" data-feed-loading="true">
        {Array.from({ length: detail ? 1 : 3 }, (_, index) => <div className="reserve-feed-post" key={index}>
            <div className="reserve-feed-post-avatar"><Bone width={36} height={36} borderRadius={50} /></div>
            <div className="reserve-feed-post-content">
                <header className="reserve-feed-post-header"><div className="reserve-feed-post-byline"><Bone width={100} height={16} /><Bone width={48} height={14} /></div></header>
                <div className="reserve-feed-post-text"><Bone width="85%" height={16} /><Bone width="62%" height={16} style={{ marginTop: 6 }} /></div>
                <FeedMediaSkeleton images={images} />
                <div className="reserve-feed-interactions" aria-hidden="true">{[0, 1, 2].map(action => <div key={action} style={{ display: 'grid', placeItems: 'center', width: 44, height: 44 }}><Bone width={20} height={20} borderRadius={6} /></div>)}</div>
            </div>
        </div>)}
    </div>;
}
FeedSkeleton.propTypes = { detail: PropTypes.bool, postId: PropTypes.number };
