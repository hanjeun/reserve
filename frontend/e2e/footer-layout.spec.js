import { expect, test } from '@playwright/test';

const viewports = [
    { width: 320, height: 720 },
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1024 },
];

async function mockAnonymousApi(page) {
    await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (url.pathname === '/api/member/me' || url.pathname === '/api/auth/refresh') {
            return route.fulfill({ status: 401, json: { success: false, message: '인증이 필요합니다.' } });
        }
        return route.fulfill({ json: { success: true, data: [] } });
    });
}

test('footer keeps its three link groups in one row without horizontal overflow', async ({ page }) => {
    // 4개 폭에서 홈페이지 전체를 다시 열고 푸터까지 스크롤한다. 첫 lazy chunk 변환까지 포함하면
    // 기본 30초는 레이아웃 측정과 무관하게 부족할 수 있다.
    test.setTimeout(120_000);
    await mockAnonymousApi(page);
    for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.goto('/');
        const footer = page.locator('.reserve-app-footer');
        await footer.scrollIntoViewIfNeeded();
        await expect(footer).toBeVisible();

        const layout = await page.evaluate(() => {
            const groups = [...document.querySelectorAll('.reserve-app-footer-section')]
                .map((node) => node.getBoundingClientRect().y);
            const links = document.querySelector('.reserve-app-footer-links');
            return {
                documentWidth: document.documentElement.scrollWidth,
                viewportWidth: window.innerWidth,
                gridTemplateColumns: links ? getComputedStyle(links).gridTemplateColumns : '',
                groupRows: groups,
            };
        });

        expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.gridTemplateColumns.split(' ').filter(Boolean)).toHaveLength(3);
        expect(Math.max(...layout.groupRows) - Math.min(...layout.groupRows)).toBeLessThanOrEqual(1);
    }
});
