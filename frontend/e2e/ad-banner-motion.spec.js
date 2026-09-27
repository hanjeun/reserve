import { expect, test } from '@playwright/test';

const bannerAd = {
    id: 99,
    storeId: 81,
    storeName: '배너 확인 가게',
    title: '지금 예약 가능한 가게',
    description: '오늘 자리를 확인해 보세요',
    imageUrls: ['https://reserve-image.test/banner.svg'],
    bannerMotionKey: 'SOFT_RISE',
};

test('banner enters with a soft scale rise and keeps a large close target', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route('https://reserve-image.test/banner.svg', route => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#d9e9ff"/></svg>',
    }));
    await page.route('**/api/**', route => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        if (!path.startsWith('/api/')) return route.continue();
        if (path === '/api/member/me' || path === '/api/auth/refresh') {
            return route.fulfill({ status: 401, json: { success: false, message: '로그인이 필요합니다.' } });
        }
        if (path === '/api/advertisements/active') {
            return route.fulfill({ json: { success: true, data: url.searchParams.get('type') === 'BANNER' ? [bannerAd] : [] } });
        }
        if (path === '/api/stores') {
            return route.fulfill({ json: { success: true, data: { content: [], page: { number: 0, totalElements: 0, totalPages: 0 } } } });
        }
        return route.fulfill({ json: { success: true, data: null } });
    });

    await page.goto('/stores');
    const close = page.getByRole('button', { name: '광고 닫기' });
    await expect(close).toBeAttached();
    const banner = close.locator('..');
    await page.evaluate(() => {
        window.adBannerFrames = [];
        const sample = () => {
            const closeButton = document.querySelector('.ad-banner-close-btn');
            const wrapper = closeButton?.parentElement;
            if (wrapper) {
                const style = getComputedStyle(wrapper);
                window.adBannerFrames.push({ transform: style.transform, opacity: Number.parseFloat(style.opacity) });
            }
            if (window.adBannerFrames.length < 90) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    });

    await expect(banner).toHaveCSS('opacity', '1', { timeout: 3000 });
    await page.waitForTimeout(500);
    const closeBox = await close.boundingBox();
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    await expect(close).toHaveCSS('border-radius', '12px');
    const imageBox = await page.locator('.reserve-ad-banner-image').boundingBox();
    expect(Math.abs(imageBox.width - imageBox.height)).toBeLessThan(1);
    await expect(page.getByText(bannerAd.title, { exact: true })).toHaveCSS('white-space', 'nowrap');
    await expect(page.getByText(bannerAd.description, { exact: true })).toHaveCSS('white-space', 'nowrap');
    const frames = await page.evaluate(() => window.adBannerFrames);
    const scales = frames
        .map(frame => frame.transform.startsWith('matrix(') ? Number(frame.transform.split(/[,(]/)[1]) : 1)
        .filter(Number.isFinite);
    expect(scales.some(scale => scale <= 0.93), JSON.stringify(frames)).toBe(true);
    expect(scales.some(scale => scale > 0.94 && scale < 0.995), JSON.stringify(frames)).toBe(true);
    expect(scales.some(scale => scale >= 0.999), JSON.stringify(frames)).toBe(true);

    await close.click();
    await expect(close).toBeHidden();
});

test('selected 3D motion starts nearly flat and settles upright', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route('https://reserve-image.test/banner.svg', route => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#d9e9ff"/></svg>',
    }));
    await page.route('**/api/**', route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (url.pathname === '/api/member/me' || url.pathname === '/api/auth/refresh') {
            return route.fulfill({ status: 401, json: { success: false, message: '로그인이 필요합니다.' } });
        }
        if (url.pathname === '/api/advertisements/active') {
            return route.fulfill({ json: { success: true, data: url.searchParams.get('type') === 'BANNER'
                ? [{ ...bannerAd, bannerMotionKey: 'TILT_UP_3D' }] : [] } });
        }
        if (url.pathname === '/api/stores') {
            return route.fulfill({ json: { success: true, data: { content: [], page: { number: 0, totalElements: 0, totalPages: 0 } } } });
        }
        return route.fulfill({ json: { success: true, data: null } });
    });

    await page.goto('/stores');
    const banner = page.locator('.reserve-ad-banner');
    await expect(banner).toHaveAttribute('data-motion', 'TILT_UP_3D');
    await expect.poll(async () => banner.evaluate(node => getComputedStyle(node).animationName))
        .toBe('reserve-ad-banner-tilt-up');
    await expect(banner).toHaveCSS('opacity', '1', { timeout: 3000 });
    const motion = await banner.evaluate(async node => {
        const animation = node.getAnimations()
            .find(item => item.animationName === 'reserve-ad-banner-tilt-up');
        const frames = animation.effect.getKeyframes();
        await animation.finished;
        const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        return {
            firstTransform: frames[0].transform,
            lastTransform: frames.at(-1).transform,
            m22: matrix.m22,
            m23: matrix.m23,
            m32: matrix.m32,
            m33: matrix.m33,
        };
    });
    expect(motion.firstTransform).toContain('rotateX(78deg)');
    expect(motion.lastTransform).toContain('rotateX(0deg)');
    expect(motion.m22).toBeCloseTo(1, 5);
    expect(motion.m23).toBeCloseTo(0, 5);
    expect(motion.m32).toBeCloseTo(0, 5);
    expect(motion.m33).toBeCloseTo(1, 5);
});
