import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) {
            await route.continue();
            return;
        }
        if (path === '/api/member/me' || path === '/api/auth/refresh') {
            await route.fulfill({ status: 401, json: { success: false, message: '세션이 없습니다.' } });
            return;
        }
        await route.fulfill({ json: { success: true, data: { content: [], page: { totalElements: 0, totalPages: 0 } } } });
    });
});

test('search entry and cancel move content, not the search header, without a sideways page slide', async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.getByRole('link', { name: '가게·지역·서비스 검색' }).click();
    await expect(page).toHaveURL(/\/search$/);
    const content = page.locator('.reserve-search-content');
    const header = page.locator('.reserve-search-header');
    await expect(content).toHaveCSS('animation-name', isMobile ? 'reserve-search-content-enter-mobile' : 'reserve-search-content-enter');
    await expect(content).toHaveCSS('animation-duration', '0.22s');
    await expect(header).toHaveCSS('animation-name', 'none');
    await expect(header).toHaveCSS('transform', 'none');
    // 취소는 검색창이 내려가는 애니메이션만 재생하고, 원래 화면은 옆으로 밀리지 않는다(2026-09-23).
    await page.getByRole('button', { name: '취소' }).click();
    await expect(content).toHaveCSS('animation-name', isMobile ? 'reserve-search-content-leave-mobile' : 'reserve-search-content-leave');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.ant-layout-content')).not.toHaveClass(/reserve-route-entry--/);
});

test('submitting a search shows results without a page slide', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.getByRole('link', { name: '가게·지역·서비스 검색' }).click();
    await expect(page).toHaveURL(/\/search$/);
    const field = page.locator('.reserve-search-field input');
    await field.fill('카페');
    await field.press('Enter');
    await expect(page).toHaveURL(/\/stores\?keyword=/);
    await expect(page.locator('.ant-layout-content')).not.toHaveClass(/reserve-route-entry--/);
});

test('reduced-motion search navigation is immediate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('link', { name: '가게·지역·서비스 검색' }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.locator('.reserve-search-content')).toHaveCSS('animation-name', 'none');
    await page.getByRole('button', { name: '취소' }).click();
    await expect(page).toHaveURL(/\/$/);
});
