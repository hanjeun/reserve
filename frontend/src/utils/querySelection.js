const EMPTY_ALL_FILTERS = new Set(['domain', 'type']);
const ALL_FILTERS = new Set([
    ...EMPTY_ALL_FILTERS,
    'region', 'status', 'store', 'waitingStatus', 'newsType', 'period',
    'reservationStatus', 'reservationStore', 'advertisementStore', 'newsStore', 'newsState',
    'chatReportStatus', 'reportStatus', 'commentReportStatus', 'reportAuditAction', 'benefitState',
]);

const isAll = value => value === '' || typeof value === 'string' && value.toLowerCase() === 'all';

// URL의 전체 선택만 통일한다. 검색어와 실제 API enum 값은 변환하지 않는다.
export const writeQuerySelection = (key, value) => (
    ALL_FILTERS.has(key) && isAll(value) ? 'all' : value
);

export const readQuerySelection = (key, value) => {
    if (value == null || !ALL_FILTERS.has(key) || !isAll(value)) return value;
    if (key === 'region') return 'all';
    return EMPTY_ALL_FILTERS.has(key) ? '' : 'ALL';
};

export const normalizeQuerySelections = (params, keys) => {
    keys.forEach(key => {
        if (params.has(key)) params.set(key, writeQuerySelection(key, params.get(key)));
    });
    return params;
};
