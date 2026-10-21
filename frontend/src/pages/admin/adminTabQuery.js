import { resolveAdminTab } from '../../constants/workspaces';
import { normalizeQuerySelections } from '../../utils/querySelection';
import { reportTabSearch } from '../../components/admin/managementReviewQuery';

export const ADMIN_TAB_QUERY_KEYS = {
    pending: ['search', 'page'], all: ['search', 'page'], mailbox: ['search', 'page'],
    reports: ['chatReportStatus', 'chatReportPage'],
    'feed-reports': ['reportMode', 'reportStatus', 'reportPage', 'commentReportStatus', 'commentReportPage', 'reportAuditAction', 'reportAuditPage'],
    'benefit-applications': ['benefitState', 'benefitPage'],
    'audit-logs': ['type', 'page'], trash: ['type', 'page'], members: ['search', 'page'],
    'stores-admin': ['search', 'page'], reservations: ['view', 'status', 'sort', 'store', 'search', 'page'],
    ads: ['search', 'page'], dashboard: [], 'chat-intro': [], payments: [],
};
const allKeys = new Set(Object.values(ADMIN_TAB_QUERY_KEYS).flat());

export function adminTabSearch(search, requested, remembered) {
    const tab = resolveAdminTab(requested);
    const params = new URLSearchParams(search);
    const owned = new Set(ADMIN_TAB_QUERY_KEYS[tab]);
    const changed = resolveAdminTab(params.get('tab')) !== tab;
    // search/page를 공유하는 탭 사이에도 이전 화면의 검색·페이지를 옮기지 않는다.
    allKeys.forEach(key => { if (changed || !owned.has(key)) params.delete(key); });
    if (changed && remembered != null) {
        const saved = new URLSearchParams(remembered);
        owned.forEach(key => { if (saved.has(key)) params.set(key, saved.get(key)); });
    }
    params.set('tab', tab);
    normalizeQuerySelections(params, owned);
    return tab === 'feed-reports' ? reportTabSearch(params, params.get('reportMode')) : params.toString();
}
