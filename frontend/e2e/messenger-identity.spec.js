import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const account = { id: 41, name: '테스트 고객', email: 'identity@example.test', role: 'USER', termsAgreed: true };
const pageOf = (rows) => ({ content: rows, page: { number: 0, totalElements: rows.length, totalPages: 1 } });
const ok = (route, data) => route.fulfill({ json: { success: true, data } });

async function mockApi(page, user, memberRows, ownerRows = []) {
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        if (path === '/api/member/me') return ok(route, user);
        if (path === '/api/chat/unread' || path === '/api/chat/my/unread') return ok(route, 0);
        if (path === '/api/chat/conversations') return ok(route, pageOf(memberRows));
        if (path === '/api/chat/store-inbox') return ok(route, pageOf(ownerRows));
        if (/^\/api\/chat\/rooms\/\d+\/messages$/.test(path)) return ok(route, []);
        if (/^\/api\/chat\/rooms\/\d+\/read$/.test(path)) return ok(route, null);
        if (path === '/api/chat/support/open') {
            await new Promise(resolve => setTimeout(resolve, 100));
            return ok(route, {
                roomId: 1, type: 'SUPPORT', title: 'RESERVE 고객지원',
                counterpartName: '한재은', counterpartProfileImage: 'https://example.test/admin.png',
                viewerRole: 'MEMBER', canSend: true, messages: [
                    { id: 11, senderRole: 'MEMBER', content: '문의합니다', createdAt: '2026-09-15T10:00:00' },
                    { id: 12, senderRole: 'ADMIN', senderName: '한재은', content: '확인했습니다', createdAt: '2026-09-15T10:01:00' },
                ],
            });
        }
        if (path === '/api/notices/highlights') return ok(route, []);
        return ok(route, pageOf([]));
    });
}

test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });
});

