import { expect, test } from '@playwright/test';

const admin = {
    id: 1,
    name: '검증 관리자',
    email: 'admin@example.test',
    role: 'ADMIN',
    termsAgreed: true,
};

const pageOf = (content, totalElements) => ({
    content,
    page: { number: 0, size: 20, totalElements, totalPages: totalElements ? 1 : 0 },
});

const ok = (route, data) => route.fulfill({ json: { success: true, data } });

async function mockAdminApi(page) {
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) return route.continue();

        let data = pageOf([], 0);
        if (url.pathname === '/api/member/me' || url.pathname === '/api/auth/refresh') data = admin;
        if (url.pathname === '/api/admin/chat/reports') data = pageOf([{
            id: 1, storeName: '테스트 가게', reporterRole: 'MEMBER', reason: 'OTHER',
            messageId: null, details: '확인용 신고', status: 'OPEN', createdAt: '2026-09-22T10:00:00',
        }], 25);
        if (url.pathname === '/api/admin/trash') data = pageOf([{
            id: 2, entityType: 'RESERVATION', entityId: 7, snapshot: '{}', actorEmail: 'admin@example.test',
            createdAt: '2026-09-22T10:00:00', expiresAt: '2026-10-22T10:00:00',
        }], 9);
        if (url.pathname === '/api/admin/audit-logs') data = pageOf([{
            id: 3, action: 'SOFT_DELETE', entityType: 'RESERVATION', entityId: 7,
            snapshot: '{}', actorEmail: 'admin@example.test', createdAt: '2026-09-22T10:00:00',
        }], 25);
        if (url.pathname === '/api/admin/mail/sent') data = pageOf([{
            id: 4, toEmail: 'member@example.test', subject: '테스트 메일', bodyPreview: '본문 미리보기',
            body: '본문', sentAt: '2026-09-22T10:00:00',
        }], 1);
        if (url.pathname.endsWith('/waiting-count') || url.pathname.endsWith('/unread')) data = 0;

        return ok(route, data);
    });
}

test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });
    await mockAdminApi(page);
});

test('admin filtered counts stay attached and remain visible on mobile', async ({ page }) => {
    const tabs = [
        { key: 'reports', count: '25건' },
        { key: 'trash', count: '9건' },
        { key: 'audit-logs', count: '25건' },
    ];

    for (const tab of tabs) {
        await page.goto(`/admin?tab=${tab.key}`);
        const toolbar = page.locator('.reserve-filter-toolbar-primary');
        const filter = toolbar.locator('.reserve-filter-menu--plain').first();
        const filterSurface = filter.locator('.reserve-filter-menu-surface');
        const count = toolbar.getByText(tab.count, { exact: true });

        await expect(toolbar).toBeVisible();
        await expect(filter).toBeVisible();
        await expect(filterSurface).toBeVisible();
        await expect(count).toBeVisible();

        const [filterSurfaceBox, countBox, toolbarBox] = await Promise.all([
            filterSurface.boundingBox(), count.boundingBox(), toolbar.boundingBox(),
        ]);
        expect(filterSurfaceBox).not.toBeNull();
        expect(countBox).not.toBeNull();
        expect(toolbarBox).not.toBeNull();
        const visualGap = countBox.x - (filterSurfaceBox.x + filterSurfaceBox.width);
        expect(visualGap).toBeGreaterThanOrEqual(12);
        expect(visualGap).toBeLessThanOrEqual(24);
        expect(toolbarBox.width).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
    }
});

test('mailbox keeps the trash action in the selected message detail', async ({ page }) => {
    await page.goto('/admin?tab=mailbox');

    await expect(page.getByText('member@example.test')).toBeVisible();
    await expect(page.locator('.reserve-maillist-trash')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /메일을 휴지통으로/ })).toHaveCount(0);

    await page.getByRole('button', { name: /member@example\.test/ }).click();
    await expect(page.getByRole('button', { name: /휴지통$/ })).toBeVisible();
});
