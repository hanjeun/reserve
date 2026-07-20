/**
 * 배너 광고 클릭 → 예약 전환 귀속용 sessionStorage 유틸 (2026-07 추가)
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────────────────────
 * "광고 클릭이 실제 예약으로 이어졌는가"를 알려면 클릭 시점과 예약 생성 시점을 연결해야 하는데,
 * 그 사이에 페이지 이동(배너 → 가게 상세 → 예약 폼 제출)이 여러 번 있어서 컴포넌트 state로는
 * 들고 다닐 수 없다. sessionStorage에 "마지막으로 클릭한 배너 광고" 하나만 기록해두고,
 * 예약이 실제로 생성되는 순간 그 가게와 일치하는지 + 귀속 기간(기본 24시간) 안인지 확인한다.
 *
 * imageHintCache.js와 동일한 이유로 sessionStorage 사용: 새로고침해도 살아남아야 하고
 * (배너 클릭 후 상세페이지를 새로고침할 수도 있음), 탭을 닫으면 사라져야 오래된 클릭이
 * 엉뚱한 예약에 붙지 않는다.
 *
 * 한 세션에서 여러 배너를 클릭하면 "가장 최근 클릭" 하나만 남는다(마지막 의도가 우선한다는
 * 단순한 가정 — 완벽한 멀티터치 어트리뷰션 모델은 지금 규모에서 과함).
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

/**
 * 예약이 막 생성된 직후에 호출 — 귀속 조건(같은 가게 + 기간 내)을 만족하면 adId를 반환하고
 * 기록을 지운다(한 번 귀속되면 소모됨 — 같은 클릭이 여러 예약에 중복 귀속되지 않도록).
 * 조건을 만족하지 않으면 null을 반환한다(오래된 기록이면 이 시점에 같이 정리).
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

    // 무엇이 나오든(만료/불일치/파싱 실패) 한 번 소모되면 지운다 — 다음 예약에 잘못 재사용되지 않도록
    try { sessionStorage.removeItem(KEY); } catch { /* 무시 */ }

    if (!parsed?.adId || !parsed?.storeId || !parsed?.clickedAt) return null;
    if (String(parsed.storeId) !== String(storeId)) return null;
    if (Date.now() - parsed.clickedAt > windowMs) return null;

    return parsed.adId;
};
