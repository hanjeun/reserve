import PropTypes from 'prop-types';
import Bone from '../common/Bone';
import SkeletonText from '../common/SkeletonText';
import Card from '../common/Card';
import Button from '../common/Button';
import LoadingStatus from '../common/LoadingStatus';
import ListingControlsSkeleton from '../common/ListingControlsSkeleton';
import { RefreshToolbarSkeleton } from '../layout/routeSkeletonParts';
import { MY_WAITING_STATUSES, MY_WAITING_SORTS } from './waitingDirectoryFilters';
import { radius } from '../../styles/tokens';
import IconToolSkeleton from '../common/IconToolSkeleton';

export const MY_WAITING_HELP = '열려 있는 동안 대기 현황이 자동으로 갱신돼요. 입장·취소한 내역은 당일에 확인할 수 있어요.';

/** 웨이팅은 사진 없는 명단이다. 실제 명단의 행·카드 틀을 로딩에도 그대로 쓴다. */
export function WaitingListSkeleton({ view = 'list', count = 3, personal = false }) {
    const cards = view === 'cards';
    const content = <>
        <div className="reserve-waiting-entry-content">
            <div className="reserve-waiting-entry-head" style={{ minHeight: cards ? 28 : 24 }}>
                <Bone width={44} height={cards ? 20 : 16} />
                <Bone width={62} height={24} borderRadius={6} />
            </div>
            <div className="reserve-waiting-name" style={{ minHeight: cards ? 24 : 20 }}>
                <Bone width={personal ? 132 : 92} height={cards ? 15 : 13} style={{ maxWidth: '65%' }} />
                <Bone width={28} height={13} />
            </div>
            {personal
                ? <div className="reserve-waiting-form-help" style={{ minHeight: 20, display: 'flex', alignItems: 'center' }}><Bone width="75%" height={13} /></div>
                : <div className="reserve-waiting-times" style={{ minHeight: 18, alignItems: 'center' }}><Bone width={86} height={12} /></div>}
        </div>
        <div className="reserve-waiting-actions">
            <Bone width={50} height={36} borderRadius={radius.md} />
            <Bone width={personal ? 74 : 50} height={36} borderRadius={radius.md} />
        </div>
    </>;
    return <ul className={`reserve-waiting-entries reserve-waiting-entries--${view}${cards ? ' rsv-store-grid' : ''}`} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => `waiting-${index}`).map(key => (
            <li key={key} className={cards ? 'reserve-waiting-card-entry' : 'reserve-waiting-entry'}>
                {cards
                    ? <Card className="reserve-waiting-card"><Card.Body><div className="reserve-waiting-card-body">{content}</div></Card.Body></Card>
                    : content}
            </li>
        ))}
    </ul>;
}
WaitingListSkeleton.propTypes = {
    view: PropTypes.oneOf(['list', 'cards']), count: PropTypes.number, personal: PropTypes.bool,
};

export function WaitingFiltersSkeleton({ business = false }) {
    return <div className={`reserve-explore-filters${business ? ' reserve-waiting-filters' : ''}`} aria-hidden="true">
        <div className="reserve-waiting-view-toggle"><IconToolSkeleton /></div>
        {business
            ? <div className="reserve-waiting-filter-options">
                <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}><Bone width={106} height={16} /></div>
                <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}><Bone width={76} height={16} /></div>
            </div>
            : <Bone width={72} height={14} />}
    </div>;
}
WaitingFiltersSkeleton.propTypes = { business: PropTypes.bool };

export function WaitingTabSkeleton({ view = 'list', intakeMode = 'BOTH', paused = false }) {
    return <LoadingStatus className="reserve-waiting-tab" aria-label="대기 명단을 불러오는 중" aria-busy="true">
        <WaitingFiltersSkeleton business />
        <RefreshToolbarSkeleton search autoRefreshDomain="WAITING" />
        <div className="reserve-waiting-summary" aria-hidden="true">
            <div><h3><SkeletonText>대기 명단</SkeletonText></h3><div style={{ height: 20, marginTop: 4, display: 'flex', alignItems: 'center' }}><Bone width={204} height={13} /></div></div>
            <div className="reserve-waiting-actions">
                <Button variant={paused ? 'primary' : 'outline'} size="sm" disabled><SkeletonText>{paused ? '접수 시작' : '접수 중지'}</SkeletonText></Button>
                {['ONSITE', 'BOTH'].includes(intakeMode) && <Button variant="outline" size="sm" disabled><SkeletonText>현장 접수 QR</SkeletonText></Button>}
                <Button variant="primary" size="sm" disabled><SkeletonText>대기 접수</SkeletonText></Button>
            </div>
        </div>
        <div className="reserve-waiting-form-help" aria-hidden="true" style={{ minHeight: 20, display: 'flex', alignItems: 'center' }}><Bone width="min(360px, 90%)" height={13} /></div>
        <WaitingListSkeleton view={view} />
    </LoadingStatus>;
}
WaitingTabSkeleton.propTypes = { view: PropTypes.oneOf(['list', 'cards']), intakeMode: PropTypes.string, paused: PropTypes.bool };

export function MyWaitingSkeleton({ view = 'list', statusLabel = MY_WAITING_STATUSES[0].label, sortLabel = MY_WAITING_SORTS[0].label }) {
    return <LoadingStatus className="reserve-waiting-tab" aria-label="내 웨이팅을 불러오는 중" aria-busy="true">
        <ListingControlsSkeleton count={0} className="reserve-reservation-filters" filters={[
            { value: 'status', options: [{ value: 'status', label: statusLabel }], className: 'reserve-explore-domain-filter reserve-reservation-status-filter' },
            { value: 'sort', options: [{ value: 'sort', label: sortLabel }], className: 'reserve-explore-sort-filter reserve-reservation-sort-filter' },
        ]} />
        <RefreshToolbarSkeleton search autoRefreshDomain="WAITING" />
        <p className="reserve-waiting-form-help"><SkeletonText>{MY_WAITING_HELP}</SkeletonText></p>
        <WaitingListSkeleton view={view} personal />
    </LoadingStatus>;
}
MyWaitingSkeleton.propTypes = { view: PropTypes.oneOf(['list', 'cards']), statusLabel: PropTypes.string, sortLabel: PropTypes.string };
