import { resolveBusinessTab } from '../../constants/workspaces';
import { normalizeQuerySelections } from '../../utils/querySelection';

export const BUSINESS_TAB_QUERY_KEYS = Object.freeze({
    reservations: Object.freeze([
        'view',
        'reservationStatus',
        'reservationSort',
        'reservationStore',
        'reservationSearch',
        'reservationPage',
    ]),
    ads: Object.freeze([
        'advertisementSearch',
        'advertisementStore',
        'advertisementPage',
    ]),
    analytics: Object.freeze([
        'statisticsStore',
        'statisticsRange',
    ]),
    'qr-checkin': Object.freeze([]),
    'chat-intro': Object.freeze(['chatIntroStore']),
    waiting: Object.freeze(['waitingStore', 'waitingSearch', 'waitingStatus', 'view']),
    news: Object.freeze(['newsStore', 'newsState', 'newsPage']),
});

const ALL_SCOPED_KEYS = Object.freeze([...new Set(Object.values(BUSINESS_TAB_QUERY_KEYS).flat())]);

/** 활성 탭에 속하지 않는 사업자 패널 전용 URL 상태만 제거한다. */
export const businessTabSearch = (search, tab, remembered) => {
    const params = new URLSearchParams(search);
    const normalized = resolveBusinessTab(tab);
    const requestedReturn = params.get('qrReturn') || params.get('tab');
    const previous = resolveBusinessTab(requestedReturn);
    const returnTab = previous === 'qr-checkin' ? 'reservations' : previous;
    const owner = normalized === 'qr-checkin' ? returnTab : normalized;
    const activeKeys = new Set(BUSINESS_TAB_QUERY_KEYS[owner]);
    const current = resolveBusinessTab(params.get('tab'));
    const currentOwner = current === 'qr-checkin' ? returnTab : current;
    const changed = params.has('tab') && currentOwner !== owner;
    ALL_SCOPED_KEYS.forEach((key) => {
        if (changed || !activeKeys.has(key)) params.delete(key);
    });
    if (changed && remembered != null) {
        const saved = new URLSearchParams(remembered);
        activeKeys.forEach(key => { if (saved.has(key)) params.set(key, saved.get(key)); });
    }
    params.set('tab', normalized);
    if (normalized === 'qr-checkin') params.set('qrReturn', returnTab);
    else params.delete('qrReturn');
    return normalizeQuerySelections(params, activeKeys).toString();
};

export default businessTabSearch;
