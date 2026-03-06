// React Query 키 팩토리 — 계층 구조로 invalidation 범위 제어
// 예: queryClient.invalidateQueries({ queryKey: reservationKeys.all() })
//     → 'reservations'로 시작하는 모든 쿼리 무효화

export const storeKeys = {
    all:    () => ['stores'],
    list:   (params) => ['stores', 'list', params],
    detail: (id)     => ['stores', 'detail', id],
    my:     ()       => ['stores', 'my'],
};

export const reservationKeys = {
    all:    () => ['reservations'],
    my:     () => ['reservations', 'my'],
    manage: () => ['reservations', 'manage'],
};

export const memberKeys = {
    me: () => ['member', 'me'],
};
