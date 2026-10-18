import { resolveAdminTab } from '../../constants/workspaces';

const SCOPED_KEYS = {
    pending: ['search', 'page'], all: ['search', 'page'], mailbox: ['search', 'page'],
    reports: ['chatReportStatus', 'chatReportPage'],
    'feed-reports': ['reportMode', 'reportStatus', 'reportPage', 'commentReportStatus', 'commentReportPage', 'reportAuditPage'],
    'benefit-applications': ['benefitState', 'benefitPage'],
    'audit-logs': ['type', 'page'], trash: ['type', 'page'], members: ['search', 'page'],
    'stores-admin': ['search', 'page'], reservations: ['view', 'status', 'sort', 'store', 'search', 'page'],
    ads: ['search', 'page'], dashboard: [], 'chat-intro': [], payments: [],
};
const allKeys = new Set(Object.values(SCOPED_KEYS).flat());

export function adminTabSearch(search, requested) {
    const tab = resolveAdminTab(requested);
    const params = new URLSearchParams(search);
    const owned = new Set(SCOPED_KEYS[tab]);
    const changed = resolveAdminTab(params.get('tab')) !== tab;
    // search/page를 공유하는 탭 사이에도 이전 화면의 검색·페이지를 옮기지 않는다.
    allKeys.forEach(key => { if (changed || !owned.has(key)) params.delete(key); });
    params.set('tab', tab);
    return params.toString();
}
