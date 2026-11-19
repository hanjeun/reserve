export const REPORT_TYPE_LABELS = Object.freeze({ REVIEW: '리뷰', RESERVATION: '예약', CHAT: '채팅', FEED: '피드·소식', FEED_COMMENT: '피드 댓글' });
export const REPORT_STATUS_LABELS = Object.freeze({ OPEN: '접수', REVIEWING: '검토 중', APPEALED: '이의 접수', RESOLVED: '처리 완료', DISMISSED: '기각', REJECTED: '기각' });
export const REPORT_REASON_LABELS = Object.freeze({
    ABUSE: '욕설·협박', RATING_MANIPULATION: '별점 조작 의심', RIGHTS: '명예훼손·사생활 침해', SPAM: '스팸', OTHER: '기타',
    NO_SHOW: '노쇼 판정 이의', CANCELLATION: '예약 취소 이견', REFUND: '환불 이견', BOOKING_ABUSE: '예약 악용',
});
export const REPORT_REASONS = Object.freeze({
    REVIEW: ['ABUSE', 'RATING_MANIPULATION', 'RIGHTS', 'SPAM', 'OTHER'],
    RESERVATION: ['NO_SHOW', 'CANCELLATION', 'REFUND', 'BOOKING_ABUSE', 'OTHER'],
});
export const CHAT_REPORT_REASON_LABELS = Object.freeze({ SPAM: '스팸·도배', HARASSMENT: '욕설·괴롭힘', INAPPROPRIATE: '부적절한 내용',
    FRAUD: '사기·결제 유도', OTHER: '기타' });
export const REPORT_DECISION_LABELS = Object.freeze({ DISMISS: '기각', RESOLVE: '처리 완료', HIDE_REVIEW: '리뷰 숨기기', RESTORE_REVIEW: '리뷰 복구' });
export const reportStateLabel = value => REPORT_STATUS_LABELS[value] ?? value;
