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

        if (authenticatedUser?.role === 'BUSINESS' && url.pathname === '/api/stores/my') {
            await ok(route, [{ id: 7, name: 'RESERVE', status: 'ACTIVE' }]);
            return;
        }

        if (authenticatedUser?.role === 'BUSINESS' && url.pathname === '/api/stores/7/statistics') {
            await ok(route, {
                averageRating: 0,
                reviewCount: 0,
                totalDepositRevenue: 0,
                reservationTrend: [],
                statusBreakdown: {},
                revenueTrend: [],
                adSummary: null,
            });
            return;
        }

        if (url.pathname.endsWith('/waiting-count')
            || url.pathname === '/api/chat/my/unread'
            || url.pathname === '/api/chat/unread') {
            await ok(route, 0);
            return;
        }

        if (url.pathname === '/api/notices/highlights') {
            await ok(route, []);
            return;
        }

        if (/^\/api\/chat\/rooms\/\d+\/messages$/.test(url.pathname)) {
            await ok(route, []);
            return;
        }

        if (/^\/api\/chat\/rooms\/\d+\/read$/.test(url.pathname)) {
            await ok(route, null);
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

    await expect.poll(() => new URL(page.url()).pathname).toBe('/my-reservations');
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
    await expect(page.getByText('예약금 결제를 확인했습니다.')).toBeVisible();
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
        const paymentTab = page.getByRole('tab', { name: /결제 운영/ });
        await paymentTab.focus();
        await paymentTab.press('Enter');
        await expect(paymentTab).toHaveAttribute('aria-selected', 'true');
    }
    await expect(page.getByRole('radio', { name: '오래된 READY' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('처리할 항목이 없습니다.')).toBeVisible();
});

test('QR: business user sees attendance semantics before enabling the camera', async ({ page }, testInfo) => {
    await mockApi(page, business);
    await page.goto('/business');

    await expect(page.getByRole('heading', { name: '사업자 파트너 패널' })).toBeVisible();
    await page.getByRole('tab', { name: /QR 체크인/ }).click();
    const dialog = page.getByRole('dialog', { name: 'QR 체크인' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.ant-modal-container')).toHaveCSS(
        'border-radius',
        testInfo.project.name.includes('mobile') ? '24px 24px 0px 0px' : '24px',
    );
    await expect(page.getByRole('status', { name: 'QR 스캐너를 준비하는 중' })).toBeVisible();
    await expect(page.getByText('승인된 예약의 QR을 비추면 방문 시각이 기록됩니다.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'QR 스캔 시작' })).toBeVisible();
});

test('business ads and analytics: shared toolbars fit desktop and mobile without horizontal overflow', async ({ page, isMobile }) => {
    await mockApi(page, business);

    const expectToolbarToFit = async (toolbar) => {
        await expect(toolbar).toBeVisible();
        const bounds = await toolbar.evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            right: element.getBoundingClientRect().right,
            viewportWidth: document.documentElement.clientWidth,
        }));
        expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
        expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 1);
    };

    await page.goto('/business?tab=ads');
    await expect(page.getByRole('button', { name: '광고 가게 필터' })).toBeEnabled();
    await expect(page.getByPlaceholder('가게명으로 검색')).toBeEnabled();
    await expectToolbarToFit(page.locator('.reserve-ad-manage-primary-row'));
    await expectToolbarToFit(page.locator('.reserve-ad-manage-tab .reserve-filter-toolbar-secondary'));

    await page.goto('/business?tab=analytics');

    const storeFilter = page.getByRole('button', { name: '통계 가게 필터' });
    await expect(storeFilter).toBeEnabled();
    await expect(page.getByRole('radio', { name: '30일' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: '새로고침' })).toBeEnabled();
    await expectToolbarToFit(page.locator('.reserve-statistics-tab .reserve-filter-toolbar-primary'));

    // 사업자 통계 PC만 기간/새로고침을 하나의 오른쪽 묶음으로 둔다.
    // 모바일은 좁은 행의 기존 순서를 그대로 두고, 위의 overflow 검사만 적용한다.
    if (!isMobile) {
        const positions = await page.locator('.reserve-statistics-tab .reserve-filter-toolbar-primary').evaluate((toolbar) => {
            const box = (selector) => toolbar.querySelector(selector)?.getBoundingClientRect();
            const store = box('.reserve-filter-menu--plain');
            const range = box('.reserve-filter-toolbar-extra');
            const refresh = box('.reserve-filter-toolbar-refresh');
            return { store, range, refresh };
        });
        expect(positions.store).not.toBeNull();
        expect(positions.range).not.toBeNull();
        expect(positions.refresh).not.toBeNull();
        expect(positions.range.left).toBeGreaterThan(positions.store.right);
        expect(positions.refresh.left - positions.range.right).toBeLessThanOrEqual(16);
    }
});

