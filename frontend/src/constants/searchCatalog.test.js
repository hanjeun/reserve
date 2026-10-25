import { CalendarOutlined } from '../components/common/icons';
import { describe, expect, it } from 'vitest';
import { ADMIN_WORKSPACE_GROUPS, BUSINESS_WORKSPACE_GROUPS } from './workspaces';
import { canSearchPersonal, isLocalNavigationSearch, searchCatalog, SEARCH_CATALOG } from './searchCatalog';

const guest = { user: null, isLoggedIn: false, authRestoring: false };
const member = role => ({ ...guest, isLoggedIn: true, user: { id: 7, role, termsAgreed: true } });

describe('unified search catalog', () => {
    it.each(['광고관리', '광고 관리', '홍보', '/business?tab=ads'])('maps %s to the existing business advertisement tab', keyword => {
        expect(searchCatalog(keyword, member('BUSINESS'))).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: '/business?tab=ads' }),
        ]));
        expect(searchCatalog(keyword, guest).some(item => item.path.startsWith('/business') || item.path.startsWith('/admin'))).toBe(false);
        expect(searchCatalog(keyword, member('USER')).some(item => item.path.startsWith('/business') || item.path.startsWith('/admin'))).toBe(false);
    });
    it('uses the actual workspace tab keys and role boundaries', () => {
        for (const [base, groups] of [['business', BUSINESS_WORKSPACE_GROUPS], ['admin', ADMIN_WORKSPACE_GROUPS]]) {
            expect(SEARCH_CATALOG.filter(entry => entry.path.startsWith(`/${base}?tab=`)).map(entry => entry.path)).toEqual(
                groups.flatMap(group => group.items.map(item => `/${base}?tab=${item.key}`)),
            );
        }
        expect(searchCatalog('회원 관리', member('BUSINESS')).some(item => item.path === '/admin?tab=members')).toBe(false);
        expect(searchCatalog('회원 관리', member('ADMIN'))).toEqual(expect.arrayContaining([expect.objectContaining({ path: '/admin?tab=members' })]));
    });
    it.each([{ authRestoring: true }, { isLoggingOut: true }, { user: { id: 7, role: 'USER', termsAgreed: false } }])('hides personal destinations while authorization is unavailable: %j', patch => {
        const auth = { ...member('USER'), ...patch };
        expect(canSearchPersonal(auth)).toBe(false);
        expect(searchCatalog('내 예약', auth)).toEqual([]);
    });
    it('matches existing public help and limits every result group', () => {
        expect(searchCatalog('개인 정보', guest)).toEqual(expect.arrayContaining([expect.objectContaining({ path: '/privacy' })]));
        const results = searchCatalog('관리', member('ADMIN'));
        for (const key of ['menu', 'help']) expect(results.filter(item => item.group === key).length).toBeLessThanOrEqual(5);
        expect(searchCatalog(' ', guest)).toEqual([]);
        expect(searchCatalog('가'.repeat(101), guest)).toEqual([]);
    });
    it.each(['내가 예약한', '예약한 내역', '내 예약 확인'])('maps the curated natural expression %s to the real reservation menu and icon', keyword => {
        expect(searchCatalog(keyword, member('USER'))).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: '/my-reservations', icon: CalendarOutlined }),
        ]));
        expect(isLocalNavigationSearch(keyword, member('USER'))).toBe(true);
        expect(isLocalNavigationSearch(keyword, guest)).toBe(false);
    });
    it('skips remote search only for one exact navigation destination and keeps ambiguous substrings searchable', () => {
        expect(isLocalNavigationSearch('광고 관리', member('BUSINESS'))).toBe(true);
        expect(isLocalNavigationSearch('홍보', member('BUSINESS'))).toBe(true);
        expect(isLocalNavigationSearch('/business?tab=ads', member('BUSINESS'))).toBe(true);
        expect(isLocalNavigationSearch('광고 관리', member('ADMIN'))).toBe(false);
        expect(isLocalNavigationSearch('예약', member('USER'))).toBe(false);
        expect(isLocalNavigationSearch('관리', member('BUSINESS'))).toBe(false);
        expect(searchCatalog('내가 어제 저녁 예약했던 공방', member('USER'))).toEqual([]);
    });

});
