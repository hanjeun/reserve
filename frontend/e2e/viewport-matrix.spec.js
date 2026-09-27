import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    page.on('pageerror', error => console.error(`[browser error] ${error.message}`));
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });
});

const admin = {
    id: 1,
    name: '테스트 관리자',
    email: 'admin@example.com',
    role: 'ADMIN',
    termsAgreed: true,
};

const emptyPage = {
    content: [],
    page: { size: 10, number: 0, totalElements: 0, totalPages: 0 },
};

const viewports = [
    { width: 320, height: 720 },
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1024 },
];

const ok = (route, data) => route.fulfill({ json: { success: true, data } });

async function mockApi(page) {
    await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) {
            await route.continue();
            return;
        }
        if (url.pathname === '/api/member/me') return ok(route, admin);
        if (url.pathname === '/api/payment/status') {
            return ok(route, {
                type: 'reservation', merchantUid: 'viewport-payment', status: 'PAID', amount: 1000,
            });
        }
        if (url.pathname === '/api/reservations/my') return ok(route, []);
        if (url.pathname.endsWith('/waiting-count')
            || url.pathname === '/api/chat/my/unread'
            || url.pathname === '/api/chat/unread') return ok(route, 0);
        if (/^\/api\/chat\/rooms\/\d+\/(messages|read)$/.test(url.pathname)) return ok(route, []);
        return ok(route, emptyPage);
    });
}

async function expectViewportFit(page) {
    const metrics = await page.evaluate(() => {
        const main = document.querySelector('main');
        const mainBox = main?.getBoundingClientRect();
        return {
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            mainLeft: mainBox?.left ?? 0,
            mainRight: mainBox?.right ?? 0,
        };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.mainLeft).toBeGreaterThanOrEqual(-1);
    expect(metrics.mainRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

test('payment, reservation, and administrator views fit 320, 375, 768, and 1440px', async ({ page }) => {
    // 보호 화면 3개를 4개 폭에서 모두 새로 여는 매트릭스다. dev 서버의 최초 lazy chunk
    // 변환까지 포함하면 기본 30초는 측정 대상과 무관하게 부족하다.
    test.setTimeout(120_000);
    await mockApi(page);

    for (const viewport of viewports) {
        await page.setViewportSize(viewport);

        await page.goto('/payment/result?success=true&merchant_uid=viewport-payment');
        await expect(page.getByText('결제 완료', { exact: true })).toBeVisible();
        await expectViewportFit(page);

        await page.goto('/my-reservations');
        await expect(page.getByRole('heading', { name: '내 예약 확인' })).toBeVisible();
        await expectViewportFit(page);

        await page.goto('/admin');
        await expect(page.getByRole('heading', { name: '관리자 패널' })).toBeVisible();
        await expectViewportFit(page);
    }
});