test('business analytics: refresh stays in place while the first store list loads', async ({ page }) => {
    await mockApi(page, business);

    let releaseStores;
    const storesPending = new Promise((resolve) => { releaseStores = resolve; });
    await page.route('**/api/stores/my', async (route) => {
        await storesPending;
        await ok(route, [{ id: 7, name: 'RESERVE', status: 'ACTIVE' }]);
    });

    const navigation = page.goto('/business?tab=analytics');
    const refresh = page.getByRole('button', { name: '새로고침' });

    await expect(refresh).toBeVisible();
    await expect(refresh).toBeDisabled();

    releaseStores();
    await navigation;
    await expect(page.getByRole('button', { name: '통계 가게 필터' })).toBeEnabled();
    await expect(refresh).toBeEnabled();
});

test('analytics: opening a source-data table does not stretch its neighboring chart card', async ({ page }) => {
    await mockApi(page, business);
    await page.route('**/api/stores/7/statistics**', route => ok(route, {
        averageRating: 4.5,
        reviewCount: 2,
        totalDepositRevenue: 18000,
        reservationTrend: [{ date: '2026-09-01', value: 2 }, { date: '2026-09-02', value: 1 }],
        statusBreakdown: { CONFIRMED: 2, PENDING: 1 },
        revenueTrend: [{ date: '2026-09-01', value: 12000 }, { date: '2026-09-02', value: 6000 }],
        adSummary: null,
    }));
    await page.goto('/business?tab=analytics');

    const reservationCard = page.getByRole('region', { name: '예약 추이' });
    const statusCard = page.getByRole('region', { name: '상태별 분포' });
    await expect(reservationCard.getByText('데이터 표 보기')).toBeVisible();
    const before = await statusCard.boundingBox();
    expect(before).not.toBeNull();

    await reservationCard.getByText('데이터 표 보기').click();
    await expect(reservationCard.getByRole('table', { name: '예약 추이 원본 데이터' })).toBeVisible();
    const after = await statusCard.boundingBox();
    expect(after).not.toBeNull();
    expect(after?.height).toBe(before?.height);
    expect(after?.width).toBe(before?.width);
});

test('accessibility: guest header has keyboard focus and inquiry loads on demand', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');

    expect(await page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )).toBe(true);

    const heroHeading = page.getByRole('heading', { level: 1 }).first();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(heroHeading).toHaveAccessibleName('RESERVE — 가게를 찾고 예약하세요');
    await expect(heroHeading).toContainText('가게를 찾고 예약하세요');
    const reducedMotionText = await heroHeading.textContent();
    await page.waitForTimeout(1_200);
    expect(await heroHeading.textContent()).toBe(reducedMotionText);

    const logo = page.getByRole('link', { name: 'RESERVE 홈', exact: true });
    const search = page.getByRole('link', { name: '가게·지역·서비스 검색' });
    const login = page.getByRole('button', { name: '로그인', exact: true });
    await logo.focus();
    await page.keyboard.press('Tab');
    await expect(search).toBeFocused();
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

