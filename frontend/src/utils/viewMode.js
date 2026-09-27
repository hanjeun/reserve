export const VIEW_MODES = new Set(['cards', 'list']);
export const viewStorageKey = pathname => `reserve:view-mode:${pathname}`;

/** 청크 로딩과 실제 목록이 동일한 URL/탭 저장값 우선순위를 사용한다. */
export function resolveViewMode(pathname, searchParams, defaultView) {
    const raw = searchParams.get('view');
    if (VIEW_MODES.has(raw)) return raw;
    if (raw !== null) return defaultView;
    try {
        const stored = sessionStorage.getItem(viewStorageKey(pathname));
        if (VIEW_MODES.has(stored)) return stored;
    } catch { /* 저장소가 없으면 경로의 기본 보기로 표시한다. */ }
    return defaultView;
}
