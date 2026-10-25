/*
 * 탭 안에서 마지막 광고 클릭을 보관해 같은 가게·귀속 기간의 새 예약에 연결한다. 새로고침은 보존하고 탭 종료 때는 폐기한다.
 */

const KEY = 'reserve:adClickAttribution';
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24시간

/** 배너 클릭 시점에 호출 — 어떤 광고를, 어느 가게에서 클릭했는지 기록 */
export const recordAdClick = (adId, storeId) => {
    if (!adId || !storeId) return;
    try {
        sessionStorage.setItem(KEY, JSON.stringify({ adId, storeId, clickedAt: Date.now() }));
    } catch {
        /* 용량 초과/시크릿 모드 등 — 전환 집계는 있으면 좋은 것이지 필수가 아니므로 무시 */
    }
};

/*
 * 같은 가게·기간 조건을 확인한 뒤 기록을 한 번만 소비한다. 만료·불일치는 null을 반환한다.
 */
export const consumeAdClickAttribution = (storeId, windowMs = DEFAULT_WINDOW_MS) => {
    let raw;
    try {
        raw = sessionStorage.getItem(KEY);
    } catch {
        return null;
    }
    if (!raw) return null;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        parsed = null;
    }

    // 판정 결과와 무관하게 기록을 지워 다음 예약에 재사용되지 않게 한다.
    try { sessionStorage.removeItem(KEY); } catch { /* 무시 */ }

    if (!parsed?.adId || !parsed?.storeId || !parsed?.clickedAt) return null;
    if (String(parsed.storeId) !== String(storeId)) return null;
    if (Date.now() - parsed.clickedAt > windowMs) return null;

    return parsed.adId;
};
