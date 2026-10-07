import { expect, test } from '@playwright/test';
import dayjs from 'dayjs';

const account = { id: 41, name: 'UI 검사 회원', email: 'ui-check@example.test', role: 'USER', termsAgreed: true };
const store = {
    id: 81, name: 'UI 검증 가게', category: '카페', description: '사진과 예약 안내 확인', ownerId: 8,
    mainImageUrl: 'https://reserve-image.test/ui-first.svg', mainImageWidth: 800, mainImageHeight: 450,
    detailImageUrls: ['https://reserve-image.test/ui-first.svg', 'https://reserve-image.test/ui-second.svg'],
    reservationSlotMinutes: 30, bookingType: 'TIME', openTime: '09:00', closeTime: '18:00',
    rating: 4.5, reviewCount: 0,
};
const emptyPage = { content: [], page: { number: 0, totalElements: 0, totalPages: 0 } };
const ok = (route, data) => route.fulfill({ json: { success: true, data } });

async function mockUiApi(page, { signedIn = false } = {}) {
    const requests = { readiness: 0, deletion: 0 };
    await page.route('https://reserve-image.test/ui-*.svg', route => route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="${route.request().url().includes('first') ? '#3182f6' : '#e5a73b'}"/></svg>`,
    }));
    // Every API request is intercepted. Withdrawal tests never reach a real account or backend.
    await page.route('**/api/**', route => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        if (!path.startsWith('/api/')) return route.continue();
        if (path === '/api/member/me') return signedIn ? ok(route, account)
            : route.fulfill({ status: 401, json: { success: false, message: '로그인이 필요합니다.' } });
        if (path === '/api/auth/refresh') return route.fulfill({ status: 401, json: { success: false, message: '로그인이 필요합니다.' } });
        if (path === '/api/stores/81') return ok(route, store);
        if (path === '/api/stores') return ok(route, { content: [store], page: { number: 0, totalElements: 1, totalPages: 1 } });
        if (path === '/api/reservations/calendar') {
            const month = dayjs(`${url.searchParams.get('month')}-01`);
            return ok(route, Array.from({ length: month.daysInMonth() }, (_, index) => ({
                date: month.date(index + 1).format('YYYY-MM-DD'),
                status: ['OPEN', 'CLOSED', 'FULL'][index] ?? 'OUT_OF_PERIOD', holiday: false,
            })));
        }
        if (path === '/api/member/withdrawal-readiness') {
            requests.readiness += 1;
            return ok(route, { canWithdraw: false, openStores: 1, unresolvedReservations: 2, unresolvedRefunds: 0, openPaymentIssues: 0, unfinishedWebhooks: 0 });
        }
        if (path === '/api/member/delete') {
            requests.deletion += 1;
            return route.fulfill({ status: 409, json: { success: false, message: 'UI 검사는 계정을 삭제하지 않습니다.' } });
        }
        if (path === '/api/chat/unread' || path === '/api/chat/my/unread') return ok(route, 0);
        if (path === '/api/chat/intro/support') return ok(route, { configured: false, displayName: 'RESERVE 고객지원', items: [] });
        if (path === '/api/chat/images/config') return ok(route, { enabled: false, maxBytes: 0 });
        if (path === '/api/chat/conversations' || path === '/api/chat/store-inbox') return ok(route, emptyPage);
        return ok(route, []);
    });
    return requests;
}

test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
});

test('first card press does not zoom its photo on touch, while desktop hover and navigation remain', async ({ page, isMobile }) => {
    await mockUiApi(page);
    await page.goto('/stores?view=cards');
    const shell = page.locator('.reserve-store-card-shell');
    const card = page.locator('.reserve-card').filter({ has: shell });
    const photo = shell.locator('.reserve-card-image');
    await expect(photo).toBeVisible();
    await expect(photo).toHaveJSProperty('naturalWidth', 800);
    const box = await photo.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    if (isMobile) await expect.poll(() => photo.evaluate(element => getComputedStyle(element).transform)).toBe('none');
    else await expect.poll(() => photo.evaluate(element => getComputedStyle(element).transform)).toBe('matrix(1.05, 0, 0, 1.05, 0, 0)');
    await page.mouse.down();
    try {
        await expect(card).toHaveCSS('transform', 'matrix(0.98, 0, 0, 0.98, 0, 0)');
        await expect(card).toHaveCSS('opacity', '0.88');
        await expect(shell).toHaveCSS('transform', 'none');
        const frames = await photo.evaluate(element => new Promise(resolve => {
            const samples = [];
            const sample = () => {
                samples.push(getComputedStyle(element).transform);
                if (samples.length < 12) requestAnimationFrame(sample); else resolve(samples);
            };
            requestAnimationFrame(sample);
        }));
        if (isMobile) expect(frames.every(frame => frame === 'none'), JSON.stringify(frames)).toBe(true);
        else expect(frames.some(frame => frame.startsWith('matrix(1.05,')), JSON.stringify(frames)).toBe(true);
    } finally {
        await page.mouse.up();
    }
    await expect(page).toHaveURL(/\/store\/81$/);
    await expect(page.getByRole('heading', { name: store.name, exact: true })).toBeVisible();
});

test('gallery slide corners stay rounded during movement and original preview remains unrounded', async ({ page }) => {
    await mockUiApi(page);
    await page.goto('/store/81');
    const gallery = page.locator('.reserve-store-gallery');
    await expect(gallery.locator('.slick-active .ant-image-img').first()).toBeVisible();
    const sampling = gallery.evaluate(element => new Promise(resolve => {
        const frames = [];
        const sample = () => {
            const bounds = element.getBoundingClientRect();
            const images = [...element.querySelectorAll('.ant-image')].filter(image => {
                const box = image.getBoundingClientRect();
                return box.right > bounds.left + 1 && box.left < bounds.right - 1;
            }).map(image => ({ radius: getComputedStyle(image).borderRadius, overflow: getComputedStyle(image).overflow,
                imageRadius: getComputedStyle(image.querySelector('img')).borderRadius }));
            frames.push({ images, track: getComputedStyle(element.querySelector('.slick-track')).transform });
            if (frames.length < 40) requestAnimationFrame(sample); else resolve(frames);
        };
        requestAnimationFrame(sample);
    }));
    await gallery.locator('.slick-dots li:not(.slick-active) button').first().click();
    const frames = await sampling;
    expect(frames.some(frame => frame.images.length >= 2), JSON.stringify(frames)).toBe(true);
    expect(new Set(frames.map(frame => frame.track)).size).toBeGreaterThan(1);
    expect(frames.every(frame => frame.images.every(image => image.radius === '16px' && image.overflow === 'hidden' && image.imageRadius === '16px'))).toBe(true);
    const photo = gallery.locator('.slick-active .ant-image').first();
    await photo.click();
    const preview = page.locator('.reserve-store-detail-preview');
    await expect(preview).toBeVisible();
    const original = preview.locator('.ant-image-preview-img').first();
    await expect(original).toHaveCSS('border-radius', '0px');
    expect(await original.getAttribute('src')).toMatch(/^https:\/\/reserve-image\.test\/ui-(first|second)\.svg$/);
    await preview.locator('.ant-image-preview-close').click();
    await expect(preview).toBeHidden();
});

test('out-of-period dates stay disabled without visible period labels and valid dates can still be picked', async ({ page }) => {
    await mockUiApi(page);
    await page.goto('/store/81');
    await page.getByRole('button', { name: '날짜 선택', exact: true }).click();
    const calendar = page.getByRole('dialog', { name: '예약 날짜 선택' });
    await expect(calendar).toBeVisible();
    const blocked = calendar.locator('button.reserve-cal-cell').filter({ hasText: /^4$/ });
    await expect(blocked).toBeDisabled();
    await expect(blocked).toHaveAccessibleName(/예약 가능한 기간이 아닙니다$/);
    await expect(calendar.getByText('기간 밖', { exact: true })).toHaveCount(0);
    await expect(calendar.getByRole('button', { name: /2일 휴무$/ })).toBeDisabled();
    await expect(calendar.getByRole('button', { name: /3일 마감$/ })).toBeDisabled();
    await calendar.getByRole('button', { name: /월 1일$/ }).click();
    await expect(calendar).toBeHidden();
    await expect(page.locator('.reserve-cal-trigger')).not.toHaveText('날짜 선택');
});

test('withdrawal opens confirmation first, cancellation sends nothing, and server-blocked confirmation never deletes', async ({ page }) => {
    const requests = await mockUiApi(page, { signedIn: true });
    await page.goto('/my-page');
    const withdraw = page.locator('#root').getByRole('button', { name: '탈퇴하기', exact: true });
    await withdraw.click();
    const confirm = page.getByRole('dialog', { name: '회원 탈퇴' });
    await expect(confirm).toBeVisible();
    expect(requests).toEqual({ readiness: 0, deletion: 0 });
    await confirm.getByRole('button', { name: '취소', exact: true }).click();
    await expect(confirm).toBeHidden();
    expect(requests).toEqual({ readiness: 0, deletion: 0 });
    await withdraw.click();
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: '탈퇴하기', exact: true }).click();
    await expect(page.getByText(/먼저 처리할 항목이 있습니다. 운영 중 가게 1곳, 예약 2건/)).toBeVisible();
    expect(requests).toEqual({ readiness: 1, deletion: 0 });
    await expect(withdraw).toBeEnabled();
    await expect(page).toHaveURL(/\/my-page$/);
});

test('mobile messages fill changing viewport heights without bottom dead space or document scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockUiApi(page, { signedIn: true });
    await page.goto('/messages');
    const surface = page.locator('.reserve-messenger--page');
    const footer = surface.locator('.reserve-messenger-footer');
    await expect(footer).toBeVisible();
    // The bottom stays anchored even while entry scaling still changes the top.
    await expect(page.locator('.reserve-messages-route')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    for (const size of [{ width: 390, height: 844 }, { width: 390, height: 674 }, { width: 667, height: 400 }, { width: 767, height: 674 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(size);
        await expect.poll(() => footer.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - window.innerHeight))).toBeLessThan(1);
        const dimensions = await page.evaluate(() => ({
            viewport: window.innerHeight, document: document.documentElement.scrollHeight,
            contentTop: document.querySelector('.reserve-messenger--page').getBoundingClientRect().top,
            headerBottom: document.querySelector('header').getBoundingClientRect().bottom,
        }));
        expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
        expect(dimensions.contentTop).toBeCloseTo(dimensions.headerBottom, 0);
        await expect(footer.getByRole('button', { name: /설정/ })).toBeVisible();
    }
    await page.goto('/messages/');
    await expect(footer).toBeVisible();
    await expect(page.locator('.reserve-app-footer')).toHaveCount(0);
    await expect.poll(() => footer.evaluate(element => Math.abs(element.getBoundingClientRect().bottom - window.innerHeight))).toBeLessThan(1);
});
