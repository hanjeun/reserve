import { expect, it } from 'vitest';
import { canManageStoreNews, storeNewsManagementPath } from './storeNews';

it.each(['ADMIN', 'BUSINESS'])('%s에게 본인 가게 소식 작성 도구를 제공해요', role => {
    expect(canManageStoreNews({ role })).toBe(true);
});

it.each([undefined, null, { role: 'USER' }])('운영 권한이 없으면 작성 도구를 제공하지 않아요', user => {
    expect(canManageStoreNews(user)).toBe(false);
});

it('관리자와 사업자는 각 패널의 본인 가게 소식으로 이동해요', () => {
    expect(storeNewsManagementPath({ role: 'ADMIN' })).toBe('/admin?tab=news');
    expect(storeNewsManagementPath({ role: 'BUSINESS' })).toBe('/business?tab=news');
});
