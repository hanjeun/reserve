import { describe, expect, it } from 'vitest';
import { adminTabSearch } from './adminTabQuery';
import { ADMIN_WORKSPACE_GROUPS, BUSINESS_WORKSPACE_GROUPS, resolveAdminTab, resolveBusinessTab } from '../../constants/workspaces';
import { reportTabSearch, reviewPage } from '../../components/admin/managementReviewQuery';

describe('workspace menu and query contracts', () => {
    it('bounds invalid review pages before they reach Spring integer request parameters', () => {
        for (const value of ['-2', '1.5', 'NaN', '9007199254740991', '10001']) expect(reviewPage(value)).toBe(1);
        expect(reviewPage('3')).toBe(3);
        expect(reviewPage('10000')).toBe(10000);
    });
    it('has unique entries for all fifteen admin and seven business functions', () => {
        const admin = ADMIN_WORKSPACE_GROUPS.flatMap(group => group.items.map(item => item.key));
        const business = BUSINESS_WORKSPACE_GROUPS.flatMap(group => group.items.map(item => item.key));
        expect(new Set(admin).size).toBe(15);
        expect(new Set(business).size).toBe(7);
    });
    it('normalizes legacy and unknown menu addresses instead of opening an empty panel', () => {
        expect(resolveAdminTab('chat')).toBe('reports');
        expect(resolveAdminTab('missing')).toBe('pending');
        expect(resolveBusinessTab('missing')).toBe('reservations');
        const params = new URLSearchParams(adminTabSearch('?tab=chat&chatReportStatus=OPEN', 'chat'));
        expect(params.get('tab')).toBe('reports');
        expect(params.get('chatReportStatus')).toBe('OPEN');
    });
    it('retains only the current report mode filters and page on direct entry', () => {
        const params = new URLSearchParams(adminTabSearch('?tab=feed-reports&reportMode=comments&commentReportStatus=OPEN&commentReportPage=3&reportPage=2&benefitPage=5', 'feed-reports'));
        expect(params.get('reportMode')).toBe('comments');
        expect(params.get('commentReportPage')).toBe('3');
        expect(params.has('reportPage')).toBe(false);
        expect(params.has('benefitPage')).toBe(false);
    });
    it('does not transfer shared search/page values to a different work function', () => {
        const params = new URLSearchParams(adminTabSearch('?tab=members&search=회원&page=3&utm_source=review', 'stores-admin'));
        expect(params.get('tab')).toBe('stores-admin');
        expect(params.has('search')).toBe(false);
        expect(params.has('page')).toBe(false);
        expect(params.get('utm_source')).toBe('review');
    });
    it('restores only the remembered destination filters while keeping unrelated URL context', () => {
        const params = new URLSearchParams(adminTabSearch('?tab=members&search=회원&page=3&utm_source=guide',
            'stores-admin', 'search=가게&page=4&chatReportPage=7&tab=members'));
        expect(Object.fromEntries(params)).toEqual({ tab: 'stores-admin', utm_source: 'guide', search: '가게', page: '4' });
    });
    it('restores a nested report mode page without publishing sibling mode keys', () => {
        const params = new URLSearchParams(reportTabSearch('?tab=feed-reports&reportMode=comments&commentReportStatus=OPEN&commentReportPage=3',
            'audit', 'reportMode=audit&reportAuditAction=REPORT_REVIEW&reportAuditPage=2&reportPage=8'));
        expect(Object.fromEntries(params)).toEqual({ tab: 'feed-reports', reportMode: 'audit', reportAuditAction: 'REPORT_REVIEW', reportAuditPage: '2' });
    });
});