test('messenger: mobile route and desktop close motion follow their own shell', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockApi(page, user);
    await page.goto('/');

    if (testInfo.project.name === 'mobile-chromium') {
        await page.getByRole('link', { name: '메시지', exact: true }).click();
        await expect(page).toHaveURL(/\/messages$/);
        await expect(page.getByRole('heading', { level: 1, name: '메시지' })).toBeVisible();
        await expect(page.locator('.reserve-chat-launcher')).toHaveCount(0);
        return;
    }

    const launcher = page.locator('.reserve-chat-launcher');
    await expect(launcher).toHaveAttribute('aria-label', '메시지 열기');
    await launcher.click();

    const panel = page.locator('.reserve-chat-panel');
    await expect(panel).toBeVisible();
    const closingFrames = await panel.evaluate(async (element) => {
        element.querySelector('[aria-label="메시지 닫기"]')?.click();
        await new Promise(resolve => requestAnimationFrame(resolve));
        if (!element.classList.contains('is-closing')) {
            throw new Error('채팅 패널에 닫힘 상태가 적용되지 않았습니다.');
        }
        const animation = element.getAnimations()
            .find(item => item.animationName === 'reserve-chat-out');
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

        animation.currentTime = Math.max(0, duration - 1);
        animation.play();
        return { duration, middle, final };
    });

    expect(closingFrames.duration).toBe(260);
    expect(closingFrames.middle.opacity).toBeGreaterThan(closingFrames.final.opacity);
    expect(closingFrames.middle.pointerEvents).toBe('none');
    expect(closingFrames.middle.visibility).toBe('visible');
    expect(closingFrames.final.opacity).toBeLessThanOrEqual(0.1);
    expect(closingFrames.final.visibility).toBe('hidden');

    await expect(panel).toHaveCount(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await launcher.click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: '메시지 닫기' }).click();
    await expect(panel).toHaveCount(0);
});

test('messenger: every internal view keeps a close X and shared refresh feedback', async ({ page, isMobile }, testInfo) => {
    if (isMobile) await page.setViewportSize({ width: 320, height: 720 });
    await mockApi(page, user);
    await page.route('**/api/chat/conversations*', route => ok(route, {
        ...emptyPage,
        content: [{ roomId: 7, type: 'STORE', storeId: 7, storeName: '테스트 가게',
            counterpartName: '테스트 가게', viewerRole: 'MEMBER', unread: 0, lastMessagePreview: '안녕하세요' }],
    }));
    await page.route('**/api/chat/stores/7/open', route => ok(route, {
        roomId: 7, type: 'STORE', storeId: 7, title: '테스트 가게',
        viewerRole: 'MEMBER', canSend: true, messages: [],
    }));
    await page.goto('/');
    if (isMobile) await page.getByRole('link', { name: '메시지', exact: true }).click();
    else await page.locator('.reserve-chat-launcher').click();
    const surface = page.locator(isMobile ? '.reserve-messages-page' : '.reserve-chat-panel');
    const messenger = surface.locator('.reserve-messenger');
    const close = surface.getByRole('button', { name: '메시지 닫기', exact: true });
    const checkClose = async () => {
        await expect(close).toHaveCount(1);
        await expect(close).toBeVisible();
        await expect(close).toHaveCSS('width', '44px');
        await expect(close).toHaveCSS('height', '44px');
        await expect.poll(async () => (await close.boundingBox())?.width ?? 0).toBeCloseTo(44, 1);
        await expect.poll(async () => (await close.boundingBox())?.height ?? 0).toBeCloseTo(44, 1);
    };
    await checkClose();
    await surface.getByRole('button', { name: '설정', exact: true }).click();
    await expect(surface.getByRole('heading', { name: '설정', exact: true })).toBeVisible();
    await checkClose();
    await surface.getByRole('button', { name: '대화', exact: true }).click();
    await checkClose();
    const refresh = surface.getByRole('button', { name: '대화 목록 새로고침' });
    await expect(refresh).not.toHaveAttribute('aria-busy', 'true');
    await expect(refresh.locator('.anticon-sync')).toHaveCount(1);
    const refreshBox = await refresh.boundingBox();
    expect(refreshBox.x + refreshBox.width).toBeLessThanOrEqual((await close.boundingBox()).x);
    await refresh.click();
    await expect(refresh).not.toHaveAttribute('aria-busy', 'true');
    await expect(refresh).toHaveAttribute('aria-disabled', 'true');
    await expect(refresh.locator('.anticon-sync')).not.toHaveClass(/anticon-spin/);
    await surface.getByRole('button', { name: /테스트 가게/ }).click();
    await expect(messenger).toHaveClass(/has-thread/);
    await expect(messenger).not.toHaveClass(/is-opening-thread/);
    await checkClose();
    const manageBox = await surface.getByRole('button', { name: '대화 관리', exact: true }).boundingBox();
    expect(manageBox.x + manageBox.width).toBeLessThanOrEqual((await close.boundingBox()).x);
    await page.screenshot({ path: testInfo.outputPath('messenger-close-controls.png') });
    await surface.getByRole('button', { name: '대화 목록으로 돌아가기' }).click();
    await expect(messenger).not.toHaveClass(/has-thread/);
    await checkClose();
    await close.click();
    if (isMobile) await expect(page).toHaveURL(/\/$/);
    else await expect(surface).toHaveCount(0);
});

