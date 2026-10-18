import PropTypes from 'prop-types';
import Bone from '../common/Bone';
import ManagementListToolbar from '../common/ManagementListToolbar';
import { FilterMenuSkeleton } from '../common/FilterToolbarSkeleton';
import { FeedReportListSkeleton } from '../feed/FeedSkeleton';
import { BENEFIT_STATE_OPTIONS } from './managementReviewQuery';
import IconToolSkeleton from '../common/IconToolSkeleton';

export function BenefitApplicationsSkeleton({ state = 'PENDING', showRefresh = true }) {
    return <div aria-label="혜택 신청을 불러오는 중" aria-busy="true">
        <ManagementListToolbar leading={<span className="reserve-management-count"><Bone width={48} height={16} /></span>}
            trailing={<FilterMenuSkeleton select={{ value: state, options: BENEFIT_STATE_OPTIONS }} />}
            refresh={showRefresh && <IconToolSkeleton />} />
        <FeedReportListSkeleton label="혜택 신청을 불러오는 중" />
    </div>;
}
BenefitApplicationsSkeleton.propTypes = { state: PropTypes.string, showRefresh: PropTypes.bool };
