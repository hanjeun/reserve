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

test('keeps the data skeleton still and moves schedule copy into store information', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    let releaseDetail;
    const detailReady = new Promise(resolve => { releaseDetail = resolve; });
    let releaseChunk;
    const chunkReady = new Promise(resolve => { releaseChunk = resolve; });
    await page.route('**/src/pages/store/StoreDetail.jsx*', async route => {
        await chunkReady;
        await route.continue();
    });
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
        const routeSkeleton = page.locator('.reserve-route-skeleton--detail');
        await expect(routeSkeleton).toBeVisible();
        await expect(skeleton).toBeVisible();
        await expect(skeleton).toHaveAttribute('aria-busy', 'true');
        const routeFrames = await skeleton.evaluate(() => new Promise((resolve, reject) => {
            const samples = [];
            const sample = () => {
                const element = document.querySelector('.reserve-data-skeleton');
                if (!element) { reject(new Error('The pending store route must retain a visible skeleton.')); return; }
                const box = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                samples.push({ x: box.x, y: box.y, width: box.width, height: box.height, animation: style.animationName, transform: style.transform });
                if (samples.length < 18) requestAnimationFrame(sample);
                else resolve(samples);
            };
            requestAnimationFrame(sample);
        }));
        const dataFramesReady = page.evaluate(async () => {
            const samples = [];
            let readyFrames = 0;
            while (readyFrames < 18) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                const element = document.querySelector('.reserve-data-skeleton');
                if (!element) throw new Error('The route-to-data transition must retain a visible store skeleton.');
                const box = element.getBoundingClientRect();
                if (box.width <= 0 || box.height <= 0) throw new Error('The current store skeleton must keep its geometry.');
                const style = getComputedStyle(element);
                const route = Boolean(element.closest('.reserve-route-skeleton'));
                samples.push({ x: box.x, y: box.y, width: box.width, height: box.height, route, animation: style.animationName, transform: style.transform });
                readyFrames = route ? 0 : readyFrames + 1;
            }
            return samples;
        });
        releaseChunk();
        const dataFrames = await dataFramesReady;
        await expect(routeSkeleton).toHaveCount(0);
        expect(dataFrames.filter(frame => !frame.route)).toHaveLength(18);
        const frames = [...routeFrames, ...dataFrames];
        expect(frames.every(frame => frame.animation === 'none' && frame.transform === 'none'), JSON.stringify(frames)).toBe(true);
        expect(Math.max(...frames.map(frame => frame.x)) - Math.min(...frames.map(frame => frame.x))).toBeLessThan(0.25);
        expect(Math.max(...frames.map(frame => frame.y)) - Math.min(...frames.map(frame => frame.y))).toBeLessThan(0.25);
        expect(Math.max(...frames.map(frame => frame.width)) - Math.min(...frames.map(frame => frame.width))).toBeLessThan(0.25);
        await page.screenshot({ path: testInfo.outputPath('store-detail-skeleton.png') });
        releaseDetail();
        await expect(page.getByRole('heading', { name: store.name, exact: true })).toBeVisible();
        await expect(skeleton).toHaveCount(0);
        const loaded = await page.locator('.reserve-store-detail').boundingBox();
        const lastSkeleton = dataFrames.at(-1);
        expect(loaded.x).toBeCloseTo(lastSkeleton.x, 1);
        expect(loaded.y).toBeCloseTo(lastSkeleton.y, 1);
        expect(loaded.width).toBeCloseTo(lastSkeleton.width, 1);
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
        releaseChunk();
        releaseDetail();
    }
});