test('messenger: message actions, private photo preview and motion settle without a list ghost', async ({ page, isMobile }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockApi(page, user);
    await page.route('**/api/chat/conversations*', route => ok(route, { ...emptyPage, content: [{ roomId: 7,
        type: 'STORE', storeId: 7, storeName: '합성 가게', counterpartName: '합성 가게', viewerRole: 'MEMBER', unread: 0 }] }));
    await page.route('**/api/chat/stores/7/open', route => ok(route, { roomId: 7, type: 'STORE', storeId: 7,
        title: '합성 가게', viewerRole: 'MEMBER', canSend: true, messages: [
            { id: 1, senderRole: 'MEMBER', content: '합성 메시지', canRetract: true },
            { id: 2, senderRole: 'OWNER', content: '전송이 취소된 메시지입니다.', retracted: true },
            { id: 3, senderRole: 'OWNER', content: '', imageUrl: '/api/chat/images/3', imageWidth: 1, imageHeight: 1 },
        ] }));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=', 'base64');
    await page.route('**/api/chat/images/config', route => ok(route, { enabled: true }));
    await page.route('**/api/chat/images/3', route => route.fulfill({ contentType: 'image/png', body: png }));
    await page.goto('/');
    if (isMobile) await page.getByRole('link', { name: '메시지', exact: true }).click();
    else await page.locator('.reserve-chat-launcher').click();
    const surface = page.locator(isMobile ? '.reserve-messages-page' : '.reserve-chat-panel');
    await surface.getByRole('button', { name: '대화', exact: true }).click();
    const frames = await surface.evaluate(async element => {
        element.querySelector('.reserve-messenger-row')?.click();
        const samples = [];
        const start = performance.now();
        while (performance.now() - start < 420) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const thread = element.querySelector('.reserve-messenger-thread');
            const list = element.querySelector('.reserve-messenger-list');
            if (thread) samples.push({ time: performance.now() - start, x: thread.getBoundingClientRect().x,
                opacity: Number(getComputedStyle(thread).opacity), opening: element.querySelector('.reserve-messenger').classList.contains('is-opening-thread'),
                listOpacity: list ? Number(getComputedStyle(list).opacity) : 0 });
        }
        return samples;
    });
    const settled = frames.filter(frame => !frame.opening);
    expect(settled.length).toBeGreaterThan(1);
    expect(settled.every(frame => frame.opacity === 1 && frame.listOpacity === 0)).toBe(true);
    expect(Math.max(...settled.map(frame => frame.x)) - Math.min(...settled.map(frame => frame.x))).toBeLessThan(1);
    const incomingTail = frames.filter(frame => frame.opening && frame.time > 220);
    expect(incomingTail.every(frame => frame.listOpacity < 0.05)).toBe(true);
    const own = surface.locator('.reserve-chat-message-row').first();
    if (!isMobile) {
        await surface.locator('.reserve-messenger-thread-heading').hover();
        await expect(own.getByRole('button', { name: '메시지 관리' })).toHaveCSS('opacity', '0');
        await own.hover();
    }
    const action = own.getByRole('button', { name: '메시지 관리' });
    await expect(action).toHaveCSS('opacity', '1');
    expect((await action.boundingBox()).x).toBeLessThan((await own.locator('.reserve-chat-bubble-group').boundingBox()).x);
    await surface.getByRole('button', { name: '사진 크게 보기' }).click();
    await expect(page.locator('.reserve-image-preview')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.reserve-image-preview')).toBeHidden();
    await expect(surface.locator('.reserve-messenger-thread')).toBeVisible();
    await surface.getByRole('button', { name: '이모지 선택', exact: true }).click();
    if (isMobile) await expect(page.getByRole('searchbox', { name: '이모지 검색' })).not.toBeFocused();
    await page.keyboard.press('Escape');
    await surface.getByLabel('첨부할 사진 선택').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    await surface.getByRole('button', { name: '첨부 사진 크게 보기' }).click();
    await expect(page.locator('.reserve-image-preview')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.reserve-image-preview')).toBeHidden();
    await expect(surface.locator('.reserve-messenger-thread')).toBeVisible();
    await expect(surface.getByRole('textbox', { name: '메시지 입력' })).toBeVisible();
    if (!isMobile) await expect(surface).not.toHaveClass(/is-closing/);
    await page.screenshot({ path: testInfo.outputPath('messenger-actions-preview.png') });
});

test('messenger: a direct messages URL stays mobile-only and hands desktop back to the panel', async ({ page }, testInfo) => {
    await mockApi(page, user);
    await page.goto('/messages');

    if (testInfo.project.name === 'mobile-chromium') {
        await expect(page).toHaveURL(/\/messages$/);
        await expect(page.getByRole('heading', { level: 1, name: '메시지' })).toBeVisible();
        await expect(page.locator('.reserve-chat-launcher')).toHaveCount(0);
        return;
    }

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.reserve-messages-route')).toHaveCount(0);
    await expect(page.locator('.reserve-chat-panel')).toBeVisible();
});

test('messenger: mobile thread back keeps the return animation before restoring the list', async ({ page }, testInfo) => {
    // 스레드 뒤로가기 전환은 모바일 레이아웃에만 있으므로 다른 프로젝트에서는 건너뛴다.
    test.skip(testInfo.project.name !== 'mobile-chromium', '모바일 전용 전환입니다.');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockApi(page, user);
    await page.route('**/api/chat/support', route => ok(route, {
        roomId: 1,
        type: 'SUPPORT',
        title: 'RESERVE 고객지원',
        viewerRole: 'MEMBER',
        canSend: true,
        messages: [],
    }));
    await page.goto('/messages');

    await page.getByRole('button', { name: '고객지원에 문의' }).click();
    const thread = page.locator('.reserve-messenger-thread').first();
    await expect(thread).toBeVisible();
    await page.getByRole('button', { name: '대화 목록으로 돌아가기' }).click();

    const messenger = page.locator('.reserve-messenger');
    await expect(messenger).toHaveClass(/is-returning-to-list/);
    await expect(page.getByRole('complementary', { name: '대화 목록' })).toBeVisible();
    const duration = await thread.evaluate(async (element) => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const animation = element.getAnimations()
            .find(item => item.animationName === 'reserve-messenger-thread-back-out');
        return animation ? Number(animation.effect.getComputedTiming().duration) : null;
    });
    expect(duration).toBe(260);
    await expect(thread).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '메신저 화면' })).toBeVisible();
});
