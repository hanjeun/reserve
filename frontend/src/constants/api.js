/**
 * RESERVE - API 엔드포인트 상수
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const API_ENDPOINTS = {
    AUTH: {
        LOGIN:       '/api/auth/login',
        LOGOUT:      '/api/auth/logout',
        SIGNUP:      '/api/auth/signup',
        REFRESH:     '/api/auth/refresh',
        ME:          '/api/member/me',
        AGREE_TERMS: '/api/auth/agree-terms',
    },
    EMAIL: {
        SEND_CODE:   '/api/email/send-code',
        VERIFY_CODE: '/api/email/verify-code',
    },
    STORE: {
        LIST:            '/api/stores',
        DETAIL:          (id) => `/api/stores/${id}`,
        MY_STORES:       '/api/stores/my',
        CREATE:          '/api/stores',
        UPDATE:          (id) => `/api/stores/${id}`,
        DELETE:          (id) => `/api/stores/${id}`,
        AUTO_APPROVAL:   (id) => `/api/stores/${id}/auto-approval`,
        STATISTICS:      (id) => `/api/stores/${id}/statistics`,
    },
    RESERVATION: {
        LIST:                '/api/reservations',
        MY_RESERVATIONS:     '/api/reservations/my',
        MY_COMPLETED_FOR_STORE: (storeId) => `/api/reservations/my/store/${storeId}/completed`,
        STORE_RESERVATIONS:  '/api/reservations/store',
        STORE_RESERVATION_SUMMARY: '/api/reservations/store/status-summary',
        CREATE:              '/api/reservations',
        DETAIL:              (id) => `/api/reservations/${id}`,
        UPDATE:              (id) => `/api/reservations/${id}`,
        CANCEL:              (id) => `/api/reservations/${id}/cancel`,
        // 사업자가 확정된 예약을 취소 — CANCEL과 다른 경로다. 그쪽은 예약자 본인만 통과한다(가게는 403).
        STORE_CANCEL:        (id) => `/api/reservations/${id}/store-cancel`,
        REMOVE:              (id) => `/api/reservations/${id}/remove`,
        APPROVE:             (id) => `/api/reservations/${id}/approve`,
        REJECT:              (id) => `/api/reservations/${id}/reject`,
        COMPLETE:            (id) => `/api/reservations/${id}/complete`,
        // 오조작 정정용 Undo — 서버가 10분 이내만 허용한다
        UNDO_APPROVE:        (id) => `/api/reservations/${id}/undo-approve`,
        UNDO_COMPLETE:       (id) => `/api/reservations/${id}/undo-complete`,
        NO_SHOW:             (id) => `/api/reservations/${id}/no-show`,
        AVAILABILITY:        '/api/reservations/availability',
        // 달력용 월 단위 조회 — 날짜마다 상태와 그 사유(휴무/기간밖/마감…)를 함께 준다.
        CALENDAR:            '/api/reservations/calendar',
        QR_TOKEN:            (id) => `/api/reservations/${id}/qr-token`,
        QR_CHECKIN:          '/api/reservations/qr-checkin',
    },
    ADVERTISEMENT: {
        CREATE:          '/api/advertisements',
        PREPARE_PAYMENT: (id) => `/api/advertisements/${id}/prepare-payment`,
        VERIFY_PAYMENT: '/api/advertisements/verify-payment',
        ACTIVE:         '/api/advertisements/active',
        MY_ADS:         '/api/advertisements/my',
        ADMIN_ALL:      '/api/advertisements/admin/all',
        ADMIN_SUSPEND:  (id) => `/api/advertisements/admin/${id}/suspend`,
        CANCEL:         (id) => `/api/advertisements/${id}`,
        // 종료상태 광고 목록에서 숨기기(소프트삭제) — 2026-07 추가
        REMOVE:         (id) => `/api/advertisements/${id}/remove`,
        UPDATE:         (id) => `/api/advertisements/${id}`,
        // 광고 성과 지표(2026-07 추가)
        IMPRESSION:     (id) => `/api/advertisements/${id}/impression`,
        CLICK:          (id) => `/api/advertisements/${id}/click`,
        CONVERSION:     (id) => `/api/advertisements/${id}/conversion`,
    },
    REVIEW: {
        CREATE:          '/api/reviews',
        BY_STORE:        (storeId) => `/api/reviews/store/${storeId}`,
        BY_RESERVATION:  (reservationId) => `/api/reviews/reservation/${reservationId}`,
        CAN_WRITE:       (reservationId) => `/api/reviews/can-write/${reservationId}`,
        MY_REVIEWS:      '/api/reviews/my',
        DETAIL:          (id) => `/api/reviews/${id}`,
        UPDATE:          (id) => `/api/reviews/${id}`,
        DELETE:          (id) => `/api/reviews/${id}`,
    },
    MEMBER: {
        ME:                '/api/member/me',
        UPDATE:            '/api/member/update',
        PROFILE_IMAGE:     '/api/member/profile-image',
        DELETE:            '/api/member/delete',
        WITHDRAWAL_READINESS: '/api/member/withdrawal-readiness',
        MARKETING_CONSENT: '/api/member/me/marketing-consent',
        LOCATION:          '/api/member/me/location',
    },
    BUSINESS: {
        SUBMIT:         '/api/business-verification/submit',
        MY_STATUS:      '/api/business-verification/my-status',
        UPDATE:         '/api/business-verification/update',
        CANCEL:         '/api/business-verification/cancel',
        RESIGN:         '/api/business-verification/resign',
        ADMIN_PENDING:  '/api/business-verification/admin/pending',
        ADMIN_LIST:     '/api/business-verification/admin/list',
        ADMIN_DETAIL:   (id) => `/api/business-verification/admin/${id}`,
        ADMIN_APPROVE:  (id) => `/api/business-verification/admin/${id}/approve`,
        ADMIN_REJECT:   (id) => `/api/business-verification/admin/${id}/reject`,
        ADMIN_REVOKE:   (memberId) => `/api/business-verification/admin/${memberId}/revoke`,
    },
    PAYMENT: {
        CONFIG:         '/api/payment/config',
        PREPARE:        '/api/payment/prepare',
        VERIFY:         '/api/payment/verify',
        REFUND:         '/api/payment/refund',
        MY_PAYMENTS:    '/api/payment/my-payments',
        REFUND_PREVIEW: (id) => `/api/payment/refund-preview/${id}`,
    },
    PAYMENT_OPERATIONS: {
        STALE_READY:       '/api/admin/payment-operations/stale-ready',
        RECONCILE_READY:   (id) => `/api/admin/payment-operations/stale-ready/${id}/reconcile`,
        ISSUES:            '/api/admin/payment-operations/issues',
        ISSUE_COUNT:       '/api/admin/payment-operations/issues/open-count',
        WEBHOOKS:          '/api/admin/payment-operations/webhooks',
        WEBHOOK_COUNT:     '/api/admin/payment-operations/webhooks/unfinished-count',
        RETRY_WEBHOOK:     (id) => `/api/admin/payment-operations/webhooks/${id}/retry`,
    },
    PASSWORD_RESET: {
        SEND_CODE:   '/api/password-reset/send-code',
        VERIFY_CODE: '/api/password-reset/verify-code',
        RESET:       '/api/password-reset/reset',
    },
    FAVORITE: {
        TOGGLE: (storeId) => `/api/favorites/toggle/${storeId}`,
        STATUS: (storeId) => `/api/favorites/status/${storeId}`,
        MY:     '/api/favorites/my',
    },
    OAUTH: {
        GOOGLE: '/oauth2/authorization/google',
        NAVER:  '/oauth2/authorization/naver',
        KAKAO:  '/oauth2/authorization/kakao',
    },
    // 인앱 채팅 (2026-08-24). 손님은 방 ID 를 고르지 않는다 — 서버가 회원으로부터 찾거나 만든다.
    // 폴링 경로(MY_MESSAGES)만 roomId 를 받는데, 그때도 서버가 소유를 확인한다.
    CHAT: {
        MY:            '/api/chat/my',
        MY_SEND:       '/api/chat/my/messages',
        MY_MESSAGES:   '/api/chat/my/messages',
        MY_UNREAD:     '/api/chat/my/unread',
        ADMIN_ROOMS:   '/api/admin/chat/rooms',
        ADMIN_ROOM:    (id) => `/api/admin/chat/rooms/${id}`,
        ADMIN_POLL:    (id) => `/api/admin/chat/rooms/${id}/messages`,
        ADMIN_REPLY:   (id) => `/api/admin/chat/rooms/${id}/messages`,
        ADMIN_WAITING: '/api/admin/chat/waiting-count',
    },
    MAIL: {
        COMPOSE:      '/api/admin/mail/compose',
        SENT:         '/api/admin/mail/sent',
        // 소프트 삭제(휴지통 이동). 보존 기간이 끝나면 서버 스케줄러가 자동 정리한다.
        TRASH_SENT:   (id) => `/api/admin/mail/sent/${id}`,
    },
    INQUIRY: {
        MY:            '/api/inquiries/my',
        ADMIN_ALL:     '/api/inquiries/admin/all',
        DETAIL:        (id) => `/api/inquiries/${id}`,
        ADMIN_DETAIL:  (id) => `/api/inquiries/admin/${id}`,
        CREATE:        '/api/inquiries',
        DELETE:        (id) => `/api/inquiries/${id}`,
        ADMIN_ANSWER:  (id) => `/api/inquiries/${id}/answer`,
        ADMIN_DELETE:  (id) => `/api/inquiries/admin/${id}`,
        PENDING_COUNT: '/api/inquiries/pending-count',
    },
    TRASH: {
        LIST:    '/api/admin/trash',
        RESTORE: (type, id) => `/api/admin/trash/${type}/${id}/restore`,
    },
    AUDIT_LOG: {
        LIST: '/api/admin/audit-logs',
    },
    ADMIN_MANAGE: {
        MEMBERS:              '/api/admin/manage/members',
        MEMBER_SUSPEND:       (id) => `/api/admin/manage/members/${id}/suspend`,
        MEMBER_BAN:           (id) => `/api/admin/manage/members/${id}/ban`,
        MEMBER_UNBAN:         (id) => `/api/admin/manage/members/${id}/unban`,
        STORES:               '/api/admin/manage/stores',
        STORE_SUSPEND:        (id) => `/api/admin/manage/stores/${id}/suspend`,
        STORE_BAN:            (id) => `/api/admin/manage/stores/${id}/ban`,
        STORE_UNBAN:          (id) => `/api/admin/manage/stores/${id}/unban`,
        RESERVATION_DELETE:   (id) => `/api/admin/manage/reservations/${id}`,
    },
};

export const SORT_OPTIONS = [
    { value: 'rating',      label: '별점순' },
    { value: 'reviewCount', label: '리뷰순' },
    { value: 'name',        label: '이름순' },
    { value: 'distance',    label: '거리순' },
];
