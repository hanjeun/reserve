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
    },
    RESERVATION: {
        LIST:                '/api/reservations',
        MY_RESERVATIONS:     '/api/reservations/my',
        STORE_RESERVATIONS:  '/api/reservations/store',
        CREATE:              '/api/reservations',
        DETAIL:              (id) => `/api/reservations/${id}`,
        CANCEL:              (id) => `/api/reservations/${id}/cancel`,
        REMOVE:              (id) => `/api/reservations/${id}/remove`,
        APPROVE:             (id) => `/api/reservations/${id}/approve`,
        REJECT:              (id) => `/api/reservations/${id}/reject`,
        COMPLETE:            (id) => `/api/reservations/${id}/complete`,
        NO_SHOW:             (id) => `/api/reservations/${id}/no-show`,
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
        ME:            '/api/member/me',
        UPDATE:        '/api/member/update',
        DELETE:        '/api/member/delete',
        PROFILE_IMAGE: '/api/member/profile-image',
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
    MAIL: {
        LIST:         '/api/admin/mail',
        DETAIL:       (id) => `/api/admin/mail/${id}`,
        REPLY:        (id) => `/api/admin/mail/${id}/reply`,
        UNREAD_COUNT: '/api/admin/mail/unread-count',
        COMPOSE:      '/api/admin/mail/compose',
        SENT:         '/api/admin/mail/sent',
        DELETE:       (id) => `/api/admin/mail/${id}`,
        DELETE_SENT:  (id) => `/api/admin/mail/sent/${id}`,
    },
    TRASH: {
        LIST:    '/api/admin/trash',
        RESTORE: (type, id) => `/api/admin/trash/${type}/${id}/restore`,
        DELETE:  (type, id) => `/api/admin/trash/${type}/${id}`,
    },
    AUDIT_LOG: {
        LIST: '/api/admin/audit-logs',
    },
    ADMIN_MANAGE: {
        MEMBERS:              '/api/admin/manage/members',
        MEMBER_DELETE:        (id) => `/api/admin/manage/members/${id}`,
        MEMBER_SUSPEND:       (id) => `/api/admin/manage/members/${id}/suspend`,
        MEMBER_BAN:           (id) => `/api/admin/manage/members/${id}/ban`,
        MEMBER_UNBAN:         (id) => `/api/admin/manage/members/${id}/unban`,
        STORES:               '/api/admin/manage/stores',
        STORE_DELETE:         (id) => `/api/admin/manage/stores/${id}`,
        RESERVATION_DELETE:   (id) => `/api/admin/manage/reservations/${id}`,
    },
};

export const SORT_OPTIONS = [
    { value: 'rating',      label: '별점순' },
    { value: 'reviewCount', label: '리뷰순' },
    { value: 'name',        label: '이름순' },
];
