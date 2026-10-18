import { feedPage } from '../../utils/feed';

export const REPORT_STATUS_OPTIONS = [
    { value: 'ALL', label: '전체 상태' }, { value: 'OPEN', label: '접수' }, { value: 'RESOLVED', label: '처리 완료' },
];
export const BENEFIT_STATE_OPTIONS = [
    { value: 'PENDING', label: '승인 대기' }, { value: 'APPROVED', label: '승인' },
    { value: 'REJECTED', label: '반려' }, { value: 'ALL', label: '전체 신청' },
];
export const REPORT_QUERY_DEFAULTS = {
    reportMode: 'reports', reportStatus: 'ALL', reportPage: '1',
    commentReportStatus: 'ALL', commentReportPage: '1', reportAuditPage: '1',
};
export const REPORT_URL_KEYS = {
    reports: ['reportMode', 'reportStatus', 'reportPage'],
    comments: ['reportMode', 'commentReportStatus', 'commentReportPage'],
    audit: ['reportMode', 'reportAuditPage'],
};
export const BENEFIT_QUERY_DEFAULTS = { benefitState: 'PENDING', benefitPage: '1' };
export const reviewOption = (options, value, fallback) => options.some(item => item.value === value) ? value : fallback;
export const reviewPage = value => /^\d+$/.test(String(value)) ? feedPage(value) : 1;
export const reportMode = value => ['reports', 'comments', 'audit'].includes(value) ? value : 'reports';
export const reportFormValues = values => ({ status: values?.status, hold: Boolean(values?.hold), note: values?.note || '', visibilityReason: values?.visibilityReason || '' });
