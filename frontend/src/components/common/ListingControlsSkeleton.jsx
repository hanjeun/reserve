import PropTypes from 'prop-types';
import Bone from './Bone';
import { FilterMenuSkeleton } from './FilterToolbarSkeleton';

/** 보기 왼쪽, 지역·가게·상태·정렬 오른쪽인 목록 도구줄의 공통 골격. */
export default function ListingControlsSkeleton({ filters, count, region = false, className, onAnimationEnd }) {
    return <div className={['reserve-explore-filters', className].filter(Boolean).join(' ')} aria-hidden="true" onAnimationEnd={onAnimationEnd}>
        <Bone width={44} height={44} borderRadius={10} />
        {count != null && <Bone width={58} height={16} />}
        <div className="reserve-explore-filter-controls">
            {region && <Bone width={44} height={44} borderRadius={10} />}
            {filters.map((filter, index) => <FilterMenuSkeleton key={filter.key ?? index} select={filter} />)}
        </div>
    </div>;
}
ListingControlsSkeleton.propTypes = {
    filters: PropTypes.array.isRequired, count: PropTypes.number, region: PropTypes.bool,
    className: PropTypes.string, onAnimationEnd: PropTypes.func,
};
