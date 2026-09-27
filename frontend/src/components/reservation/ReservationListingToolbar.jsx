import PropTypes from 'prop-types';
import { Typography } from 'antd';
import StoreListViewToggle from '../store/StoreListViewToggle';
import FilterMenu from '../common/FilterMenu';

const { Text } = Typography;

/** 가게 목록과 동일한 보기·필터 메뉴를 예약 목록의 데이터와 문구에 맞춰 사용한다. */
export default function ReservationListingToolbar({ view, onViewChange, status, onStatusChange,
    statusOptions, sort, onSortChange, sortOptions, store, onStoreChange, storeOptions,
    count, disabled, storeDisabled = false, storeLoading = false, label = '예약 목록 필터' }) {
    return (
        <div className="reserve-explore-filters reserve-reservation-filters" aria-label={label}>
            <StoreListViewToggle view={view} onChange={onViewChange} disabled={disabled} />
            {!disabled && count != null && <Text className="reserve-explore-count" type="secondary">{count.toLocaleString('ko-KR')}건</Text>}
            <div className="reserve-explore-filter-controls">
                {storeOptions && onStoreChange && (
                    <FilterMenu appearance="plain"
                        className="reserve-reservation-store-filter"
                        aria-label="가게 필터" value={store} options={storeOptions}
                        onChange={onStoreChange} disabled={disabled || storeDisabled} loading={storeLoading} />
                )}
                <FilterMenu appearance="plain"
                    className="reserve-explore-domain-filter reserve-reservation-status-filter"
                    aria-label="예약 상태" value={status} options={statusOptions}
                    onChange={onStatusChange} disabled={disabled} />
                <FilterMenu appearance="plain"
                    className="reserve-explore-sort-filter reserve-reservation-sort-filter" aria-label="예약 정렬"
                    value={sort} options={sortOptions} onChange={onSortChange} disabled={disabled} />
            </div>
        </div>
    );
}

ReservationListingToolbar.propTypes = {
    view: PropTypes.oneOf(['cards', 'list']).isRequired,
    onViewChange: PropTypes.func.isRequired,
    status: PropTypes.string.isRequired,
    onStatusChange: PropTypes.func.isRequired,
    statusOptions: PropTypes.array.isRequired,
    sort: PropTypes.string.isRequired,
    onSortChange: PropTypes.func.isRequired,
    sortOptions: PropTypes.array.isRequired,
    store: PropTypes.string,
    onStoreChange: PropTypes.func,
    storeOptions: PropTypes.array,
    count: PropTypes.number,
    disabled: PropTypes.bool.isRequired,
    storeDisabled: PropTypes.bool,
    storeLoading: PropTypes.bool,
    label: PropTypes.string,
};
