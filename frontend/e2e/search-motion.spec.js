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

test('search entry and cancel pair the header controls and content without a sideways page slide', async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.getByRole('link', { name: '가게·지역·서비스 검색' }).click();
    await expect(page).toHaveURL(/\/search$/);
    const content = page.locator('.reserve-search-content');
    const header = page.locator('.reserve-search-header');
    await expect(content).toHaveCSS('animation-name', isMobile ? 'reserve-search-content-enter-mobile' : 'reserve-search-content-enter');
    await expect(content).toHaveCSS('animation-duration', '0.22s');
    await expect(header).toHaveCSS('animation-name', 'reserve-search-controls-enter');
    await expect(header).toHaveCSS('animation-duration', '0.22s');
    expect(await header.evaluate(element => element.getAnimations()[0].effect.getKeyframes().map(frame => ({
        x: new DOMMatrixReadOnly(frame.transform).m41,
        y: new DOMMatrixReadOnly(frame.transform).m42,
        opacity: Number(frame.opacity),
    })))).toEqual([{ x: 0, y: -6, opacity: 0 }, { x: 0, y: 0, opacity: 1 }]);
    await expect(page.locator('.ant-layout-content')).not.toHaveClass(/reserve-route-entry--/);
    // The existing 220ms search contract pairs the input row with the body and restores without a sideways route entry.
    await page.getByRole('button', { name: '취소' }).evaluate(button => button.click());
    await expect(header).toHaveCSS('animation-name', 'reserve-search-controls-leave');
    await expect(header).toHaveCSS('animation-duration', '0.22s');
    await expect(content).toHaveCSS('animation-name', isMobile ? 'reserve-search-content-leave-mobile' : 'reserve-search-content-leave');
    await expect(page).toHaveURL(url => url.pathname === '/' && url.searchParams.get('region') === '');
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
    await expect(page.locator('.reserve-search-header')).toHaveCSS('animation-name', 'none');
    await page.getByRole('button', { name: '취소' }).click();
    await expect(page).toHaveURL(url => url.pathname === '/' && url.searchParams.get('region') === '');
});
