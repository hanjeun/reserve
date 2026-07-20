/**
 * 가게 커버 이미지의 원본 비율(width/height) 전용 캐시
 *
 * ── 왜 별도 캐시가 필요한가 (2026-07 전수조사) ─────────────────────────────────
 * StoreDetail의 스켈레톤은 커버 이미지 자리를 "그 가게의 실제 이미지 비율"로 그려야
 * 이미지가 도착한 순간 레이아웃이 안 튄다. 그 비율을 useStoreImageHint가 TanStack Query의
 * 목록 캐시(storeKeys.list)에서 훔쳐오는데, 목록 캐시가 없으면 힌트가 없어서 1:1 정사각으로
 * 폴백한다 — 이게 "가끔 큰 정사각 스켈레톤이 떴다가 작은 가로 이미지가 나오는" 증상이었다.
 *
 * 목록 캐시가 없는 경우가 생각보다 많다:
 *   - 상세 페이지 URL로 직접 진입 / 상세 페이지에서 새로고침
 *   - 홈(추천 가게)이나 찜 목록에서 클릭해서 들어옴 (이것들은 storeKeys.list 캐시가 아님)
 *   - 목록을 본 지 오래돼서 gcTime(10분)으로 캐시가 수거됨
 *
 * 그런데 이미지 비율은 **몇 바이트짜리 순수 메타데이터**다. 가게 데이터 전체를 캐싱하는 것과
 * 달리 오래 들고 있어도 "낡은 데이터를 보여줄" 위험이 사실상 없다(가게 사진을 바꿔도 다음
 * 목록 조회 때 갱신되고, 최악의 경우 스켈레톤 비율만 잠깐 어긋난다).
 * → 그래서 목록/상세를 볼 때마다 여기에 적어두고, 힌트가 필요하면 여기서 먼저 찾는다.
 *
 * sessionStorage를 쓰는 이유: 새로고침해도 살아남아야 하고(가장 흔한 케이스),
 * 탭을 닫으면 사라져야 오래된 비율이 무한정 남지 않는다.
 */

const KEY = 'reserve:storeImageHints';
const MAX_ENTRIES = 300;

/** 메모리 캐시 — sessionStorage 접근을 매 렌더마다 하지 않도록 */
let memoryCache = null;

const load = () => {
    if (memoryCache) return memoryCache;
    try {
        const raw = sessionStorage.getItem(KEY);
        memoryCache = raw ? JSON.parse(raw) : {};
    } catch {
        memoryCache = {};
    }
    return memoryCache;
};

const persist = () => {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(memoryCache));
    } catch {
        /* 용량 초과/시크릿 모드 등 — 스켈레톤 비율은 있으면 좋은 것이지 필수가 아니므로 무시 */
    }
};

/**
 * 가게 하나에서 "캐러셀 첫 장"의 비율을 뽑는다.
 *
 * StoreDetail의 sliderImages와 동일한 우선순위: detailImageUrls가 하나라도 있으면 캐러셀
 * 첫 장은 항상 그 이미지이고 mainImageUrl은 아예 화면에 안 보인다.
 * 상세 이미지는 있는데 meta가 없는 옛날 데이터는 메인 이미지 비율로 대충 채우면 오히려
 * 틀린 힌트를 주게 되므로 그냥 힌트 없음으로 둔다.
 */
export const extractImageHint = (store) => {
    if (!store) return null;

    if (store.detailImageUrls?.length > 0) {
        const first = store.detailImageMeta?.[0];
        if (first?.width && first?.height) return { width: first.width, height: first.height };
        return null;
    }
    if (store.mainImageWidth && store.mainImageHeight) {
        return { width: store.mainImageWidth, height: store.mainImageHeight };
    }
    return null;
};

/** 가게 목록(또는 가게 하나)을 볼 때마다 비율을 적어둔다 */
export const rememberImageHints = (stores) => {
    const list = Array.isArray(stores) ? stores : [stores];
    const cache = load();
    let changed = false;

    for (const store of list) {
        if (!store?.id) continue;
        const hint = extractImageHint(store);
        if (!hint) continue;

        const id = String(store.id);
        const prev = cache[id];
        if (prev?.width === hint.width && prev?.height === hint.height) continue;
        cache[id] = hint;
        changed = true;
    }

    if (!changed) return;

    // 상한 초과 시 오래된 것부터 버린다 (객체 키 순서 = 삽입 순서)
    const keys = Object.keys(cache);
    if (keys.length > MAX_ENTRIES) {
        for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete cache[k];
    }
    persist();
};

/** 저장해둔 비율을 꺼낸다. 없으면 null */
export const getImageHint = (storeId) => {
    if (!storeId) return null;
    const hint = load()[String(storeId)];
    return hint?.width && hint?.height ? hint : null;
};
