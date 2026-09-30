import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';


test('message actions center grouped short bubbles and keep tall bubbles bottom aligned', async ({ page }, testInfo) => {
    await mockApi(page, account, [{ roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', lastMessagePreview: '감사합니다' }]);
    await page.route('**/api/chat/support/open', route => ok(route, {
        roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', canSend: true, messages: [
            { id: 11, senderRole: 'MEMBER', canRetract: true, content: '확인했습니다', createdAt: '2026-09-15T10:00:00' },
            { id: 12, senderRole: 'MEMBER', canRetract: true, content: '감사합니다', createdAt: '2026-09-15T10:01:00' },
            { id: 13, senderRole: 'ADMIN', content: '상대방 안내입니다.', createdAt: '2026-09-15T10:02:00' },
            { id: 14, senderRole: 'MEMBER', canRetract: true, content: '여러 줄 안내입니다.\n두 번째 줄입니다.\n마지막 줄입니다.', createdAt: '2026-09-15T10:03:00' },
        ],
    }));
    if (testInfo.project.name === 'mobile-chromium') await page.goto('/messages');
    else {
        await page.goto('/');
        await page.getByRole('button', { name: '메시지 열기' }).click();
    }
    await page.getByRole('navigation', { name: '메신저 화면' }).getByRole('button', { name: '대화', exact: true }).click();
    await page.locator('.reserve-messenger-row').click();
    for (const content of ['확인했습니다', '감사합니다']) {
        const row = page.locator('.reserve-chat-message-row').filter({ has: page.getByText(content, { exact: true }) });
        const button = row.getByRole('button', { name: '메시지 관리' });
        await expect(button).toBeVisible();
        if (testInfo.project.name === 'chromium') await button.hover();
        const buttonBox = await button.boundingBox();
        const bubbleBox = await row.locator('.reserve-chat-bubble-group > div').boundingBox();
        expect(buttonBox.height).toBe(44);
        expect(Math.abs(buttonBox.y + buttonBox.height / 2 - bubbleBox.y - bubbleBox.height / 2)).toBeLessThan(1);
        const iconBox = await button.locator('svg').boundingBox();
        expect(Math.abs(iconBox.y + iconBox.height / 2 - bubbleBox.y - bubbleBox.height / 2)).toBeLessThan(1);
        expect(await button.evaluate(el => {
            const visual = getComputedStyle(el, '::before');
            return { width: visual.width, height: visual.height };
        })).toEqual({ width: '28px', height: '28px' });
    }
    const tallRow = page.locator('.reserve-chat-message-row').filter({ has: page.getByText('여러 줄 안내입니다.', { exact: false }) });
    const tallButton = tallRow.getByRole('button', { name: '메시지 관리' });
    const tallButtonBox = await tallButton.boundingBox();
    const tallBubbleBox = await tallRow.locator('.reserve-chat-bubble-group > div').boundingBox();
    expect(tallBubbleBox.height).toBeGreaterThan(44);
    expect(Math.abs(tallButtonBox.y + tallButtonBox.height - tallBubbleBox.y - tallBubbleBox.height)).toBeLessThan(1);
    const finalOwnRow = page.locator('.reserve-chat-message-row').filter({ has: page.getByText('감사합니다', { exact: true }) });
    const finalButton = finalOwnRow.getByRole('button', { name: '메시지 관리' });
    await expect(finalOwnRow.locator('.reserve-chat-message-time')).toHaveText('10:01');
    if (testInfo.project.name === 'chromium') await finalButton.hover();
    else await finalButton.focus();
    await page.locator('.reserve-messenger').screenshot({ path: testInfo.outputPath('chat-grouped-actions-aligned.png') });
    await finalButton.click();
    await expect(finalButton).toHaveAttribute('aria-expanded', 'true');
    await expect(finalOwnRow.locator('.reserve-chat-message-time')).toHaveCSS('visibility',
        testInfo.project.name === 'chromium' ? 'hidden' : 'visible');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


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
        if (/^\/api\/chat\/rooms\/\d+\/retractions$/.test(path)) return ok(route, { messages: [], nextRevision: 0, hasMore: false });
        if (/^\/api\/chat\/rooms\/\d+\/read$/.test(path)) return ok(route, null);
        if (path === '/api/chat/support/open') {
            await new Promise(resolve => setTimeout(resolve, 100));
            return ok(route, {
                roomId: 1, type: 'SUPPORT', title: 'RESERVE 고객지원',
                counterpartName: '한재은', counterpartProfileImage: 'https://example.test/admin.png',
                viewerRole: 'MEMBER', canSend: true, messages: [
                    { id: 11, senderRole: 'MEMBER', canRetract: true, content: '문의합니다', createdAt: '2026-09-15T10:00:00' },
                    { id: 12, senderRole: 'ADMIN', canRetract: false, senderName: '한재은', content: '확인했습니다', createdAt: '2026-09-15T10:01:00' },
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

test('neutral hidden-conversation controls keep touch clear and keyboard focus visible', async ({ page }, testInfo) => {
    await mockApi(page, account, []);
    await page.goto('/');
    await page.getByRole('button', { name: '메시지 열기' }).click();
    await expect(page.locator('.reserve-messenger-brand-cover img')).toHaveAttribute('src', /\/og-image\.png\?v=[a-f0-9]{12}$/);
    await page.getByRole('navigation', { name: '메신저 화면' }).getByRole('button', { name: '대화' }).click();
    const toggle = page.locator('.reserve-messenger-list-actions button[aria-pressed]');
    await expect(toggle).toHaveAccessibleName('숨긴 대화 보기');
    const refresh = page.getByRole('button', { name: '대화 목록 새로고침' });
    const neutralColor = await refresh.evaluate(el => getComputedStyle(el).color);
    if (testInfo.project.name === 'mobile-chromium') await toggle.tap();
    else {
        await toggle.hover();
        await expect(toggle).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await toggle.click();
        await page.mouse.move(0, 0);
    }
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAccessibleName('일반 대화 보기');
    await expect(toggle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(toggle).toHaveCSS('color', neutralColor);
    if (testInfo.project.name === 'mobile-chromium') {
        await expect(toggle).toHaveCSS('outline-style', 'none');
        await refresh.tap();
        await expect(refresh).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    } else {
        await page.keyboard.press('Tab');
        await toggle.focus();
        await expect(toggle).toHaveCSS('outline-style', 'solid');
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    }
});

test('launcher unread badge moves with the logo on hover and press', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockApi(page, account, []);
    await page.route('**/api/chat/unread', route => ok(route, 2));
    await page.goto('/');
    const launcher = page.getByRole('button', { name: '메시지, 읽지 않은 메시지 2개 열기' });
    const wrapper = page.locator('.reserve-messenger-launcher-wrap');
    const badge = wrapper.locator('.ant-badge-count');
    await expect(badge).toHaveText('2');
    await expect.poll(() => badge.evaluate(el => el.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'))).toBe(false);
    const beforeLogo = await launcher.boundingBox();
    const beforeBadge = await badge.boundingBox();
    await launcher.hover();
    await expect(wrapper).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)');
    const hoveredLogo = await launcher.boundingBox();
    const hoveredBadge = await badge.boundingBox();
    expect(hoveredLogo.y - beforeLogo.y).toBeCloseTo(-2, 1);
    expect(hoveredBadge.y - beforeBadge.y).toBeCloseTo(-2, 1);
    await expect(launcher).toHaveCSS('transform', 'none');
    try {
        await page.mouse.down();
        await expect(wrapper).toHaveCSS('transform', 'matrix(0.93, 0, 0, 0.93, 0, 0)');
        expect((await launcher.boundingBox()).width / beforeLogo.width).toBeCloseTo(0.93, 2);
        expect((await badge.boundingBox()).width / beforeBadge.width).toBeCloseTo(0.93, 2);
    } finally {
        await page.mouse.move(0, 0);
        await page.mouse.up();
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await launcher.hover();
    await expect(wrapper).toHaveCSS('transform', 'none');
});

test('thread entry uses the same calm easing and duration as returning to the list', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockApi(page, account, [{ roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', lastMessagePreview: '모션 확인' }]);
    await page.addInitScript(() => {
        window.__threadMotion = [];
        window.__threadHeights = [];
        window.__listMotion = [];
        document.addEventListener('animationstart', event => {
            const isThread = event.target.matches('.reserve-messenger-thread');
            const isList = event.target.matches('.reserve-messenger-list');
            if (!isThread && !isList) return;
            const style = getComputedStyle(event.target);
            const motion = { name: event.animationName, duration: style.animationDuration, easing: style.animationTimingFunction, direction: style.animationDirection };
            if (isThread) {
                window.__threadMotion.push(motion);
                const sample = () => {
                    if (!event.target.isConnected) return;
                    window.__threadHeights.push(event.target.clientHeight);
                    if (event.target.getAnimations().some(animation => animation.playState === 'running')) requestAnimationFrame(sample);
                };
                requestAnimationFrame(sample);
            }
            else {
                const animation = event.target.getAnimations().find(item => item.animationName === event.animationName);
                window.__listMotion.push({ ...motion, finalOpacity: animation?.effect.getKeyframes().at(-1).opacity });
            }
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
    await expect(page.locator('.reserve-messenger-list')).toHaveCount(0);
    const threadHeight = await page.locator('.reserve-messenger-thread').evaluate(element => element.clientHeight);
    const enteringHeights = await page.evaluate(() => window.__threadHeights);
    expect(enteringHeights).toEqual(enteringHeights.map(() => threadHeight));
    await page.getByRole('button', { name: '대화 목록으로 돌아가기' }).click();
    await expect(page.locator('.reserve-messenger-row')).toBeVisible();
    await expect(page.locator('.reserve-messenger')).not.toHaveClass(/is-returning-to-list/);
    const heights = await page.evaluate(() => window.__threadHeights);
    expect(heights.length).toBeGreaterThan(2);
    expect(heights).toEqual(heights.map(() => threadHeight));
    const motions = await page.evaluate(() => window.__threadMotion);
    expect(motions).toEqual([
        { name: 'reserve-messenger-thread-in', duration: '0.26s', easing: 'cubic-bezier(0.4, 0, 0.2, 1)', direction: 'normal' },
        { name: 'reserve-messenger-thread-back-out', duration: '0.26s', easing: 'cubic-bezier(0.4, 0, 0.2, 1)', direction: 'normal' },
    ]);
    expect(await page.evaluate(() => window.__listMotion.filter(event => event.name === 'reserve-messenger-list-out'))).toEqual([
        { name: 'reserve-messenger-list-out', duration: '0.26s', easing: 'cubic-bezier(0.22, 1, 0.36, 1)', direction: 'normal', finalOpacity: '0' },
    ]);
});

test('composer uses emoji, neutral send controls, white surfaces and owner-only unlimited retraction', async ({ page }, testInfo) => {
    await mockApi(page, account, [{ roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', lastMessagePreview: '문의합니다' }]);
    let retracts = 0;
    await page.route('**/api/chat/rooms/1/messages/11/retract', route => {
        retracts++;
        expect(route.request().method()).toBe('POST');
        return ok(route, { id: 11, senderRole: 'MEMBER', canRetract: false, content: '전송이 취소된 메시지입니다.', retracted: true, retractionRevision: 1 });
    });
    if (testInfo.project.name === 'mobile-chromium') await page.goto('/messages');
    else {
        await page.goto('/');
        await page.getByRole('button', { name: '메시지 열기' }).click();
    }
    await page.getByRole('navigation', { name: '메신저 화면' }).getByRole('button', { name: '대화', exact: true }).click();
    await page.locator('.reserve-messenger-row').click();
    const input = page.getByRole('textbox', { name: '메시지 입력' });
    await expect(input).toBeVisible();
    await expect(page.locator('.reserve-messenger-thread-body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.getByRole('button', { name: '이모지 선택', exact: true }).click();
    await page.getByRole('searchbox', { name: '이모지 검색' }).fill('coffee');
    await page.getByRole('button', { name: '커피 ☕' }).click();
    await expect(input).toHaveValue('☕');
    await expect(page.getByRole('button', { name: '보내기', exact: true })).toHaveCSS('background-color', 'rgb(242, 244, 246)');
    await expect(page.getByRole('button', { name: '메시지 관리' })).toHaveCount(1);
    const messageMenu = page.getByRole('button', { name: '메시지 관리' });
    await expect(messageMenu).toHaveCSS('width', '44px');
    await expect(messageMenu).toHaveCSS('height', '44px');
    const row = messageMenu.locator('xpath=ancestor::*[contains(@class,"reserve-chat-message-row")]');
    const shortBubble = row.getByText('문의합니다', { exact: true });
    const menuBox = await messageMenu.boundingBox();
    const bubbleBox = await shortBubble.boundingBox();
    expect(Math.abs(menuBox.y + menuBox.height / 2 - bubbleBox.y - bubbleBox.height / 2)).toBeLessThan(1);
    if (testInfo.project.name === 'chromium') {
        await messageMenu.hover();
        expect(await messageMenu.evaluate(element => {
            const visibleBox = getComputedStyle(element, '::before');
            return { width: visibleBox.width, height: visibleBox.height, background: visibleBox.backgroundColor };
        })).toEqual({ width: '28px', height: '28px', background: 'rgb(242, 244, 246)' });
        await expect(messageMenu).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
    await page.locator('.reserve-messenger').screenshot({ path: testInfo.outputPath('chat-actions-aligned.png') });
    await messageMenu.click();
    await page.getByRole('menuitem', { name: '전송 취소' }).click();
    await page.getByRole('button', { name: '전송 취소', exact: true }).click();
    await expect(page.locator('.reserve-chat-bubble-group')).toContainText(['전송이 취소된 메시지입니다.', '확인했습니다']);
    await expect(page.getByRole('button', { name: '메시지 관리' })).toHaveCount(0);
    expect(retracts).toBe(1);
    await expect(page.getByRole('dialog', { name: '메시지 전송을 취소할까요?' })).not.toBeVisible();
    await expect(page.locator('.reserve-messenger')).not.toContainText('문의합니다');
    await page.locator('.reserve-messenger').screenshot({ path: testInfo.outputPath('chat-composer-light.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await expect(page.locator('.reserve-messenger-thread-body')).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.locator('.reserve-messenger').screenshot({ path: testInfo.outputPath('chat-composer-dark.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('composer reserves both disabled tools while thread and image settings load', async ({ page }, testInfo) => {
    await mockApi(page, account, [{ roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', lastMessagePreview: '문의합니다' }]);
    let releaseThread;
    let releaseImage;
    const threadHeld = new Promise(resolve => { releaseThread = resolve; });
    const imageHeld = new Promise(resolve => { releaseImage = resolve; });
    await page.route('**/api/chat/support/open', async route => {
        await threadHeld;
        return ok(route, { roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', canSend: true, messages: [] });
    });
    await page.route('**/api/chat/images/config', async route => {
        await imageHeld;
        return ok(route, { enabled: true });
    });
    try {
        if (testInfo.project.name === 'mobile-chromium') await page.goto('/messages');
        else {
            await page.goto('/');
            await page.getByRole('button', { name: '메시지 열기' }).click();
        }
        await page.getByRole('navigation', { name: '메신저 화면' }).getByRole('button', { name: '대화', exact: true }).click();
        await page.locator('.reserve-messenger-row').click();
        const photo = page.getByRole('button', { name: '사진 첨부' });
        const emoji = page.getByRole('button', { name: '이모지 선택', exact: true });
        const input = page.getByRole('textbox', { name: '메시지 입력' });
        await expect(page.getByRole('status', { name: '대화를 불러오는 중' })).toBeVisible();
        await expect(photo).toBeVisible();
        await expect(photo).toBeDisabled();
        await expect(emoji).toBeDisabled();
        await expect(input).toBeDisabled();
        const emojiX = (await emoji.boundingBox()).x;
        await page.locator('.reserve-messenger').screenshot({ path: testInfo.outputPath('chat-composer-loading.png') });
        releaseThread();
        await expect(input).toBeEnabled();
        await expect(emoji).toBeEnabled();
        await expect(photo).toBeDisabled();
        releaseImage();
        await expect(photo).toBeEnabled();
        expect((await emoji.boundingBox()).x).toBeCloseTo(emojiX, 1);
        await page.locator('.reserve-messenger').screenshot({ path: testInfo.outputPath('chat-composer-ready.png') });
    } finally {
        releaseThread();
        releaseImage();
    }
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

test('photo captions stay below the image in narrow chat bubbles', async ({ page }, testInfo) => {
    await mockApi(page, account, [{ roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', lastMessagePreview: '릴리스 검증용' }]);
    const png = readFileSync(new URL('../public/icons/RESERVE_logo.png', import.meta.url));
    await page.route('**/api/chat/support/open', route => ok(route, {
        roomId: 1, type: 'SUPPORT', title: 'RESERVE 고객지원', viewerRole: 'MEMBER', canSend: true,
        messages: [{ id: 33, senderRole: 'MEMBER', content: '릴리스 검증용', imageUrl: '/api/chat/images/33', imageWidth: 512, imageHeight: 512 }],
    }));
    await page.route('**/api/chat/images/33', route => route.fulfill({ contentType: 'image/png', body: png }));
    if (testInfo.project.name === 'mobile-chromium') await page.goto('/messages');
    else {
        await page.goto('/');
        await page.getByRole('button', { name: '메시지 열기' }).click();
    }
    await page.getByRole('navigation', { name: '메신저 화면' }).getByRole('button', { name: '대화', exact: true }).click();
    await page.locator('.reserve-messenger-row').click();
    const photo = page.getByAltText('대화에 첨부한 사진');
    await expect(photo).toBeVisible();
    await expect(photo).toHaveJSProperty('naturalWidth', 512);
    const imageBox = await photo.boundingBox();
    const captionBox = await page.getByText('릴리스 검증용', { exact: true }).boundingBox();
    expect(captionBox.y).toBeGreaterThanOrEqual(imageBox.y + imageBox.height + 7);
    expect(captionBox.width).toBeGreaterThanOrEqual(imageBox.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('photo-only messages use multipart upload and an authenticated preview', async ({ page }, testInfo) => {
    await mockApi(page, account, [{ roomId: 1, type: 'SUPPORT', viewerRole: 'MEMBER', lastMessagePreview: '사진 문의' }]);
    const png = readFileSync(new URL('../../docs/images/store-detail.png', import.meta.url));
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
