import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async route => {
        const { pathname } = new URL(route.request().url());
        // Vite 소스 경로에 포함된 /api/까지 JSON으로 응답하지 않는다.
        if (!pathname.startsWith('/api/')) return route.continue();
        if (pathname === '/api/member/me' || pathname === '/api/auth/refresh') {
            return route.fulfill({ status: 401, json: { success: false, message: '인증이 필요합니다.' } });
        }
        const data = pathname === '/api/stores'
            ? { content: [], page: { totalElements: 0, totalPages: 0, size: 20, number: 0 } }
            : [];
        return route.fulfill({ json: { success: true, data } });
    });
});

test('all four home banners retain readable copy, responsive photos and exact destinations', async ({ page }, testInfo) => {
    await page.goto('/');
    const featured = page.getByRole('region', { name: '서비스 추천' });
    const banners = featured.locator('.reserve-discovery-banner');
    await expect(banners).toHaveCount(4);
    const slides = [
        { path: '/guide/common', asset: 'operation-guide-cover', mobileSuffix: '-v1', title: '예약 전에 확인하면,', description: '예약·웨이팅부터 가게 운영까지 확인하세요' },
        { path: '/stores?domain=FOOD', asset: 'dining-cover', title: '오늘의 한 끼,', description: '마음에 드는 맛집을 찾아보세요' },
        { path: '/stores?domain=PERFORMANCE', asset: 'class-cover', title: '잠깐의 몰입,', description: '나를 위한 시간을 예약해보세요' },
        { path: '/stores?domain=POPUP', asset: 'popup-cover', title: '이번 주의 발견,', description: '새로운 공간을 둘러보세요' },
    ];
    for (const [index, slide] of slides.entries()) {
        const current = banners.nth(index);
        await current.scrollIntoViewIfNeeded();
        await expect(current).toHaveAttribute('href', slide.path);
        await expect(current.locator('.reserve-discovery-banner-copy strong')).toContainText(slide.title);
        await expect(current.locator('.reserve-discovery-banner-description')).toHaveText(slide.description);
        await expect(current.locator('.reserve-discovery-banner-copy')).toBeVisible();
        await expect.poll(() => current.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
        const photo = await current.locator('img').evaluate(img => ({ source: img.currentSrc, desktop: innerWidth >= 900 }));
        const suffix = photo.desktop ? '-desktop-v1' : (slide.mobileSuffix ?? '');
        expect(new URL(photo.source).pathname).toBe(`/images/discovery-v3/${slide.asset}${suffix}.webp`);
        const bounds = await current.boundingBox();
        expect(bounds.width).toBeGreaterThan(100);
        expect(bounds.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
        if (index === 0) {
            const screenshot = testInfo.outputPath('home-banner.png');
            await page.screenshot({ path: screenshot });
            await testInfo.attach('home-banner', { path: screenshot, contentType: 'image/png' });
        }
    }
});

test('six service shortcuts lead to their own domain filters', async ({ page }) => {
    await page.goto('/');
    const domains = [
        ['FOOD', '맛집 · 카페', 'food'],
        ['BEAUTY_CLINIC', '뷰티 · 클리닉', 'beauty'],
        ['SPORTS', '운동 · 웰니스', 'sports'],
        ['PERFORMANCE', '공연 · 클래스', 'performance'],
        ['POPUP', '팝업 · 대관', 'popup'],
        ['OTHER', '기타 예약', 'other'],
    ];
    for (const [value, label, asset] of domains) {
        const shortcut = page.getByRole('link', { name: `${label} 가게 둘러보기`, exact: true });
        await expect(shortcut).toHaveAttribute('href', `/stores?domain=${value}`);
        const importedImage = new RegExp(`/(?:src/assets/service-domains|assets)/${asset}-512(?:-[A-Za-z0-9_-]+)?\\.webp(?:\\?.*)?$`);
        await expect(shortcut.locator('img')).toHaveAttribute('src', importedImage);
    }
});
