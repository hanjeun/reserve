import PropTypes from 'prop-types';
import Bone from '../common/Bone';
import Card from '../common/Card';
import LoadingStatus from '../common/LoadingStatus';
import ListingControlsSkeleton from '../common/ListingControlsSkeleton';
import StoreCardSkeleton from '../common/StoreCardSkeleton';
import StoreListRowSkeleton from '../store/StoreListRowSkeleton';
import { RefreshToolbarSkeleton } from '../layout/routeSkeletonParts';
import { WAITING_STORE_STATUSES, WAITING_STORE_SORTS } from './waitingDirectoryFilters';

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
            <Bone width={50} height={36} borderRadius={16} />
            <Bone width={personal ? 74 : 50} height={36} borderRadius={16} />
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
        <div className="reserve-waiting-view-toggle"><Bone width={44} height={44} borderRadius={10} /></div>
        {business
            ? <div className="reserve-waiting-filter-options">
                <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}><Bone width={106} height={16} /></div>
                <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}><Bone width={76} height={16} /></div>
            </div>
            : <Bone width={72} height={14} />}
    </div>;
}
WaitingFiltersSkeleton.propTypes = { business: PropTypes.bool };

export function WaitingTabSkeleton({ view = 'list' }) {
    return <LoadingStatus className="reserve-waiting-tab" aria-label="대기 명단을 불러오는 중" aria-busy="true">
        <WaitingFiltersSkeleton business />
        <RefreshToolbarSkeleton search />
        <div className="reserve-waiting-summary" aria-hidden="true">
            <div><h3>대기 명단</h3><div style={{ height: 20, marginTop: 4, display: 'flex', alignItems: 'center' }}><Bone width={204} height={13} /></div></div>
            <div className="reserve-waiting-actions"><Bone width={76} height={36} borderRadius={10} /><Bone width={76} height={36} borderRadius={10} /></div>
        </div>
        <div className="reserve-waiting-form-help" aria-hidden="true" style={{ minHeight: 20, display: 'flex', alignItems: 'center' }}><Bone width="min(360px, 90%)" height={13} /></div>
        <WaitingListSkeleton view={view} />
    </LoadingStatus>;
}
WaitingTabSkeleton.propTypes = { view: PropTypes.oneOf(['list', 'cards']) };

export function MyWaitingSkeleton({ view = 'list', statusLabel = '전체 상태', sortLabel = '최신 예약순' }) {
    return <LoadingStatus className="reserve-waiting-tab" aria-label="내 웨이팅을 불러오는 중" aria-busy="true">
        <ListingControlsSkeleton count={0} className="reserve-reservation-filters" filters={[
            { value: 'status', options: [{ value: 'status', label: statusLabel }], className: 'reserve-explore-domain-filter reserve-reservation-status-filter' },
            { value: 'sort', options: [{ value: 'sort', label: sortLabel }], className: 'reserve-explore-sort-filter reserve-reservation-sort-filter' },
        ]} />
        <RefreshToolbarSkeleton search />
        <p className="reserve-waiting-form-help">{MY_WAITING_HELP}</p>
        <WaitingListSkeleton view={view} personal />
    </LoadingStatus>;
}
MyWaitingSkeleton.propTypes = { view: PropTypes.oneOf(['list', 'cards']), statusLabel: PropTypes.string, sortLabel: PropTypes.string };

export function WaitingStoresSkeleton({ view = 'cards', status = 'ALL', sort = 'recommended' }) {
    return <LoadingStatus aria-label="웨이팅 가게를 불러오는 중" aria-busy="true">
        <ListingControlsSkeleton count={0} region filters={[
            { value: status, options: WAITING_STORE_STATUSES, className: 'reserve-explore-domain-filter' },
            { value: sort, options: WAITING_STORE_SORTS, className: 'reserve-explore-sort-filter' },
        ]} />
        <RefreshToolbarSkeleton search />
        <div className={view === 'cards' ? 'rsv-store-grid' : 'reserve-store-list-rows'} aria-hidden="true">
            {view === 'cards' ? <StoreCardSkeleton count={4} /> : <StoreListRowSkeleton count={4} />}
        </div>
    </LoadingStatus>;
}
WaitingStoresSkeleton.propTypes = { view: PropTypes.oneOf(['list', 'cards']), status: PropTypes.string, sort: PropTypes.string };
