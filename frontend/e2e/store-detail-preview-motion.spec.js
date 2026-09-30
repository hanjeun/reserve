import { expect, test } from '@playwright/test';

const store = {
    id: 81, name: '미리보기 검증 가게', category: '카페', description: '사진 확인',
    ownerId: 8, mainImageUrl: 'https://reserve-image.test/photo.svg',
    detailImageUrls: ['https://reserve-image.test/photo.svg'],
    reservationSlotMinutes: 30, openTime: '09:00', closeTime: '18:00',
};

async function mockStorePreview(page, { authenticated = false, storeOverrides = {} } = {}) {
    const responseStore = { ...store, ...storeOverrides };
    await page.route('https://reserve-image.test/photo.svg', route => route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#4295dd"/></svg>',
    }));
    await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        if (path === '/api/member/me') return route.fulfill(authenticated
            ? { json: { success: true, data: { id: 41, name: '레이아웃 확인 사용자', role: 'USER', termsAgreed: true } } }
            : { status: 401, json: { success: false, message: '로그인이 필요합니다.' } });
        if (path === '/api/auth/refresh') return route.fulfill({ status: 401, json: { success: false, message: '로그인이 필요합니다.' } });
        return route.fulfill({ json: { success: true, data: path === '/api/stores/81' ? responseStore : [] } });
    });
}

