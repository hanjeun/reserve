const KEY = 'reserve:payment-return';
const MAX_AGE = 30 * 60 * 1000;
const MAX_ENTRIES = 5;
let entries = [];

function returnPath(location) {
    if (/^\/store\/[1-9][0-9]*$/.test(location?.pathname)) return location.pathname;
    if (location?.pathname !== '/my-reservations') return null;
    const params = new URLSearchParams(location.search);
    const saved = new URLSearchParams();
    for (const key of ['status', 'sort', 'page', 'view']) {
        const value = params.get(key);
        if (value && /^[A-Za-z0-9_-]{1,32}$/.test(value)) saved.set(key, value);
    }
    return '/my-reservations' + (saved.size ? '?' + saved : '');
}

function read() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
        if (Array.isArray(saved)) entries = saved;
    } catch { /* 저장소를 사용할 수 없으면 현재 탭의 이동 정보만 사용해요. */ }
    const now = Date.now();
    entries = entries.filter(entry => entry && Number.isFinite(entry.at)
        && entry.at <= now && now - entry.at < MAX_AGE).slice(-MAX_ENTRIES);
    return entries;
}

function save() {
    try {
        if (entries.length) sessionStorage.setItem(KEY, JSON.stringify(entries));
        else sessionStorage.removeItem(KEY);
    } catch { /* 이동 정보의 저장 실패가 결제 상태를 바꾸지 않아요. */ }
}

// 복귀 위치만 보관해요. 결제 성공·실패와 주문 소유권은 서버에서 확인해요.
export function rememberPaymentReturn(merchantUid, memberId, location) {
    const path = returnPath(location);
    if (!path || !Number.isSafeInteger(memberId) || memberId <= 0
        || typeof merchantUid !== 'string' || !merchantUid || merchantUid.length > 255) return;
    entries = read().filter(entry => entry.merchantUid !== merchantUid);
    entries.push({ merchantUid, memberId, path, at: Date.now() });
    entries = entries.slice(-MAX_ENTRIES);
    save();
}

export function consumePaymentReturn(merchantUid, memberId, storeId) {
    const entry = read().find(item => item.merchantUid === merchantUid && item.memberId === memberId);
    entries = entries.filter(item => item.merchantUid !== merchantUid);
    save();
    if (typeof entry?.path !== 'string') return '/my-reservations';
    const [pathname, search = ''] = entry.path.split('?');
    const path = returnPath({ pathname, search });
    return path && (pathname === '/my-reservations' || pathname === '/store/' + storeId) ? path : '/my-reservations';
}

export function clearPaymentReturns() {
    entries = [];
    save();
}
