import { resolveAdminTab } from '../../constants/workspaces';
import { normalizeQuerySelections } from '../../utils/querySelection';
import { reportTabSearch } from '../../components/admin/managementReviewQuery';

export const ADMIN_TAB_QUERY_KEYS = {
    pending: ['page'], all: ['page'], mailbox: ['mailFolder', 'page'],
    reports: ['queueType', 'queuePage', 'queueStatus', 'chatReportStatus', 'chatReportPage', 'reportMode', 'reportStatus',
        'reportPage', 'commentReportStatus', 'commentReportPage', 'reportAuditAction', 'reportAuditPage'],
    'benefit-applications': ['benefitState', 'benefitPage', 'view'],
    'audit-logs': ['type', 'page'], trash: ['type', 'page'], members: ['page'],
    'stores-admin': ['search', 'page'], reservations: ['view', 'status', 'sort', 'store', 'page'],
    news: ['newsStore', 'newsState', 'newsPage', 'view'],
    ads: ['search', 'page'], dashboard: [], 'chat-intro': [], payments: [],
};
const allKeys = new Set(Object.values(ADMIN_TAB_QUERY_KEYS).flat());

export function adminTabSearch(search, requested, remembered) {
    const tab = resolveAdminTab(requested);
    const params = new URLSearchParams(search);
    const originalTab = params.get('tab');
    const owned = new Set(ADMIN_TAB_QUERY_KEYS[tab]);
    const changed = resolveAdminTab(params.get('tab')) !== tab;
    // search/page를 공유하는 탭 사이에도 이전 화면의 검색·페이지를 옮기지 않는다.
    allKeys.forEach(key => { if (changed || !owned.has(key)) params.delete(key); });
    if (changed && remembered != null) {
        const saved = new URLSearchParams(remembered);
        owned.forEach(key => { if (saved.has(key)) params.set(key, saved.get(key)); });
    }
    params.set('tab', tab);
    if (!changed && originalTab === 'feed-reports') params.set('queueType', 'FEED');
    if (!changed && originalTab === 'chat') params.set('queueType', 'CHAT');
    if (!changed && originalTab === 'reports' && !params.has('queueType')
        && (params.has('chatReportStatus') || params.has('chatReportPage'))) params.set('queueType', 'CHAT');
    normalizeQuerySelections(params, owned);
    return tab === 'reports' && params.get('queueType') === 'FEED'
        ? reportTabSearch(params, params.get('reportMode')) : params.toString();
}
