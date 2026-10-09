import { RESERVATION_STATUS_FILTER_OPTIONS, RESERVATION_SORT_OPTIONS } from '../../constants';

export const reservationSkeletonFilters = ({ status = 'ALL', sort = 'recent', store } = {}) => [
    ...(store !== undefined ? [{ value: store, options: [{ value: 'ALL', label: '전체 가게' }], placeholder: '가게', className: 'reserve-reservation-store-filter' }] : []),
    { value: status, options: RESERVATION_STATUS_FILTER_OPTIONS, className: 'reserve-explore-domain-filter reserve-reservation-status-filter' },
    { value: sort, options: RESERVATION_SORT_OPTIONS, className: 'reserve-explore-sort-filter reserve-reservation-sort-filter' },
];
