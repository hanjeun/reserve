import PropTypes from 'prop-types';
import { PageTitle, PageDescription } from '../common/PageTypography';
import Bone from '../common/Bone';
import ListingControlsSkeleton from '../common/ListingControlsSkeleton';
import FilterToolbarSkeleton from '../common/FilterToolbarSkeleton';
import { reservationSkeletonFilters } from './reservationSkeletonFilters';

// 목록형 청크 로딩 뼈대가 함께 쓰는 제목·도구줄 조각. 앱 셸 청크에 들어가는 가벼운 부품만 둔다
// (페이지별 큰 뼈대는 RouteSkeletonPages — 별도 청크).

export function ListingHeader({ title, description, marginBottom = 32 }) {
    return <div style={{ marginBottom }}>
        <PageTitle>{title}</PageTitle>
        <PageDescription>{description}</PageDescription>
    </div>;
}
ListingHeader.propTypes = { title: PropTypes.string.isRequired, description: PropTypes.string.isRequired, marginBottom: PropTypes.number };

const RESERVATION_FILTERS = reservationSkeletonFilters();

export function ListingToolbarSkeleton({ filters = RESERVATION_FILTERS, count = 0, region = false, className = 'reserve-reservation-filters' }) {
    return <ListingControlsSkeleton filters={filters} count={count} region={region} className={className} />;
}
ListingToolbarSkeleton.propTypes = { filters: PropTypes.array, count: PropTypes.number, region: PropTypes.bool, className: PropTypes.string };

export function RefreshToolbarSkeleton({ search = false, viewControl = false }) {
    return <FilterToolbarSkeleton search={search ? {} : undefined}
        extra={viewControl ? <Bone width={44} height={44} borderRadius={10} /> : undefined}
        extraSkeleton={viewControl ? <Bone width={44} height={44} borderRadius={10} /> : undefined} spread={viewControl} />;
}
RefreshToolbarSkeleton.propTypes = { search: PropTypes.bool, viewControl: PropTypes.bool };

export function SegmentedControlSkeleton({ options, value, block = false }) {
    return <div className="reserve-segmented" aria-hidden="true"
        style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, width: block ? '100%' : undefined }}>
        {options.map(option => <span key={option.value}
            className={`reserve-segmented-btn${option.value === value ? ' reserve-segmented-btn--active' : ''}`}
            style={block ? { flex: 1 } : undefined}>
            <span className="reserve-skeleton-block reserve-route-skeleton-text">{option.label}</span>
        </span>)}
    </div>;
}
SegmentedControlSkeleton.propTypes = {
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.string.isRequired, label: PropTypes.string.isRequired,
    })).isRequired,
    value: PropTypes.string,
    block: PropTypes.bool,
};