test('thread entry uses the same calm easing and duration as returning to the list', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockApi(page, account, [{ roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', lastMessagePreview: '모션 확인' }]);
    await page.addInitScript(() => {
        window.__threadMotion = [];
        document.addEventListener('animationstart', event => {
            if (!event.target.matches('.reserve-messenger-thread')) return;
            const style = getComputedStyle(event.target);
            window.__threadMotion.push({ name: event.animationName, duration: style.animationDuration, easing: style.animationTimingFunction });
        });
    });
    if (testInfo.project.name === 'mobile-chromium') await page.goto('/messages');
    else {
        await page.goto('/');
        await page.getByRole('button', { name: '메시지 열기' }).click();
    }
    await page.getByRole('navigation', { name: '메신저 화면' }).getByRole('button', { name: '대화', exact: true }).click();
    await page.locator('.reserve-messenger-row').click();
    await expect.poll(() => page.evaluate(() => window.__threadMotion.some(event => event.name === 'reserve-messenger-thread-in'))).toBe(true);
    await expect(page.locator('.reserve-messenger')).not.toHaveClass(/is-opening-thread/);
    await page.getByRole('button', { name: '대화 목록으로 돌아가기' }).click();
    await expect(page.locator('.reserve-messenger-row')).toBeVisible();
    await expect(page.locator('.reserve-messenger')).not.toHaveClass(/is-returning-to-list/);
    const motions = await page.evaluate(() => window.__threadMotion);
    expect(motions).toEqual([
        { name: 'reserve-messenger-thread-in', duration: '0.26s', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
        { name: 'reserve-messenger-thread-back-out', duration: '0.26s', easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    ]);
});

test('support title stays branded before and after loading; rows show latest message', async ({ page }) => {
    await mockApi(page, account, [
        { roomId: 1, type: 'SUPPORT', counterpartName: '한재은', viewerRole: 'MEMBER',
            lastMessagePreview: '확인했습니다', lastMessageAt: '2026-09-15T10:01:00', unread: 0 },
        { roomId: 2, type: 'STORE', storeId: 12, storeName: '스케줄 청담', counterpartName: '가게 주인',
            viewerRole: 'MEMBER', lastMessagePreview: '예약 가능합니다', unread: 0 },
    ]);
    await page.goto('/');
    await page.getByRole('button', { name: '메시지 열기' }).click();
    await page.getByRole('navigation', { name: '메신저 화면' }).getByRole('button', { name: '대화' }).click();

    const rows = page.locator('.reserve-messenger-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('RESERVE 고객지원');
    await expect(rows.nth(0)).toContainText('확인했습니다');
    await expect(rows.nth(0)).not.toContainText('한재은');
    await expect(rows.nth(1)).toContainText('스케줄 청담');
    await expect(rows.nth(1)).toContainText('예약 가능합니다');
    await expect(rows.nth(1)).not.toContainText('가게 주인');
    await expect(page.locator('.reserve-messenger-row-subtitle')).toHaveCount(0);

    await rows.nth(0).click();
    const title = page.locator('#reserve-messenger-thread-title');
    await expect(title).toHaveText('RESERVE 고객지원');
    await expect(page.locator('.reserve-chat-sender-name')).toHaveText('RESERVE 고객지원');
    await expect(page.locator('.reserve-messenger')).not.toContainText('한재은');
});

test('owner inbox uses the customer name while the member side uses the store name', async ({ page }) => {
    await mockApi(page, { ...account, role: 'BUSINESS' }, [
        { roomId: 2, type: 'STORE', storeId: 12, storeName: '스케줄 청담', counterpartName: '가게 주인',
            viewerRole: 'MEMBER', lastMessagePreview: '예약 가능합니다', unread: 0 },
    ], [
        { roomId: 3, type: 'STORE', storeId: 12, storeName: '스케줄 청담', counterpartName: '문의 고객',
            viewerRole: 'OWNER', lastMessagePreview: '몇 시까지 하나요?', unread: 0 },
    ]);
    await page.goto('/');
    await page.getByRole('button', { name: '메시지 열기' }).click();
    await page.getByRole('navigation', { name: '메신저 화면' }).getByRole('button', { name: '대화' }).click();

    const rows = page.locator('.reserve-messenger-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('스케줄 청담');
    await expect(rows.nth(0)).not.toContainText('가게 주인');
    await expect(rows.nth(1)).toContainText('문의 고객');
    await expect(rows.nth(1)).toContainText('몇 시까지 하나요?');
    await expect(rows.nth(1)).not.toContainText('스케줄 청담');
});

test('photo-only messages use multipart upload and an authenticated preview', async ({ page }, testInfo) => {
    await mockApi(page, account, [{ roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', lastMessagePreview: '사진 문의' }]);
    const png = readFileSync(new URL('../../docs/images/readme-v2.6/store-detail.png', import.meta.url));
    let upload;
    await page.route('**/api/chat/images/config', route => ok(route, { enabled: true, maxBytes: 8388608 }));
    await page.route('**/api/chat/rooms/1/images', route => {
        upload = route.request();
        return ok(route, { id: 33, senderRole: 'MEMBER', content: '', imageUrl: '/api/chat/images/33', imageWidth: 1600, imageHeight: 900 });
    });
    await page.route('**/api/chat/images/33', route => route.fulfill({ contentType: 'image/png', body: png }));
    await page.goto('/');
    await page.getByRole('button', { name: '메시지 열기' }).click();
    await page.getByRole('navigation', { name: '메신저 화면' }).getByRole('button', { name: '대화' }).click();
    await page.locator('.reserve-messenger-row').click();
    await expect(page.getByRole('button', { name: '사진 첨부' })).toBeEnabled();
    await page.getByLabel('첨부할 사진 선택').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByAltText('전송할 사진')).toBeVisible();
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    const photo = page.getByAltText('대화에 첨부한 사진');
    await expect(photo).toBeVisible();
    await expect(photo).toHaveJSProperty('naturalWidth', 1600);
    expect((await photo.boundingBox()).width).toBeGreaterThan(150);
    expect(await photo.getAttribute('src')).toMatch(/^blob:/);
    expect(upload.method()).toBe('POST');
    expect(upload.headers()['content-type']).toContain('multipart/form-data; boundary=');
    expect(upload.postData()).toContain('name="clientMessageId"');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('chat-photo.png') });
    await page.getByRole('button', { name: '사진 크게 보기', exact: true }).click();
    const expanded = page.locator('.ant-image-preview-img');
    await expect(expanded).toBeVisible();
    await expect(expanded).toHaveJSProperty('naturalWidth', 1600);
    expect(await expanded.getAttribute('src')).toMatch(/^blob:/);
    await page.keyboard.press('Escape');
    await expect(expanded).not.toBeVisible();
    await expect(photo).toBeVisible();
    await page.getByRole('button', { name: '사진 크게 보기', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(expanded).toBeVisible();
    await expect(page.locator('.reserve-image-preview')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(expanded).not.toBeVisible();
});
