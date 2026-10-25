const counts = { submitted: 0, correction: 0, choice: 0, selected: 0, publicRequest: 0, personalRequest: 0, publicCacheHit: 0 };

// 탭의 집계값만 보관하며 검색어·ID·본문·영구 저장소·외부 전송은 사용하지 않는다.
export function recordSearchMetric(key) {
    if (Object.hasOwn(counts, key)) counts[key] = Math.min(Number.MAX_SAFE_INTEGER, counts[key] + 1);
}
export const searchDiagnostics = () => Object.freeze({ ...counts });
