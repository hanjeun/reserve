import { expect, test } from '@playwright/test';

const store = {
    id: 81, name: '운영 안내 검증 가게', category: '카페', description: '기존 가게 소개',
    ownerId: 8, mainImageUrl: 'https://reserve-image.test/schedule.svg',
    detailImageUrls: ['https://reserve-image.test/schedule.svg'],
    reservationSlotMinutes: 30, openTime: '09:00', closeTime: '18:00',
    bookingType: 'SESSION', openDate: '2026-09-01', closeDate: '2026-12-31',
    closedDays: [6, 7], maxAdvanceBookingDays: 30,
    noShowDeposit: 10000, fullRefundDays: 3, partialRefundDays: 1, partialRefundRate: 50,
    bookingDeadlineHours: 1, paymentTimeoutMinutes: 10, maxCapacityPerSlot: 2,
};

test('keeps the data skeleton still and moves schedule copy into store information', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    let releaseDetail;
    const detailReady = new Promise(resolve => { releaseDetail = resolve; });
    await page.route('https://reserve-image.test/schedule.svg', route => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#4295dd"/></svg>',
    }));
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        if (path === '/api/member/me' || path === '/api/auth/refresh') {
            return route.fulfill({ status: 401, json: { success: false, message: '로그인이 필요합니다.' } });
        }
        if (path === '/api/stores/81') {
            await detailReady;
            return route.fulfill({ json: { success: true, data: store } });
        }
        const data = path === '/api/stores' ? { content: [store], page: { totalElements: 1, totalPages: 1 } } : [];
        return route.fulfill({ json: { success: true, data } });
    });

    try {
        await page.goto('/stores');
        await page.getByRole('link', { name: '운영 안내 검증 가게 상세 보기', exact: true }).click();
        const skeleton = page.locator('.reserve-data-skeleton');
        await expect(skeleton).toBeVisible();
        await expect(skeleton).toHaveAttribute('aria-busy', 'true');
        const frames = await skeleton.evaluate(element => new Promise(resolve => {
            const samples = [];
            const sample = () => {
                const box = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                samples.push({ x: box.x, y: box.y, animation: style.animationName, transform: style.transform });
                if (samples.length < 18) requestAnimationFrame(sample);
                else resolve(samples);
            };
            requestAnimationFrame(sample);
        }));
        expect(frames.every(frame => frame.animation === 'none' && frame.transform === 'none'), JSON.stringify(frames)).toBe(true);
        expect(Math.max(...frames.map(frame => frame.x)) - Math.min(...frames.map(frame => frame.x))).toBeLessThan(0.25);
        expect(Math.max(...frames.map(frame => frame.y)) - Math.min(...frames.map(frame => frame.y))).toBeLessThan(0.25);
        releaseDetail();
        await expect(page.getByRole('heading', { name: store.name, exact: true })).toBeVisible();
        await expect(skeleton).toHaveCount(0);
        await expect(page.getByText('기존 가게 소개', { exact: true })).toBeVisible();
        await expect(page.getByText('운영 기간', { exact: true })).toBeVisible();
        await expect(page.getByText('2026-09-01 ~ 2026-12-31', { exact: true })).toBeVisible();
        await expect(page.getByText('매주 토·일 휴무', { exact: true })).toBeVisible();
        await expect(page.getByText('30일 이내만 예약 가능', { exact: true })).toBeVisible();
        const dateField = page.locator('.ant-form-item').filter({ has: page.getByRole('button', { name: '날짜 선택', exact: true }) });
        await expect(dateField.locator('.ant-form-item-extra')).toHaveCount(0);
        await expect(page.getByText('날짜를 먼저 선택해주세요', { exact: true })).toBeVisible();
        await expect(page.getByText('아직 리뷰가 없어요. 첫 번째 리뷰를 남겨보세요!', { exact: true })).toBeVisible();
        await expect(page.locator('body')).not.toContainText('NaN');
        await expect(page.locator('body')).not.toContainText('undefined');
        await page.screenshot({ path: test.info().outputPath('store-schedule-information.png'), fullPage: true });
    } finally {
        releaseDetail();
    }
});
