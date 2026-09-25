import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    page.on('pageerror', (error) => console.error(`[browser error] ${error.message}`));
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });
});

const user = {
    id: 1,
    name: '테스트 사용자',
    email: 'user@example.com',
    role: 'USER',
    termsAgreed: true,
};

const admin = {
    ...user,
    name: '테스트 관리자',
    email: 'admin@example.com',
    role: 'ADMIN',
};

const business = {
    ...user,
    name: '테스트 사업자',
    email: 'owner@example.com',
    role: 'BUSINESS',
};

const emptyPage = {
    content: [],
    page: {
        size: 10,
        number: 0,
        totalElements: 0,
        totalPages: 0,
    },
};

const ok = (route, data) => route.fulfill({
    json: { success: true, data },
});

async function mockApi(page, authenticatedUser = null) {
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        // Vite 개발 모듈인 /src/api/axios.js도 넓은 glob에는 잡힌다.
        // 실제 백엔드 요청만 가로채고 프론트 모듈은 반드시 그대로 통과시킨다.
        if (!url.pathname.startsWith('/api/')) {
            await route.continue();
            return;
        }

        if (url.pathname === '/api/member/me') {
            if (!authenticatedUser) {
                await route.fulfill({
                    status: 401,
                    json: { success: false, message: '인증이 필요합니다.' },
                });
                return;
            }
            await ok(route, authenticatedUser);
            return;
        }

        if (url.pathname === '/api/auth/refresh' && !authenticatedUser) {
            await route.fulfill({
                status: 401,
                json: { success: false, message: '세션이 없습니다.' },
            });
            return;
        }

        if (url.pathname === '/api/auth/login' && request.method() === 'POST') {
            await ok(route, user);
            return;
        }

        if (url.pathname === '/api/reservations/my') {
            await ok(route, []);
            return;
        }

        if (url.pathname.endsWith('/waiting-count') || url.pathname === '/api/chat/my/unread') {
            await ok(route, 0);
            return;
        }

        await ok(route, emptyPage);
    });
}

test('authentication: protected route returns to its destination after login', async ({ page }) => {
    await mockApi(page);
    await page.goto('/my-reservations');

    await expect(page).toHaveURL(/\/login$/);
    await page.getByPlaceholder('이메일 주소').fill('user@example.com');
    await page.getByPlaceholder('비밀번호').fill('correct-password');
    await page.getByRole('main').getByRole('button', { name: '로그인', exact: true }).click();

    await expect(page).toHaveURL(/\/my-reservations$/);
    await expect(page.getByRole('heading', { name: '내 예약 확인' })).toBeVisible();
    await expect(page.getByRole('button', { name: '내 계정 메뉴 열기' })).toBeVisible();
});

test('reservation: authenticated user can open the empty reservation list', async ({ page }) => {
    await mockApi(page, user);
    await page.goto('/my-reservations');

    await expect(page.getByRole('heading', { name: '내 예약 확인' })).toBeVisible();
    await expect(page.getByText('예약 내역이 없습니다.')).toBeVisible();
});

test('payment: server record confirms a reservation payment', async ({ page }) => {
    await mockApi(page, user);
    await page.route('**/api/payment/status?**', route => ok(route, {
        type: 'reservation', merchantUid: 'smoke-payment', status: 'PAID', amount: 1000,
    }));
    await page.goto('/payment/result?success=true&merchant_uid=smoke-payment');

    await expect(page.getByText('결제 완료', { exact: true })).toBeVisible();
    await expect(page.getByText('예약금이 정상적으로 결제되었습니다.')).toBeVisible();
    await expect(page.getByText('smoke-payment')).toBeVisible();
});

test('admin: admin role can open server-paginated verification and payment operations', async ({ page }, testInfo) => {
    await mockApi(page, admin);
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: '관리자 패널' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /대기 중/ })).toHaveAttribute('aria-selected', 'true');

    if (testInfo.project.name === 'mobile-chromium') {
        await page.getByRole('button', { name: 'ellipsis' }).click();
        await page.getByRole('option', { name: /결제 운영/ }).click();
    } else {
        await page.getByRole('tab', { name: /결제 운영/ }).click();
    }
    await expect(page.getByRole('radio', { name: '오래된 READY' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('처리할 항목이 없습니다.')).toBeVisible();
});

test('QR: business user sees attendance semantics before enabling the camera', async ({ page }) => {
    await mockApi(page, business);
    await page.goto('/business');

    await expect(page.getByRole('heading', { name: '사업자 파트너 패널' })).toBeVisible();
    await page.getByRole('tab', { name: /QR 체크인/ }).click();
    await expect(page.getByText('승인된 예약의 QR을 비추면 방문 시각이 기록됩니다.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'QR 스캔 시작' })).toBeVisible();
});

test('accessibility: guest header has keyboard focus and inquiry loads on demand', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    expect(await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )).toBe(true);

    const heroHeading = page.getByRole('heading', { level: 1 }).first();
    await expect(heroHeading).toContainText('버튼 클릭 한 번으로');
    const reducedMotionText = await heroHeading.textContent();
    await page.waitForTimeout(1_200);
    expect(await heroHeading.textContent()).toBe(reducedMotionText);

    const logo = page.getByRole('link', { name: 'RESERVE', exact: true });
    const login = page.getByRole('button', { name: '로그인', exact: true });
    await logo.focus();
    await page.keyboard.press('Tab');
    await expect(login).toBeFocused();

    const focusStyle = await login.evaluate((element) => {
        const style = getComputedStyle(element);
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focusStyle.outlineStyle).not.toBe('none');
    expect(focusStyle.outlineWidth).not.toBe('0px');

    const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    const inquiry = page.getByRole('button', { name: '문의하기' });
    await inquiry.scrollIntoViewIfNeeded();
    await inquiry.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('문의 유형')).toBeVisible();
});

test('chat: close motion avoids a translucent ghost and still unmounts with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockApi(page, user);
    await page.goto('/');

    const launcher = page.locator('.reserve-chat-launcher');
    await expect(launcher).toHaveAttribute('aria-label', '문의하기');
    await launcher.click();

    const panel = page.locator('.reserve-chat-panel');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: '닫기' }).click();
    await expect(panel).toHaveClass(/is-closing/);

    const closingFrames = await panel.evaluate((element) => {
        const animation = element.getAnimations()[0];
        if (!animation) throw new Error('채팅 닫힘 애니메이션을 찾지 못했습니다.');

        animation.pause();
        const duration = Number(animation.effect.getComputedTiming().duration);
        animation.currentTime = duration * 0.58;
        const middleStyle = getComputedStyle(element);
        const middle = {
            opacity: Number(middleStyle.opacity),
            pointerEvents: middleStyle.pointerEvents,
            visibility: middleStyle.visibility,
        };

        animation.currentTime = duration;
        const finalStyle = getComputedStyle(element);
        const final = {
            opacity: Number(finalStyle.opacity),
            visibility: finalStyle.visibility,
        };

        return { duration, middle, final };
    });

    expect(closingFrames.duration).toBe(120);
    expect(closingFrames.middle.opacity).toBeGreaterThanOrEqual(0.99);
    expect(closingFrames.middle.pointerEvents).toBe('none');
    expect(closingFrames.middle.visibility).toBe('visible');
    expect(closingFrames.final.opacity).toBe(0);
    expect(closingFrames.final.visibility).toBe('hidden');

    await expect(panel).toHaveCount(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await launcher.click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: '닫기' }).click();
    await expect(panel).toHaveCount(0);
});
