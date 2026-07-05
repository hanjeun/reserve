/**
 * Admin 탭 공통 상수
 *
 * ENTITY_TYPE_OPTIONS 설계 메모:
 * 회원(MEMBER)/가게(STORE)는 휴지통(소프트 삭제) 시스템을 사용하지 않으므로
 * TrashTab의 필터 옵션에서 제외함.
 * 시스템 로그(AuditLogTab)에는 MEMBER/STORE 관련 제재 로그가 기록되지만
 * 이건 휴지통이 아닌 감사 로그이므로 별도 상수(AUDIT_TYPE_OPTIONS)로 관리.
 */

export const ENTITY_LABELS = {
    SENT_MAIL:   { label: '발송 메일',  color: 'cyan'    },
    MEMBER:      { label: '회원',       color: 'purple'  },
    STORE:       { label: '가게',       color: 'green'   },
    RESERVATION: { label: '예약',       color: 'orange'  },
    REVIEW:      { label: '리뷰',       color: 'volcano' },
};

// 휴지통(TrashTab) 필터 전용 — 회원/가게는 휴지통 미사용이므로 제외
export const ENTITY_TYPE_OPTIONS = [
    { value: '',            label: '전체' },
    { value: 'SENT_MAIL',   label: '발송 메일' },
    { value: 'RESERVATION', label: '예약' },
    { value: 'REVIEW',      label: '리뷰' },
];

// 시스템 로그(AuditLogTab) 필터 전용 — 제재 로그(MEMBER/STORE)도 포함
export const AUDIT_TYPE_OPTIONS = [
    { value: '',            label: '전체' },
    { value: 'SENT_MAIL',   label: '발송 메일' },
    { value: 'MEMBER',      label: '회원' },
    { value: 'STORE',       label: '가게' },
    { value: 'RESERVATION', label: '예약' },
    { value: 'REVIEW',      label: '리뷰' },
];
