import { expect, test } from '@playwright/test';

test.use({ contextOptions: { reducedMotion: 'no-preference' }, screenshot: 'off', trace: 'off', video: 'off' });

async function expectContentEntry(page, destination, direction, { cached = false } = {}) {
    const content = page.locator('.ant-layout-content');
    const skeletonShown = await content.getAttribute('data-skeleton-shown') === 'true';
    if (cached) expect(skeletonShown).toBe(false);
    await expect(content).toHaveCSS('animation-name', 'none');
    const entries = () => page.evaluate(() => window.__reservePageEntries.filter(entry => entry.pathname === location.pathname));
    if (skeletonShown) {
        await expect(content).not.toHaveClass(/reserve-route-entry--from-(right|left)/);
        await expect(destination).toHaveCSS('animation-name', 'none');
        expect(await entries()).toEqual([]);
    } else {
        // App clears the direction after 180ms; verify its actual CSS/class when the motion starts.
        await expect.poll(entries).toContainEqual(expect.objectContaining({
            animationName: `reserve-discovery-page-${direction}`,
            destinationAnimation: `reserve-discovery-page-${direction}`,
            contentAnimation: 'none',
            directionClass: `reserve-route-entry--${direction}`,
        }));
    }
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        window.__reservePageEntries = [];
        document.addEventListener('animationstart', event => {
            if (!event.animationName.startsWith('reserve-discovery-page-from-')) return;
            const content = event.target.closest('.ant-layout-content');
            if (content) window.__reservePageEntries.push({
                pathname: location.pathname,
                animationName: event.animationName,
                destinationAnimation: getComputedStyle(event.target).animationName,
                contentAnimation: getComputedStyle(content).animationName,
                directionClass: [...content.classList].find(name => name.startsWith('reserve-route-entry--')),
            });
        });
    });
    await page.route('**/api/member/me', route => route.fulfill({
        status: 401,
        json: { success: false, message: '인증이 필요합니다.' },
    }));
    await page.route('**/api/auth/refresh', route => route.fulfill({
        status: 401,
        json: { success: false, message: '세션이 없습니다.' },
    }));
    // Successful public data makes a return to Home use its real query cache.
    await page.route(/\/api\/stores\?/, route => route.fulfill({
        json: { success: true, data: { content: [], page: { totalElements: 0, totalPages: 0 } } },
    }));
});

test('top tabs move only their content in the selected direction, including browser back', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('.reserve-header-inner');
    const tabs = page.locator('.reserve-discovery-top-nav');
    const waitingTab = page.getByRole('link', { name: '웨이팅', exact: true });
    const feedTab = page.getByRole('link', { name: '피드', exact: true });
    await expect(page.locator('.reserve-boot-shell')).toHaveCount(0);
    await expect(page.locator('.ant-layout-content > .reserve-discovery-home')).toBeVisible();
    await expect(header).toBeVisible();
    await expect(tabs).toBeVisible();
    const initialHeader = await header.boundingBox();
    const initialTabs = await tabs.boundingBox();
    for (const line of await page.locator('.reserve-discovery-banner--current .reserve-discovery-banner-copy > *').all()) {
        await expect(line).toHaveCSS('animation-name', 'none');
    }

    await waitingTab.click();
    await expect(waitingTab).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: '웨이팅은 아직 준비 중이에요' })).toBeVisible();
    const destination = page.locator('.ant-layout-content > .reserve-discovery-coming-soon');
    await expectContentEntry(page, destination, 'from-right');
    await expect(header).toHaveCSS('animation-name', 'none');
    await expect(tabs).toHaveCSS('animation-name', 'none');

    await feedTab.click();
    await expect(feedTab).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: '새로운 이야기를 준비하고 있어요' })).toBeVisible();
    await expectContentEntry(page, destination, 'from-right', { cached: true });
    await page.goBack();
    await expect(waitingTab).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: '웨이팅은 아직 준비 중이에요' })).toBeVisible();
    await expectContentEntry(page, destination, 'from-left', { cached: true });
    await expect(destination).toHaveCSS('transform', 'none');
    expect(await header.boundingBox()).toEqual(initialHeader);
    expect(await tabs.boundingBox()).toEqual(initialTabs);
});

test('the header logo stays still and only the home page slides in from outside the tabs', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('아직 추천할 가게가 없습니다.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '서비스 이용약관', exact: true }).click();
    await expect(page.getByRole('heading', { name: '서비스 이용약관', exact: true })).toBeVisible();
    const logo = page.getByRole('link', { name: 'RESERVE 홈' });
    await logo.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(logo).not.toHaveClass(/reserve-header-logo--home-motion/);
    await expect(logo).toHaveCSS('animation-name', 'none');
    await expectContentEntry(page, page.locator('.reserve-discovery-home'), 'from-left', { cached: true });
});

