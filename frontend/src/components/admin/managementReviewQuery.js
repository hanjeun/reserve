import { feedPage } from '../../utils/feed';
import { normalizeQuerySelections } from '../../utils/querySelection';

export const FEED_AUDIT_ACTION_LABELS = {
    REPORT_LIST_READ: '신고 목록 열람', REPORT_READ: '신고 상세 열람', EVIDENCE_IMAGE_READ: '신고 사진 열람',
    REPORT_REVIEW: '신고 처리', HOLD_SET: '파기 보류', HOLD_RELEASED: '파기 보류 해제',
    POST_HIDDEN: '게시물 숨김', POST_RESTORED: '게시물 공개 복원',
    BENEFIT_SUBMITTED: '혜택 신청', BENEFIT_APPROVED: '혜택 승인', BENEFIT_REJECTED: '혜택 반려',
    BENEFIT_WITHDRAWN: '혜택 신청 철회', BENEFIT_EDIT_REVIEW: '혜택 수정 재심사',
    BENEFIT_LIST_READ: '혜택 신청 목록 열람', BENEFIT_READ: '혜택 신청 열람', BENEFIT_IMAGE_READ: '혜택 신청 사진 열람',
    NEWS_HIDDEN: '가게 소식 숨김', NEWS_RESTORED: '가게 소식 공개 복원', COMMENT_READ: '댓글 원문 열람',
    COMMENT_REPORT_LIST_READ: '댓글 신고 목록 열람', COMMENT_REPORT_READ: '댓글 신고 열람', COMMENT_REPORT_REVIEW: '댓글 신고 처리',
    COMMENT_HIDDEN: '댓글 숨김', COMMENT_RESTORED: '댓글 공개 복원',
    COMMENT_EVIDENCE_IMAGE_READ: '댓글 신고 사진 열람', COMMENT_IMAGE_READ: '댓글 사진 열람',
};
export const REPORT_AUDIT_ACTION_OPTIONS = [
    { value: 'ALL', label: '전체 처리 종류' },
    ...Object.entries(FEED_AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

export const REPORT_STATUS_OPTIONS = [
    { value: 'ALL', label: '전체 상태' }, { value: 'OPEN', label: '접수' }, { value: 'RESOLVED', label: '처리 완료' },
];
export const BENEFIT_STATE_OPTIONS = [
    { value: 'PENDING', label: '승인 대기' }, { value: 'APPROVED', label: '승인' },
    { value: 'REJECTED', label: '반려' }, { value: 'ALL', label: '전체 신청' },
];
export const REPORT_QUERY_DEFAULTS = {
    reportMode: 'reports', reportStatus: 'ALL', reportPage: '1',
    commentReportStatus: 'ALL', commentReportPage: '1', reportAuditAction: 'ALL', reportAuditPage: '1',
};
export const REPORT_URL_KEYS = {
    reports: ['reportMode', 'reportStatus', 'reportPage'],
    comments: ['reportMode', 'commentReportStatus', 'commentReportPage'],
    audit: ['reportMode', 'reportAuditAction', 'reportAuditPage'],
};
const REPORT_KEYS = new Set(Object.values(REPORT_URL_KEYS).flat());
export const reportTabSearch = (search, requested, remembered) => {
    const mode = reportMode(requested);
    const params = new URLSearchParams(search);
    const changed = reportMode(params.get('reportMode')) !== mode;
    const owned = new Set(REPORT_URL_KEYS[mode]);
    REPORT_KEYS.forEach(key => { if (key !== 'reportMode' && (changed || !owned.has(key))) params.delete(key); });
    if (changed && remembered != null) {
        const saved = new URLSearchParams(remembered);
        owned.forEach(key => { if (saved.has(key)) params.set(key, saved.get(key)); });
    }
    params.set('reportMode', mode);
    return normalizeQuerySelections(params, owned).toString();
};
export const BENEFIT_QUERY_DEFAULTS = { benefitState: 'PENDING', benefitPage: '1' };
export const reviewOption = (options, value, fallback) => options.some(item => item.value === value) ? value : fallback;
export const reviewPage = value => /^\d+$/.test(String(value)) ? feedPage(value) : 1;
export const reportMode = value => ['reports', 'comments', 'audit'].includes(value) ? value : 'reports';
export const reportFormValues = values => ({ status: values?.status, hold: Boolean(values?.hold), note: values?.note || '', visibilityReason: values?.visibilityReason || '' });