test('first store-detail photo preview animates its entrance after a fresh navigation', async ({ page }) => {
    page.on('pageerror', error => console.error(`[preview page error] ${error.message}`));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockStorePreview(page);

    await page.goto('/store/81');
    const photo = page.locator('.reserve-carousel .slick-active .ant-image img').first();
    await expect(photo).toBeVisible();
    await expect(photo).toHaveJSProperty('complete', true);
    const sourceBox = await photo.boundingBox();

    await page.evaluate(() => {
        window.previewFrames = [];
        const sample = () => {
            const root = document.querySelector('.reserve-image-preview');
            if (root && getComputedStyle(root).display !== 'none') {
                const body = root.querySelector('.ant-image-preview-body');
                const mask = root.querySelector('.ant-image-preview-mask');
                if (body) window.previewFrames.push({
                    className: root.className,
                    transform: getComputedStyle(body).transform,
                    rootOpacity: Number.parseFloat(getComputedStyle(root).opacity),
                    maskOpacity: mask ? Number.parseFloat(getComputedStyle(mask).opacity) : 0,
                    transition: getComputedStyle(body).transitionDuration,
                    animation: getComputedStyle(body).animationName,
                });
            }
            if (window.previewFrames.length < 35) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    });
    await photo.locator('..').click();
    await expect(page.locator('.reserve-image-preview')).toBeVisible();
    const transformOrigin = await page.locator('.reserve-image-preview .ant-image-preview-body').evaluate(
        element => getComputedStyle(element).transformOrigin.split(' ').slice(0, 2).map(Number.parseFloat),
    );
    expect(transformOrigin[0]).toBeCloseTo(sourceBox.x + sourceBox.width / 2, 0);
    expect(transformOrigin[1]).toBeCloseTo(sourceBox.y + sourceBox.height / 2, 0);
    await page.waitForTimeout(420);

    const frames = await page.evaluate(() => window.previewFrames);
    expect(frames.some(frame => frame.animation === 'reserve-preview-first-entrance'), JSON.stringify(frames)).toBe(true);
    const scales = frames.map(frame => frame.transform).filter(value => value.startsWith('matrix('));
    expect(scales.some(value => Number(value.split(/[,(]/)[1]) < 0.15), JSON.stringify(frames)).toBe(true);
    expect(scales.some(value => {
        const scale = Number(value.split(/[,(]/)[1]);
        return scale > 0.15 && scale < 0.85;
    }), JSON.stringify(frames)).toBe(true);
    expect(scales.some(value => Number(value.split(/[,(]/)[1]) > 0.95), JSON.stringify(frames)).toBe(true);
    const scaleAt = frame => frame.transform.startsWith('matrix(')
        ? Number(frame.transform.split(/[,(]/)[1]) : 1;
    const firstScaleFrame = frames.findIndex(frame => scaleAt(frame) > 0.05);
    const firstBackdropFrame = frames.findIndex(frame => frame.rootOpacity * frame.maskOpacity > 0.05);
    expect(firstScaleFrame).toBeGreaterThanOrEqual(0);
    expect(firstBackdropFrame).toBeGreaterThanOrEqual(0);
    expect(firstBackdropFrame, JSON.stringify(frames)).toBeLessThanOrEqual(firstScaleFrame + 1);
    expect(frames.some(frame => frame.maskOpacity > 0.05 && frame.maskOpacity < 0.95), JSON.stringify(frames)).toBe(true);
    // Reuse the intermediate frames already required above. Under CI load, consecutive
    // samples can jump from 0.17 to 0.84 without entering a second, narrower interval.
    const intermediateFrames = frames.filter(frame => {
        const scale = scaleAt(frame);
        return scale > 0.15 && scale < 0.85;
    });
    expect(intermediateFrames.length, JSON.stringify(frames)).toBeGreaterThan(0);
    expect(intermediateFrames.every(frame => frame.rootOpacity > scaleAt(frame)), JSON.stringify(frames)).toBe(true);
    await page.locator('.reserve-image-preview .ant-image-preview-close').click();
    await expect(page.locator('.reserve-image-preview')).toBeHidden();
    await photo.locator('..').click();
    await expect(page.locator('.reserve-image-preview')).toBeVisible();
});

test('first-open motion survives a lost appear-active class', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockStorePreview(page);
    await page.goto('/store/81');
    const photo = page.locator('.reserve-carousel .slick-active .ant-image').first();
    await expect(photo).toBeVisible();
    await page.evaluate(() => {
        window.interruptedFrames = [];
        window.removedAppearActive = false;
        const observer = new MutationObserver(() => {
            const root = document.querySelector('.reserve-image-preview');
            if (root?.classList.contains('ant-image-preview-fade-appear-active')) {
                root.classList.remove('ant-image-preview-fade-appear-active');
                window.removedAppearActive = true;
                observer.disconnect();
            }
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
        const sample = () => {
            const body = document.querySelector('.reserve-image-preview .ant-image-preview-body');
            if (body) window.interruptedFrames.push(getComputedStyle(body).transform);
            if (window.interruptedFrames.length < 30) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    });
    await photo.click();
    await expect(page.locator('.reserve-image-preview')).toBeVisible();
    await page.waitForTimeout(400);
    const result = await page.evaluate(() => ({ removed: window.removedAppearActive, frames: window.interruptedFrames }));
    expect(result.removed).toBe(true);
    expect(result.frames.some(value => {
        const scale = Number(value.split(/[,(]/)[1]);
        return scale > 0.15 && scale < 0.85;
    }), JSON.stringify(result)).toBe(true);
});

test('store quick actions share one horizontal title row without covering a long description', async ({ page }) => {
    await mockStorePreview(page, {
        storeOverrides: {
            name: '아주 긴 이름을 가진 예약 가게 레이아웃 확인점',
            description: '가게 소개가 길어져도 제목 옆의 빠른 작업 아이콘과 겹치지 않아야 합니다. '.repeat(4),
            phone: '02-1234-5678',
            depositAmount: 0,
            bookingDeadlineHours: 1,
            paymentDeadlineHours: 1,
            paymentDeadlineMinutes: 0,
            maxCapacity: 10,
        },
    });
    await page.goto('/store/81');

    const titleRow = page.locator('.reserve-store-identity-title-row');
    const actions = titleRow.locator('.reserve-store-identity-actions');
    const actionItems = actions.locator('.reserve-favorite-button, .reserve-store-contact-action');
    await expect(actionItems).toHaveCount(2);
    await expect(actions).toHaveCSS('flex-direction', 'row');
    for (const item of await actionItems.all()) {
        const box = await item.boundingBox();
        expect(box.width).toBeCloseTo(44, 0);
        expect(box.height).toBeCloseTo(44, 0);
    }
    const contactStyle = await actions.locator('.reserve-store-contact-action').first().evaluate(element => {
        const style = getComputedStyle(element);
        return { borderWidth: style.borderTopWidth, borderRadius: style.borderRadius, background: style.backgroundColor };
    });
    expect(contactStyle).toEqual({ borderWidth: '0px', borderRadius: '0px', background: 'rgba(0, 0, 0, 0)' });

    const titleBox = await titleRow.boundingBox();
    const summaryBox = await page.locator('.reserve-store-identity-summary').boundingBox();
    expect(summaryBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
