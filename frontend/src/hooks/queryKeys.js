// TanStack Query 키 팩토리 — 계층 구조로 invalidation 범위 제어
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
    qrToken: (id) => ['reservations', 'qrToken', id],
};

export const memberKeys = {
    me: () => ['member', 'me'],
};

// 광고 도메인 — 사업자 본인 광고 목록 / 관리자 전체 광고 목록 / 공개 활성 광고(런딩 위젯, 유형별)
export const adKeys = {
    all:   () => ['ads'],
    my:    () => ['ads', 'my'],
    admin: () => ['ads', 'admin'],
    active: (type) => ['ads', 'active', type],
};

// 리뷰 — 가게별 목록이 핵심(내 리뷰 목록 API는 따로 없음, 가게 상세에서만 조회)
export const reviewKeys = {
    all:      () => ['reviews'],
    byStore:  (storeId) => ['reviews', 'store', storeId],
};

// 즐겨찾기 — 목록 + 개별 가게 찜 여부
export const favoriteKeys = {
    all:    () => ['favorites'],
    my:     () => ['favorites', 'my'],
    status: (storeId) => ['favorites', 'status', storeId],
};

// 관리자 패널 — 회원/가게/전체예약/휴지통/감사로그/메일함/사업자인증/광고(adKeys.admin과 별개로 관리)
export const adminKeys = {
    members:             () => ['admin', 'members'],
    stores:               () => ['admin', 'stores'],
    reservations:         () => ['admin', 'reservations'],
    trash:                () => ['admin', 'trash'],
    auditLogs:            () => ['admin', 'auditLogs'],
    sentMails:            () => ['admin', 'sentMails'],
    businessVerifications: () => ['admin', 'businessVerifications'],
    dashboardStats:       () => ['admin', 'dashboardStats'],
};
