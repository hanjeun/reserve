import PropTypes from 'prop-types';
import LoadingStatus from '../common/LoadingStatus';
import ListingControlsSkeleton from '../common/ListingControlsSkeleton';
import StoreCardSkeleton from '../common/StoreCardSkeleton';
import StoreListRowSkeleton from '../store/StoreListRowSkeleton';
import PageContainer from '../common/PageContainer';
import { PageTitle, PageDescription } from '../common/PageTypography';
import { RefreshToolbarSkeleton } from '../layout/routeSkeletonParts';
import { WAITING_STORE_STATUSES, WAITING_STORE_SORTS } from './waitingDirectoryFilters';
import IconToolSkeleton from '../common/IconToolSkeleton';
import useAuthStore from '../../store/useAuthStore';

// 첫 화면에 필요한 공개 목록 골격은 업무용 Card·명단 골격을 가져오지 않는다.
export function WaitingStoresContentSkeleton({ view = 'cards' }) {
    const showFavorite = useAuthStore(state => state.isLoggedIn);
    return <div className={view === 'cards' ? 'rsv-store-grid' : 'reserve-store-list-rows'} aria-hidden="true">
        {view === 'cards'
            ? <StoreCardSkeleton count={4} showFavorite={showFavorite} extraTools={<IconToolSkeleton />} />
            : <StoreListRowSkeleton count={4} showFavorite={showFavorite} extraTools={<IconToolSkeleton />} />}
    </div>;
}
WaitingStoresContentSkeleton.propTypes = { view: PropTypes.oneOf(['list', 'cards']) };

export function WaitingStoresSkeleton({ view = 'cards', status = 'ALL', sort = 'recommended' }) {
    return <LoadingStatus aria-label="웨이팅 가게를 불러오는 중" aria-busy="true">
        <ListingControlsSkeleton count={0} region filters={[
            { value: status, options: WAITING_STORE_STATUSES, className: 'reserve-explore-domain-filter' },
            { value: sort, options: WAITING_STORE_SORTS, className: 'reserve-explore-sort-filter' },
        ]} />
        <RefreshToolbarSkeleton search autoRefreshDomain="WAITING" />
        <WaitingStoresContentSkeleton view={view} />
    </LoadingStatus>;
}
WaitingStoresSkeleton.propTypes = { view: PropTypes.oneOf(['list', 'cards']), status: PropTypes.string, sort: PropTypes.string };

/** 라우트 청크와 첫 데이터 조회가 제목·필터·명단의 같은 골격을 사용한다. */
export function WaitingPageSkeleton({ view = 'cards', status = 'ALL', sort = 'recommended' }) {
    return <PageContainer size="xl" paddingTop="32px">
        <div className="reserve-waiting-heading"><PageTitle level={1} loading>웨이팅</PageTitle><PageDescription loading>접수 가능한 가게를 찾고, 내 예약에서 대기 현황을 확인해요.</PageDescription></div>
        <WaitingStoresSkeleton view={view} status={status} sort={sort} />
    </PageContainer>;
}
WaitingPageSkeleton.propTypes = { view: PropTypes.oneOf(['list', 'cards']), status: PropTypes.string, sort: PropTypes.string };
