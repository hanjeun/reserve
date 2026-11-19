import PropTypes from 'prop-types';
import Bone from '../common/Bone';
import ManagementListToolbar from '../common/ManagementListToolbar';
import { FilterMenuSkeleton } from '../common/FilterToolbarSkeleton';
import StoreCardSkeleton from '../common/StoreCardSkeleton';
import StoreListRowSkeleton from '../store/StoreListRowSkeleton';
import { BENEFIT_STATE_OPTIONS } from './managementReviewQuery';
import IconToolSkeleton from '../common/IconToolSkeleton';

export function BenefitApplicationsSkeleton({ state = 'PENDING', view = 'list', showRefresh = true }) {
    const cards = view === 'cards';
    return <div className="reserve-benefit-applications" aria-label="혜택 신청을 불러오는 중" aria-busy="true">
        <ManagementListToolbar leading={<div className="reserve-benefit-application-tools" aria-hidden="true">
            <IconToolSkeleton /><span className="reserve-management-count"><Bone width={48} height={16} /></span>
        </div>} trailing={<FilterMenuSkeleton select={{ value: state, options: BENEFIT_STATE_OPTIONS }} />}
            refresh={showRefresh && <IconToolSkeleton />} />
        <div className={cards ? 'rsv-mystore-grid' : 'reserve-store-list-rows'} aria-hidden="true">
            {cards ? <StoreCardSkeleton count={4} compact showFavorite={false} withActions />
                : <StoreListRowSkeleton count={4} className="reserve-mystore-list-row" compact showFavorite={false} extraTools={<Bone width={28} height={14} />} />}
        </div>
    </div>;
}
BenefitApplicationsSkeleton.propTypes = { state: PropTypes.string, view: PropTypes.oneOf(['cards', 'list']), showRefresh: PropTypes.bool };