test('rapid header back presses produce one collapse and one history move', async ({ page }) => {
    await page.addInitScript(() => {
        const go = window.history.go.bind(window.history);
        // 실제 비동기 POP의 커밋 대기를 늘려 빠른 입력 경쟁을 결정적으로 검사한다.
        window.history.go = delta => window.setTimeout(() => go(delta), 120);
    });
    await page.goto('/');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
    const back = page.getByRole('button', { name: '이전 화면으로 돌아가기' });
    const skeletonShown = await page.locator('.reserve-header').getAttribute('data-skeleton-shown') === 'true';
    await expect(back).toHaveCSS('animation-name', skeletonShown ? 'none' : 'reserve-header-back-enter');
    await page.evaluate(async () => {
        const button = document.querySelector('.reserve-header-back');
        await Promise.all(button.getAnimations().map(animation => animation.finished));
        window.__reserveHeaderBackAnimations = [];
        document.addEventListener('animationstart', event => {
            if (event.target.classList.contains('reserve-header-back')) {
                window.__reserveHeaderBackAnimations.push(event.animationName);
            }
        });
        // DOM click을 연달아 보내 React/POP 커밋 사이의 입력도 재현한다.
        button.click();
        button.click();
        setTimeout(() => button.click(), 185);
    });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.reserve-header-back')).toHaveCount(0);
    expect(await page.evaluate(() => window.__reserveHeaderBackAnimations)).toEqual(['reserve-header-back-leave']);
    await page.goForward();
    await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '이전 화면으로 돌아가기' })).toBeEnabled();
});

test('ordinary routes and the password return use the same content-only directions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('아직 추천할 가게가 없습니다.', { exact: true })).toBeVisible();
    const content = page.locator('.ant-layout-content');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
    await expectContentEntry(page, content.locator(':scope > div').first(), 'from-right');
    await expect(page.locator('.reserve-header-inner')).toHaveCSS('animation-name', 'none');

    await page.getByRole('button', { name: '이전 화면으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expectContentEntry(page, page.locator('.reserve-discovery-home'), 'from-left', { cached: true });

    await page.goto('/login');
    await page.getByRole('button', { name: '비밀번호를 잊으셨나요?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { name: '비밀번호 찾기', exact: true })).toBeVisible();
    await expectContentEntry(page, content.locator(':scope > div').first(), 'from-right');
    await page.getByRole('button', { name: '로그인으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expectContentEntry(page, content.locator(':scope > div').first(), 'from-left', { cached: true });
});

test('top tab switch is immediate with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.reserve-boot-shell')).toHaveCount(0);
    await expect(page.locator('.ant-layout-content > .reserve-discovery-home')).toBeVisible();
    await page.getByRole('link', { name: '웨이팅', exact: true }).click();
    await expect(page.getByRole('heading', { name: '웨이팅은 아직 준비 중이에요' })).toBeVisible();
    await page.getByRole('link', { name: '피드', exact: true }).click();
    await expect(page.getByRole('heading', { name: '새로운 이야기를 준비하고 있어요' })).toBeVisible();
    const content = page.locator('.ant-layout-content');
    await expect(content).not.toHaveAttribute('data-skeleton-shown', 'true');
    await expect(content).toHaveClass(/reserve-route-entry--from-right/);
    await expect(content).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.reserve-discovery-coming-soon')).toHaveCSS('animation-name', 'none');
});

test('a slow lazy tab stays still through the visible skeleton and the resolved page', async ({ page }) => {
    let lazyModuleRequested = false;
    let releaseLazyModule;
    const lazyModuleGate = new Promise(resolve => {
        releaseLazyModule = resolve;
    });
    await page.route('**/src/pages/discovery/ComingSoon.jsx*', async route => {
        lazyModuleRequested = true;
        await lazyModuleGate;
        await route.continue();
    });
    await page.goto('/');
    const home = page.locator('.ant-layout-content > .reserve-discovery-home');
    const waitingTab = page.getByRole('link', { name: '웨이팅', exact: true });
    const skeleton = page.locator('.reserve-route-skeleton');
    await expect(page.locator('.reserve-boot-shell')).toHaveCount(0);
    await expect(home).toBeVisible();

    try {
        // Playwright의 click 완료 대기는 lazy import가 풀릴 때까지 밀릴 수 있다.
        // React Link의 이벤트만 동기적으로 dispatch해 fallback이 남아 있는 순간을 읽는다.
        await waitingTab.evaluate(link => link.click());
        await expect.poll(() => lazyModuleRequested).toBe(true);
        await expect(page).toHaveURL(/\/waiting$/);
        await expect(waitingTab).toHaveAttribute('aria-current', 'page');
        await expect(home).toBeHidden();
        await expect(skeleton).toBeVisible();
        await expect(skeleton).toHaveCSS('animation-name', 'none');
        await expect(page.locator('.ant-layout-content')).toHaveAttribute('data-skeleton-shown', 'true');
    } finally {
        releaseLazyModule();
    }

    await expect(page.getByRole('heading', { name: '웨이팅은 아직 준비 중이에요' })).toBeVisible();
    await expect(page.locator('.ant-layout-content')).toHaveAttribute('data-skeleton-shown', 'true');
    await expectContentEntry(page, page.locator('.ant-layout-content > .reserve-discovery-coming-soon'), 'from-right');
});
