import { expect, test } from '@playwright/test';

const user = { id: 41, name: '테스트 고객', email: 'input@example.test', role: 'USER', provider: 'LOCAL', termsAgreed: true };
const pageOf = { content: [], page: { number: 0, totalElements: 0, totalPages: 0 } };

test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        const data = path === '/api/member/me' ? user
            : /\/unread$/.test(path) ? 0
                : path === '/api/business/my/status' ? { status: 'NONE' }
                    : path === '/api/notices/highlights' ? [] : pageOf;
        return route.fulfill({ json: { success: true, data } });
    });
});

test('choice-only chat and profile settings retain focus without editable keyboard inputs', async ({ page }, testInfo) => {
    await page.goto('/messages');
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const color = page.getByRole('combobox', { name: '내 말풍선 색' });
    await expect(color).toHaveAttribute('readonly', '');
    await expect(color).toHaveAttribute('inputmode', 'none');
    await color.click();
    await expect(color).toHaveAttribute('aria-expanded', 'true');
    await page.getByText('틸', { exact: true }).click();
    await expect(color).toHaveAttribute('aria-expanded', 'false');
    await expect(color).toBeFocused();
    await color.press('ArrowDown');
    await color.press('ArrowDown');
    await color.press('Enter');
    await expect(page.locator('.reserve-chat-preferences .ant-select-content-value')).toHaveText('로즈');
    await expect(color).toBeFocused();
    await expect(page.locator('.reserve-chat-preferences')).toContainText('앱의 포인트 색은 바뀌지 않습니다');
    await color.click();
    await expect(color).toHaveAttribute('aria-expanded', 'true');
    await page.screenshot({ path: testInfo.outputPath('chat-choice-only.png') });
    await color.press('Escape');
    await page.goto('/my-page');
    await expect(page.getByText('내 정보 수정', { exact: true })).toBeVisible();
    await expect(page.locator('.reserve-chat-preferences')).toHaveCount(0);
    const selects = page.locator('.reserve-form-select input[role="combobox"]');
    await expect(selects).toHaveCount(2);
    for (const input of await selects.all()) {
        await expect(input).toHaveAttribute('readonly', '');
        await expect(input).toHaveAttribute('inputmode', 'none');
    }
});

for (const destination of ['search', 'my-page']) {
    test(`a delayed ${destination} chunk uses its own static skeleton before the page commits`, async ({ page, isMobile }, testInfo) => {
        let requested = false;
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const module = destination === 'search' ? 'Search/index.jsx' : 'member/MyPage.jsx';
        await page.route(`**/src/pages/${module}*`, async route => {
            requested = true;
            await gate;
            await route.continue();
        });
        await page.goto('/');
        await expect(page.locator('.reserve-discovery-home')).toBeVisible();
        try {
            // dispatch navigates through the rendered UI, without waiting for the deliberately blocked import.
            if (destination === 'search') {
                await page.getByRole('link', { name: '가게·지역·서비스 검색' }).evaluate(link => link.click());
            } else {
                await page.getByRole('button', { name: '내 계정 메뉴 열기' }).click();
                await page.getByRole('menuitem', { name: /테스트 고객님/ }).evaluate(item => item.click());
            }
            await expect.poll(() => requested).toBe(true);
            const skeleton = page.locator(`.reserve-route-skeleton--${destination}`);
            await expect(skeleton).toBeVisible();
            await expect(skeleton).toHaveCSS('animation-name', 'none');
            await expect(skeleton).toHaveCSS('padding-left', '0px');
            await expect(skeleton.locator('input,button,a')).toHaveCount(0);
            await expect(page.locator('.reserve-discovery-home')).toBeHidden();
            if (destination === 'search') {
                await expect(skeleton.locator('.reserve-route-search-domain')).toHaveCount(6);
                await expect(skeleton.locator('.reserve-search-header')).toBeVisible();
            } else {
                await expect(skeleton.locator('.reserve-my-page-skeleton-card')).toHaveCount(5);
                await expect(skeleton.locator('.reserve-my-page-skeleton-grid')).toHaveCSS('flex-direction', isMobile ? 'column' : 'row');
            }
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
            expect(overflow).toBe(false);
            await page.screenshot({ path: testInfo.outputPath(`${destination}-skeleton.png`) });
        } finally {
            release();
        }
        await expect(page.locator('.reserve-route-skeleton')).toHaveCount(0);
        if (destination === 'search') {
            const field = page.getByRole('searchbox', { name: '가게 이름, 지역 또는 서비스 검색' });
            await expect(field).toBeFocused();
            await expect(field).not.toHaveAttribute('readonly', '');
            await field.fill('카페');
            await expect(field).toHaveValue('카페');
        } else {
            await expect(page.getByText('내 정보 수정', { exact: true })).toBeVisible();
        }
    });
}

test('search authentication bootstrap avoids a second blank header above the search skeleton', async ({ page }) => {
    let requested = false;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/member/me', async route => {
        requested = true;
        await gate;
        await route.fulfill({ json: { success: true, data: user } });
    });
    try {
        await page.goto('/search', { waitUntil: 'domcontentloaded' });
        await expect.poll(() => requested).toBe(true);
        await expect(page.locator('.reserve-boot-shell .reserve-search-header')).toBeVisible();
        await expect(page.locator('.reserve-boot-shell-header')).toHaveCount(0);
        await expect(page.locator('.reserve-boot-shell input')).toHaveCount(0);
    } finally {
        release();
    }
    await expect(page.getByRole('searchbox')).toBeFocused();
});
