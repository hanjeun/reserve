import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import FilterMenu from '../common/FilterMenu';
import ListingControlsSkeleton from '../common/ListingControlsSkeleton';
import StoreListViewToggle from './StoreListViewToggle';
import { SERVICE_DOMAIN_FILTER_OPTIONS } from '../../constants';
import { formatRegionLabel } from '../../constants/regions';

const { Text } = Typography;

/** 공개 탐색과 내 가게 관리가 공유하는 목록 조작 화면. 데이터와 정렬 규칙은 각 화면이 소유한다. */
export default function StoreListingToolbar({
    view, onViewChange, region, regionOpen, onRegionOpen,
    domain, onDomainChange, sort, onSortChange, sortOptions,
    count, disabled = false, initialLoading = false, sortDisabled = false, sortLoading = false,
    label = '가게 목록 필터', className = '', onAnimationEnd,
}) {
    const regionLabel = region ? formatRegionLabel(region) : '전체 지역';
    if (initialLoading) return <ListingControlsSkeleton count={count} region={Boolean(onRegionOpen)} className={className}
        onAnimationEnd={onAnimationEnd} filters={[
            { value: domain, options: SERVICE_DOMAIN_FILTER_OPTIONS, className: 'reserve-explore-domain-filter' },
            { value: sort, options: sortOptions, className: 'reserve-explore-sort-filter' },
        ]} />;

    return (
        <div
            className={['reserve-explore-filters', className].filter(Boolean).join(' ')}
            aria-label={label}
            onAnimationEnd={onAnimationEnd}
        >
            <StoreListViewToggle view={view} onChange={onViewChange} disabled={disabled} />
            {count != null && <Text className="reserve-explore-count" type="secondary">{count.toLocaleString('ko-KR')}개 가게</Text>}
            <div className="reserve-explore-filter-controls">
                {onRegionOpen && <button
                    type="button"
                    className={['reserve-explore-region-trigger', region ? 'is-active' : ''].filter(Boolean).join(' ')}
                    aria-haspopup="dialog"
                    aria-expanded={regionOpen}
                    aria-label={`지역 필터, ${regionLabel}`}
                    title={regionLabel}
                    disabled={disabled}
                    aria-busy={disabled || undefined}
                    onClick={onRegionOpen}
                >
                    <EnvironmentOutlined aria-hidden="true" />
                </button>}
                <FilterMenu
                    appearance="plain"
                    className="reserve-explore-domain-filter"
                    aria-label="서비스 분야"
                    value={domain}
                    onChange={onDomainChange}
                    options={SERVICE_DOMAIN_FILTER_OPTIONS}
                    disabled={disabled}
                />
                <FilterMenu
                    appearance="plain"
                    className="reserve-explore-sort-filter"
                    aria-label="가게 정렬"
                    value={sort}
                    onChange={onSortChange}
                    options={sortOptions}
                    disabled={disabled || sortDisabled}
                    loading={sortLoading}
                />
            </div>
        </div>
    );
}

StoreListingToolbar.propTypes = {
    view: PropTypes.oneOf(['cards', 'list']).isRequired,
    onViewChange: PropTypes.func.isRequired,
    region: PropTypes.string,
    regionOpen: PropTypes.bool,
    onRegionOpen: PropTypes.func,
    domain: PropTypes.string,
    onDomainChange: PropTypes.func.isRequired,
    sort: PropTypes.string.isRequired,
    onSortChange: PropTypes.func.isRequired,
    sortOptions: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.node.isRequired })).isRequired,
    count: PropTypes.number,
    disabled: PropTypes.bool,
    initialLoading: PropTypes.bool,
    sortDisabled: PropTypes.bool,
    sortLoading: PropTypes.bool,
    label: PropTypes.string,
    className: PropTypes.string,
    onAnimationEnd: PropTypes.func,
};
