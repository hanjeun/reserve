import { expect, test } from '@playwright/test';

const account = { id: 41, name: '브라우저 검사 사용자', email: 'interaction@example.test', role: 'USER', termsAgreed: true };
const emptyPage = { content: [], page: { number: 0, totalElements: 0, totalPages: 0 } };
const supportThread = {
    roomId: 41, type: 'SUPPORT', title: 'RESERVE 고객지원', counterpartName: 'RESERVE 고객지원',
    viewerRole: 'MEMBER', canSend: true, messages: [],
};

const ok = (route, data) => route.fulfill({ json: { success: true, data } });

async function mockApi(page, user = null) {
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        if (path === '/api/member/me' || (path === '/api/auth/refresh' && !user)) {
            if (path === '/api/member/me' && user) return ok(route, user);
            return route.fulfill({ status: 401, json: { success: false, message: '세션이 없습니다.' } });
        }
        if (path === '/api/chat/unread' || path === '/api/chat/my/unread') return ok(route, 0);
        if (path === '/api/chat/conversations' || path === '/api/chat/store-inbox') return ok(route, emptyPage);
        if (path === '/api/chat/support' || path === '/api/chat/support/open') return ok(route, supportThread);
        if (path === '/api/chat/intro/support') return ok(route, {
            configured: true, greeting: '서비스 이용에 관해 궁금한 점을 남겨주세요.',
            displayName: 'RESERVE 고객지원', items: [{ question: '예약 내역을 확인하고 싶어요', answer: null }],
        });
        if (path === '/api/chat/images/config') return ok(route, { enabled: false, maxBytes: 8 * 1024 * 1024 });
        if (/^\/api\/chat\/rooms\/\d+\/messages$/.test(path)) return ok(route, []);
        if (/^\/api\/chat\/rooms\/\d+\/read$/.test(path)) return ok(route, null);
        if (path === '/api/notices/highlights') return ok(route, []);
        return ok(route, emptyPage);
    });
}

async function pressWithoutClick(page, locator, assertion) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    try {
        await assertion();
    } finally {
        await page.mouse.move(0, 0);
        await page.mouse.up();
    }
}

async function tabTo(page, locator, maxTabs = 12) {
    for (let count = 0; count < maxTabs; count += 1) {
        await page.keyboard.press('Tab');
        if (await locator.evaluate(element => element === document.activeElement)) return;
    }
    throw new Error('Keyboard Tab did not reach the expected control');
}

test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
});

test('guest header separates neutral navigation hover from primary press and keyboard focus', async ({ page, isMobile }) => {
    await mockApi(page);
    await page.goto('/');
    const search = page.getByRole('link', { name: '가게·지역·서비스 검색' });
    const login = page.getByRole('button', { name: '로그인', exact: true });
    const start = page.getByRole('button', { name: '시작하기' });
    await expect(search).toBeVisible();
    await expect(login).toBeVisible();
    await expect(start).toBeVisible();

    if (!isMobile) {
        await search.hover();
        await expect(search).toHaveCSS('background-color', 'rgb(249, 250, 251)');
        await expect(search).toHaveCSS('transform', 'none');
        await start.hover();
        await expect(start).toHaveCSS('opacity', '0.9');
        await pressWithoutClick(page, start, async () => {
            await expect(start).toHaveCSS('transform', 'matrix(0.96, 0, 0, 0.96, 0, 0)');
        });
    }

    await page.goto('/');
    await tabTo(page, search);
    await expect(search).toHaveCSS('outline-color', 'rgb(78, 89, 104)');
    await expect(search).toHaveCSS('outline-width', '2px');
    expect(await search.evaluate(element => element.matches(':focus-visible'))).toBe(true);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await pressWithoutClick(page, start, async () => {
        await expect(start).toHaveCSS('transform', 'none');
    });
});

test('contextual header back stays beside RESERVE on desktop and mobile', async ({ page }) => {
    await mockApi(page);
    await page.goto('/login');

    const back = page.getByRole('button', { name: '이전 화면으로 돌아가기' });
    const logo = page.getByRole('link', { name: 'RESERVE 홈' });
    await expect(back).toBeVisible();
    await expect(logo).toBeVisible();

    const positions = await page.locator('.reserve-header-brand').evaluate((brand) => {
        const backBox = brand.querySelector('.reserve-header-back')?.getBoundingClientRect();
        const logoBox = brand.querySelector('.reserve-header-logo')?.getBoundingClientRect();
        return { backBox, logoBox };
    });
    expect(positions.backBox).not.toBeNull();
    expect(positions.logoBox).not.toBeNull();
    expect(positions.logoBox.left - positions.backBox.right).toBe(4);
});

test('messenger uses neutral controls, a clear composer focus, and reduced press motion', async ({ page, isMobile }) => {
    await mockApi(page, account);
    await page.goto('/');
    const launcher = page.getByRole('button', { name: '메시지 열기' });
    await expect(launcher).toBeVisible();
    await launcher.click();
    const homeAction = page.getByRole('button', { name: /고객지원에 문의/ });
    await expect(homeAction).toBeVisible();

    if (!isMobile) {
        const close = page.getByRole('button', { name: '메시지 닫기' }).first();
        await close.hover();
        await expect(close).toHaveCSS('background-color', 'rgb(242, 244, 246)');
        await expect(close).toHaveCSS('transform', 'none');
        await pressWithoutClick(page, close, async () => {
            await expect(close).toHaveCSS('opacity', '0.7');
            await expect(close).toHaveCSS('transform', 'none');
        });
        await pressWithoutClick(page, homeAction, async () => {
            await expect(homeAction).toHaveCSS('transform', 'matrix(0.98, 0, 0, 0.98, 0, 0)');
        });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await pressWithoutClick(page, homeAction, async () => {
        await expect(homeAction).toHaveCSS('transform', 'none');
    });
    await homeAction.click();

    const back = page.getByRole('button', { name: '대화 목록으로 돌아가기' });
    const question = page.locator('.reserve-messenger-support-question').first();
    const composer = page.locator('.reserve-chat-composer');
    const input = page.getByRole('textbox', { name: '메시지 입력' });
    await expect(back).toBeVisible();
    await expect(question).toBeVisible();
    await expect(question).toHaveText('예약 내역을 확인하고 싶어요');
    if (!isMobile) {
        await back.hover();
        await expect(back).toHaveCSS('background-color', 'rgb(249, 250, 251)');
        await expect(back).toHaveCSS('transform', 'none');
        await pressWithoutClick(page, back, async () => {
            await expect(back).toHaveCSS('opacity', '0.7');
            await expect(back).toHaveCSS('transform', 'none');
        });
        await question.hover();
        await expect(question).toHaveCSS('color', 'rgb(26, 31, 39)');
        await expect(question).toHaveCSS('border-color', 'rgb(181, 184, 189)');
    }
    await input.click();
    await expect(composer).toHaveCSS('border-color', 'rgb(139, 149, 161)');
    await expect(composer).toHaveCSS('box-shadow', 'none');
    await input.fill('브라우저 상호작용 검사 초안');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '이모지 선택' })).toBeFocused();
    await page.keyboard.press('Tab');
    const send = page.getByRole('button', { name: '보내기' });
    await expect(send).toBeFocused();
    await expect(send).toHaveCSS('outline-color', 'rgb(78, 89, 104)');
    await expect(send).toHaveCSS('outline-width', '2px');
    expect(await send.evaluate(element => element.matches(':focus-visible'))).toBe(true);
    await pressWithoutClick(page, send, async () => {
        await expect(send).toHaveCSS('transform', 'none');
    });
});
