import PropTypes from 'prop-types';
import { EnvironmentOutlined } from '@ant-design/icons';
import FilterMenu from '../common/FilterMenu';
import StoreListViewToggle from '../store/StoreListViewToggle';
import { formatRegionLabel } from '../../constants/regions';
import { WAITING_STORE_STATUSES, WAITING_STORE_SORTS } from './waitingDirectoryFilters';

export default function WaitingStoreToolbar({ view, onViewChange, count, region, regionOpen, onRegionOpen,
    status, onStatusChange, sort, onSortChange, disabled }) {
    const regionLabel = region ? formatRegionLabel(region) : '전체 지역';
    return <div className="reserve-explore-filters" aria-label="웨이팅 가게 보기">
        <StoreListViewToggle view={view} onChange={onViewChange} disabled={disabled} />
        <span className="reserve-explore-count">{count.toLocaleString('ko-KR')}개 가게</span>
        <div className="reserve-explore-filter-controls">
            <button type="button" className={`reserve-explore-region-trigger${region ? ' is-active' : ''}`}
                aria-haspopup="dialog" aria-expanded={regionOpen} aria-label={`지역 필터, ${regionLabel}`}
                title={regionLabel} onClick={onRegionOpen} disabled={disabled}>
                <EnvironmentOutlined aria-hidden="true" />
            </button>
            <FilterMenu appearance="plain" className="reserve-explore-domain-filter" aria-label="웨이팅 접수 상태"
                value={status} onChange={onStatusChange} options={WAITING_STORE_STATUSES} disabled={disabled} />
            <FilterMenu appearance="plain" className="reserve-explore-sort-filter" aria-label="가게 정렬"
                value={sort} onChange={onSortChange} options={WAITING_STORE_SORTS} disabled={disabled} />
        </div>
    </div>;
}
WaitingStoreToolbar.propTypes = {
    view: PropTypes.oneOf(['cards', 'list']).isRequired, onViewChange: PropTypes.func.isRequired,
    count: PropTypes.number.isRequired, region: PropTypes.string, regionOpen: PropTypes.bool.isRequired,
    onRegionOpen: PropTypes.func.isRequired, status: PropTypes.string.isRequired, onStatusChange: PropTypes.func.isRequired,
    sort: PropTypes.string.isRequired, onSortChange: PropTypes.func.isRequired, disabled: PropTypes.bool,
};
