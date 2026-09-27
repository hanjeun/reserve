const TAB_QUERY_KEYS = Object.freeze({
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
});

const ALL_SCOPED_KEYS = Object.freeze([...new Set(Object.values(TAB_QUERY_KEYS).flat())]);

/** 활성 탭에 속하지 않는 사업자 패널 전용 URL 상태만 제거한다. */
export const businessTabSearch = (search, tab) => {
    const params = new URLSearchParams(search);
    const activeKeys = new Set(TAB_QUERY_KEYS[tab] || []);
    ALL_SCOPED_KEYS.forEach((key) => {
        if (!activeKeys.has(key)) params.delete(key);
    });
    params.set('tab', TAB_QUERY_KEYS[tab] ? tab : 'reservations');
    return params.toString();
};

export default businessTabSearch;
