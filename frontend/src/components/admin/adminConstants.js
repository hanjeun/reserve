/*
 * 회원·가게는 휴지통 대상이 아니므로 감사 로그 유형과 휴지통 유형을 분리한다.
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
