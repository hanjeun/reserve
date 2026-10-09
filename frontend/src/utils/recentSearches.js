export const RECENT_SEARCH_STORAGE_KEY = 'reserve:recent-searches';
export const RECENT_SEARCH_LIMIT = 10;
export const RECENT_SEARCH_MAX_LENGTH = 100;
const SCHEMA_VERSION = 1;
const MAX_STORED_LENGTH = 12_000;
let memoryRecord = null;
let useMemory = false;

export const recentSearchOwner = user => {
    if (!user) return 'guest';
    // 이메일·이름을 저장 키에 남기지 않는다. 식별자가 없으면 기록을 저장하지 않는다.
    return user.id == null ? null : `member:${String(user.id)}`;
};

const validTerm = value => {
    if (typeof value !== 'string') return null;
    const term = value.trim();
    if (!term || term.length > RECENT_SEARCH_MAX_LENGTH) return null;
    for (const character of term) {
        const code = character.charCodeAt(0);
        if (code < 32 || code === 127) return null;
    }
    return term;
};

const boundedTerms = values => {
    if (!Array.isArray(values)) return [];
    const terms = [];
    for (const value of values) {
        const term = validTerm(value);
        if (term && !terms.includes(term)) terms.push(term);
        if (terms.length === RECENT_SEARCH_LIMIT) break;
    }
    return terms;
};

const writeRecord = record => {
    memoryRecord = record;
    try {
        if (record) window.localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(record));
        else window.localStorage.removeItem(RECENT_SEARCH_STORAGE_KEY);
        useMemory = false;
    } catch {
        // 저장소를 사용할 수 없어도 검색·삭제 동작과 현재 탭의 목록은 유지한다.
        useMemory = true;
    }
};

const readRecord = () => {
    if (useMemory) return memoryRecord;
    let raw;
    try {
        raw = window.localStorage.getItem(RECENT_SEARCH_STORAGE_KEY);
    } catch {
        useMemory = true;
        return memoryRecord;
    }
    if (!raw) {
        memoryRecord = null;
        return null;
    }
    try {
        if (raw.length > MAX_STORED_LENGTH) throw new Error('Oversized recent search record');
        const record = JSON.parse(raw);
        if (record?.version !== SCHEMA_VERSION || typeof record.owner !== 'string' || !Array.isArray(record.terms)) {
            throw new Error('Invalid recent search record');
        }
        memoryRecord = { version: SCHEMA_VERSION, owner: record.owner, terms: boundedTerms(record.terms) };
        return memoryRecord;
    } catch {
        writeRecord(null);
        return null;
    }
};

export const readRecentSearches = owner => {
    const record = readRecord();
    return owner && record?.owner === owner ? record.terms : [];
};

export const addRecentSearch = (owner, value) => {
    const previous = readRecentSearches(owner);
    const term = validTerm(value);
    if (!owner || !term) return previous;
    const terms = [term, ...previous.filter(item => item !== term)].slice(0, RECENT_SEARCH_LIMIT);
    writeRecord({ version: SCHEMA_VERSION, owner, terms });
    return terms;
};

export const removeRecentSearch = (owner, value) => {
    const terms = readRecentSearches(owner).filter(term => term !== value);
    if (owner) writeRecord(terms.length ? { version: SCHEMA_VERSION, owner, terms } : null);
    return terms;
};

export const clearRecentSearches = () => {
    writeRecord(null);
    return [];
};

// 앱에서 한 번 설치한다. 검색 화면을 열지 않은 상태의 로그아웃도 기록을 폐기한다.
// 세션 번호 변경은 같은 계정의 재로그인도 포함하며 프로필 표시 갱신은 포함하지 않는다.
export const installRecentSearchPrivacyBoundary = authStore => {
    const record = readRecord();
    if (record && record.owner !== recentSearchOwner(authStore.getState().user)) clearRecentSearches();
    return authStore.subscribe((next, previous) => {
        if (next.sessionRevision !== previous.sessionRevision
            || recentSearchOwner(next.user) !== recentSearchOwner(previous.user)) {
            clearRecentSearches();
        }
    });
};
