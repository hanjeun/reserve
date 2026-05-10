/**
 * Admin 탭 공통 상수
 */

export const ENTITY_LABELS = {
    MAIL:        { label: '수신 메일',  color: 'blue'    },
    SENT_MAIL:   { label: '발송 메일',  color: 'cyan'    },
    MEMBER:      { label: '회원',       color: 'purple'  },
    STORE:       { label: '가게',       color: 'green'   },
    RESERVATION: { label: '예약',       color: 'orange'  },
    REVIEW:      { label: '리뷰',       color: 'volcano' },
};

export const ENTITY_TYPE_OPTIONS = [
    { value: '',            label: '전체' },
    { value: 'MAIL',        label: '수신 메일' },
    { value: 'SENT_MAIL',   label: '발송 메일' },
    { value: 'MEMBER',      label: '회원' },
    { value: 'STORE',       label: '가게' },
    { value: 'RESERVATION', label: '예약' },
    { value: 'REVIEW',      label: '리뷰' },
];
