import { expect, test } from '@playwright/test';

const account = { id: 41, name: 'UI 검사 회원', email: 'ui-check@example.test', role: 'BUSINESS', termsAgreed: true, profileImageUrl: 'https://reserve-image.test/profile.svg' };
const store = {
    id: 81, name: '관심 가게', category: '카페', description: '사진과 예약 안내 확인', ownerId: 41,
    mainImageUrl: 'https://reserve-image.test/first.svg', mainImageWidth: 800, mainImageHeight: 450,
    detailImageUrls: ['https://reserve-image.test/first.svg', 'https://reserve-image.test/second.svg'],
    bookingType: 'TIME', reservationSlotMinutes: 30, openTime: '09:00', closeTime: '18:00', rating: 4.5, reviewCount: 12,
    noShowDeposit: 10000, fullRefundDays: 3, partialRefundDays: 1, partialRefundRate: 50,
    bookingDeadlineHours: 1, paymentTimeoutMinutes: 10, maxCapacityPerSlot: 2,
};
const favorite = { id: 51, storeId: store.id, storeName: store.name, storeCategory: store.category, storeMainImageUrl: store.mainImageUrl, storeRating: store.rating, storeReviewCount: store.reviewCount };
const emptyPage = { content: [], page: { number: 0, totalElements: 0, totalPages: 0 } };
const ok = (route, data) => route.fulfill({ json: { success: true, data } });

async function mockUiApi(page, initialRead = {}) {
    const requests = { favorites: 0, writes: 0 };
    let releaseRefresh;
    const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
    await page.route('https://reserve-image.test/*.svg', route => route.fulfill({
        contentType: 'image/svg+xml',
        body: route.request().url().includes('profile')
            ? '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360"><rect width="240" height="360" fill="white"/><circle cx="120" cy="180" r="90" fill="#3182f6"/><circle cx="90" cy="160" r="12" fill="white"/><circle cx="150" cy="160" r="12" fill="white"/></svg>'
            : `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="${route.request().url().includes('first') ? '#3182f6' : '#e5a73b'}"/></svg>`,
    }));
    // 조회와 쓰기 요청을 모두 가로채 실제 계정·즐겨찾기·입장 상태를 변경하지 않는다.
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        if (route.request().method() !== 'GET') {
            requests.writes += 1;
            return route.fulfill({ status: 409, json: { success: false, message: 'UI 검사는 데이터를 변경하지 않습니다.' } });
        }
        if (path === initialRead.path) await initialRead.ready;
        if (path === '/api/auth/session') { return route.fulfill({ json: { success: true, data: { member: account, refreshPossible: false } } }); }
        if (path === '/api/member/me') return ok(route, account);
        if (path === '/api/favorites/my') {
            requests.favorites += 1;
            if (requests.favorites === 2) await refreshGate;
            return ok(route, [requests.favorites === 2 ? { ...favorite, storeName: '새 관심 가게' } : favorite]);
        }
        if (path.startsWith('/api/favorites/status/')) return ok(route, { isFavorite: true });
        if (path === '/api/stores/81') return ok(route, store);
        if (path === '/api/stores/my') return ok(route, [store]);
        if (path === '/api/chat/unread' || path === '/api/chat/my/unread') return ok(route, 0);
        if (path === '/api/chat/intro/support') return ok(route, { configured: false, displayName: 'RESERVE 고객지원', items: [] });
        if (path === '/api/chat/images/config') return ok(route, { enabled: false, maxBytes: 0 });
        if (path === '/api/chat/conversations' || path === '/api/chat/store-inbox' || path.startsWith('/api/reservations')) return ok(route, emptyPage);
        return ok(route, []);
    });
    return { requests, finishRefresh: () => releaseRefresh() };
}

async function theme(page, mode, colorScheme = 'light') {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addInitScript(value => {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem('reserve:theme', value);
    }, mode);
}

test('chat settings reuse the exact account profile crop and image request policy', async ({ page }, testInfo) => {
    const { requests } = await mockUiApi(page);
    await theme(page, 'dark');
    await page.goto('/my-page');
    const accountImage = page.getByRole('main').getByRole('img', { name: '프로필', exact: true });
    await expect(accountImage).toHaveJSProperty('naturalHeight', 360);
    const geometry = element => {
        const frame = element.parentElement.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        return {
            source: element.src, fit: styles.objectFit, position: styles.objectPosition,
            left: (box.left - frame.left) / frame.width, top: (box.top - frame.top) / frame.height,
            width: box.width / frame.width, height: box.height / frame.height,
            radius: getComputedStyle(element.parentElement).borderRadius,
        };
    };
    const accountGeometry = await accountImage.evaluate(geometry);
    await page.screenshot({ path: testInfo.outputPath('account-profile.png') });
    await page.goto('/messages');
    await page.getByRole('navigation', { name: '메신저 화면', exact: true }).getByRole('button', { name: '설정', exact: true }).click();
    const settingsImage = page.locator('.reserve-messenger-settings-avatar img');
    await expect(settingsImage).toHaveJSProperty('naturalHeight', 360);
    expect(await settingsImage.evaluate(geometry)).toEqual(accountGeometry);
    await expect(settingsImage).toHaveAttribute('referrerpolicy', 'no-referrer');
    await expect(settingsImage).toHaveAttribute('draggable', 'false');
    await page.screenshot({ path: testInfo.outputPath('chat-profile.png') });
    expect(requests.writes).toBe(0);
});

for (const [mode, scheme] of [['light', 'dark'], ['dark', 'light'], ['system', 'light'], ['system', 'dark']]) {
    test(`photo indicators stay fully white in ${mode}/${scheme}, before and after changing the photo`, async ({ page }) => {
        const { requests } = await mockUiApi(page);
        await theme(page, mode, scheme);
        await page.goto('/store/81');
        await expect(page.locator('.reserve-store-gallery img').first()).toHaveJSProperty('naturalWidth', 800);
        await expect(page.locator('html')).toHaveAttribute('data-theme', mode === 'system' ? scheme : mode);
        const indicators = page.locator('.reserve-carousel .slick-dots');
        for (let step = 0; step < 2; step += 1) {
            const active = indicators.locator('li.slick-active');
            await expect(active.locator('button')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
            await expect(active.locator('button')).toHaveCSS('height', '6px');
            await expect.poll(() => active.evaluate(element => getComputedStyle(element, '::after').display)).toBe('none');
            await expect(active.locator('button')).toHaveCSS('border-radius', '999px');
            await indicators.locator('li:not(.slick-active) button').click();
        }
        expect(requests.writes).toBe(0);
    });
}

test('favorites switch layouts without refetching and retain cached rows and view during refresh', async ({ page }) => {
    const mock = await mockUiApi(page);
    await theme(page, 'dark');
    await page.goto('/my-favorites?view=cards&utm_source=yes');
    await expect(page.locator('.rsv-fav-grid .reserve-store-card-shell')).toHaveCount(1);
    const toggle = page.getByRole('button', { name: '목록형 보기로 전환' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.reserve-store-list-rows .reserve-store-list-row')).toHaveCount(1);
    await expect(page.getByRole('link', { name: '관심 가게 상세 보기', exact: true })).toHaveAttribute('href', '/store/81');
    await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams))
        .toEqual({ view: 'list', utm_source: 'yes', kind: 'all' });
    expect(mock.requests.favorites).toBe(1);
    await expect(page.getByRole('button', { name: '사진형 보기로 전환' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('.rsv-fav-grid .reserve-store-card-shell')).toHaveCount(1);
    await page.goBack();
    await expect(page.locator('.reserve-store-list-rows .reserve-store-list-row')).toHaveCount(1);
    expect(mock.requests.favorites).toBe(1);
    const row = page.locator('.reserve-store-list-rows .reserve-store-list-row');
    const retainedRow = await row.elementHandle();
    const container = page.locator('.ant-layout-content > .reserve-page-container');
    const refresh = page.getByRole('button', { name: '새로고침', exact: true });
    await refresh.click();
    await expect.poll(() => mock.requests.favorites).toBe(2);
    await expect(container).toHaveAttribute('aria-busy', 'true');
    await expect(refresh).toHaveAttribute('aria-busy', 'true');
    await expect(refresh).toBeDisabled();
    await expect(row).toHaveCount(1);
    expect(await row.evaluate((current, original) => current === original, retainedRow)).toBe(true);
    await expect(page.locator('.reserve-store-list-row-skeleton')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '관심 가게 상세 보기', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '사진형 보기로 전환' })).toBeEnabled();
    await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams))
        .toEqual({ view: 'list', utm_source: 'yes', kind: 'all' });
    mock.finishRefresh();
    await expect(container).toHaveAttribute('aria-busy', 'false');
    await expect(refresh).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('link', { name: '새 관심 가게 상세 보기', exact: true })).toBeVisible();
    expect(await row.evaluate((current, original) => current === original, retainedRow)).toBe(true);
    await expect(page.getByRole('button', { name: '사진형 보기로 전환' })).toBeEnabled();
    expect(mock.requests.writes).toBe(0);
});

test('an empty favorites cache shows only the refresh error and can recover without changing the view', async ({ page }, testInfo) => {
    const { requests } = await mockUiApi(page);
    let reads = 0;
    let recovering = false;
    let releaseRefresh;
    const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
    await page.route(/\/api\/favorites\/my(?:\?|$)/, async route => {
        reads += 1;
        if (reads === 1 || recovering) return ok(route, []);
        await refreshGate;
        return route.fulfill({ status: 503, json: { success: false, message: 'fixture backend unavailable' } });
    });
    await theme(page, 'light');
    await page.goto('/my-favorites?view=list&utm_source=error-check');
    const empty = page.getByText('아직 즐겨찾기한 가게가 없어요.', { exact: true });
    await expect(empty).toBeVisible();
    const container = page.locator('.ant-layout-content > .reserve-page-container');
    await page.getByRole('button', { name: '새로고침', exact: true }).click();
    try {
        await expect(container).toHaveAttribute('aria-busy', 'true');
    } finally {
        releaseRefresh();
    }
    const section = page.getByRole('region', { name: '좋아요한 가게', exact: true });
    const error = section.getByRole('alert');
    await expect(error).toHaveCount(1);
    await expect(error).toContainText('서버에서 즐겨찾기 목록을 처리하지 못했어요. 잠시 후 다시 시도해주세요.');
    await expect(error).not.toHaveClass(/reserve-data-state--compact/);
    await expect(section.locator('.reserve-data-state')).toHaveCount(1);
    await expect(empty).toHaveCount(0);
    await expect(page.getByText('마음에 드는 가게를 즐겨찾기에 추가해보세요.', { exact: true })).toHaveCount(0);
    await expect(section.locator('.reserve-skeleton-block')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '사진형 보기로 전환' })).toBeEnabled();
    await expect(container).toHaveAttribute('aria-busy', 'false');
    await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams))
        .toEqual({ view: 'list', utm_source: 'error-check', kind: 'all' });
    await page.screenshot({ path: testInfo.outputPath('favorites-empty-refresh-error.png') });
    recovering = true;
    await error.getByRole('button', { name: '다시 불러오기', exact: true }).click();
    await expect(empty).toBeVisible();
    await expect(error).toHaveCount(0);
    await expect(container).toHaveAttribute('aria-busy', 'false');
    await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams))
        .toEqual({ view: 'list', utm_source: 'error-check', kind: 'all' });
    expect(requests.writes).toBe(0);
});

for (const [label, path, menu, destination] of [
    ['favorites', '/api/favorites/my', '즐겨찾기', '/my-favorites'],
    ['owned stores', '/api/stores/my', '내 가게 관리', '/my-stores'],
    ['reservations', '/api/reservations/my/page', '내 예약 확인', '/my-reservations'],
]) {
    test(`three-second ${label} loading keeps its geometry through one parent entry during SPA navigation`, async ({ page }) => {
        test.setTimeout(60_000);
        let releaseRead;
        const ready = new Promise(resolve => { releaseRead = resolve; });
        const { requests } = await mockUiApi(page, { path, ready });
        await theme(page, 'light');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.goto('/store/81');
        await expect(page.locator('.reserve-store-gallery img').first()).toHaveJSProperty('naturalWidth', 800);
        await page.getByRole('button', { name: '내 계정 메뉴 열기', exact: true }).click();
        await page.evaluate(targetPath => {
            window.__loadingFrames = [];
            window.__loadingPageEntries = [];
            document.addEventListener('animationstart', event => {
                if (location.pathname === targetPath && event.target.matches('.ant-layout-content')
                    && event.animationName.startsWith('reserve-discovery-page-from-')) window.__loadingPageEntries.push(event.animationName);
            });
            const sample = () => {
                const root = location.pathname === targetPath
                    ? Array.from(document.querySelectorAll('.ant-layout-content > .reserve-page-container:not(.reserve-route-skeleton)'))
                        .find(element => element.getBoundingClientRect().width > 0)
                    : null;
                if (root?.querySelector('.reserve-skeleton-block')) {
                    const box = root.getBoundingClientRect();
                    const parentBox = root.closest('.ant-layout-content').getBoundingClientRect();
                    const styles = getComputedStyle(root);
                    window.__loadingFrames.push({ x: box.x - parentBox.x, y: box.y - parentBox.y, animation: styles.animationName, transform: styles.transform });
                }
                window.__loadingRaf = requestAnimationFrame(sample);
            };
            window.__loadingRaf = requestAnimationFrame(sample);
        }, destination);
        try {
            await page.getByRole('menuitem', { name: new RegExp(menu) }).click();
            const root = page.locator('.ant-layout-content > .reserve-page-container:not(.reserve-route-skeleton)');
            await expect(root.locator('.reserve-skeleton-block').first()).toBeVisible();
            // API 응답을 보류해 골격 화면을 3초 동안 관찰한다.
            await page.waitForTimeout(3_000);
            const frames = await page.evaluate(() => {
                cancelAnimationFrame(window.__loadingRaf);
                return window.__loadingFrames;
            });
            expect(frames.length).toBeGreaterThan(20);
            expect(frames.every(frame => frame.animation === 'none' && frame.transform === 'none'), JSON.stringify(frames.slice(0, 16))).toBe(true);
            expect(Math.max(...frames.map(frame => frame.x)) - Math.min(...frames.map(frame => frame.x))).toBeLessThan(0.25);
            expect(Math.max(...frames.map(frame => frame.y)) - Math.min(...frames.map(frame => frame.y))).toBeLessThan(0.25);
        } finally {
            releaseRead();
            if (!page.isClosed()) await page.evaluate(() => cancelAnimationFrame(window.__loadingRaf));
        }
        await expect(page.locator('.ant-layout-content .reserve-skeleton-block')).toHaveCount(0);
        const entries = await page.evaluate(() => window.__loadingPageEntries);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatch(/^reserve-discovery-page-from-(?:right|left)$/);
        expect(requests.writes).toBe(0);
    });
}

test('normal photo corners and hover covers stay clipped during both directions and the infinite seam', async ({ page }) => {
    test.setTimeout(60_000);
    const { requests } = await mockUiApi(page);
    await theme(page, 'dark');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/store/81');
    const gallery = page.locator('.reserve-store-gallery');
    await expect(gallery.locator('img').first()).toHaveJSProperty('naturalWidth', 800);
    await gallery.hover();
    const indicators = gallery.locator('.slick-dots');
    for (const [step, index] of [1, 0, 1, 'autoplay'].entries()) {
        const observation = gallery.evaluate(element => new Promise(resolve => {
            const track = element.querySelector('.slick-track');
            const inspect = () => {
                const moving = track.getAnimations().filter(animation => animation.playState === 'running' && animation.currentTime > 120);
                if (!moving.length) return requestAnimationFrame(inspect);
                moving.forEach(animation => animation.pause());
                const bounds = element.getBoundingClientRect();
                resolve(Array.from(element.querySelectorAll('.ant-image')).map(slide => {
                    const box = slide.getBoundingClientRect();
                    return {
                        clip: getComputedStyle(slide).clipPath, radius: getComputedStyle(slide).borderRadius,
                        visible: box.right > bounds.left + 2 && box.left < bounds.right - 2,
                    };
                }));
            };
            requestAnimationFrame(inspect);
        }));
        if (index === 'autoplay') await page.mouse.move(0, 0);
        else await indicators.locator('li button').nth(index).evaluate(button => button.click());
        // 실제 CSS 전환을 멈춰 중간 프레임을 측정한다.

        const frame = await observation;
        expect(frame.length).toBeGreaterThan(2);
        expect(frame.filter(slide => slide.visible).length).toBeGreaterThanOrEqual(2);
        expect(frame.every(slide => slide.clip === 'inset(0px round 16px)' && slide.radius === '16px')).toBe(true);
        await gallery.screenshot({ path: test.info().outputPath(`gallery-seam-${step}.png`) });
        await gallery.evaluate(element => element.querySelector('.slick-track').getAnimations().forEach(animation => animation.play()));
        await expect.poll(() => indicators.locator('li').evaluateAll(items => items.findIndex(item => item.classList.contains('slick-active')))).toBe(index === 'autoplay' ? 0 : index);
        await expect.poll(() => gallery.locator('.slick-track').evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
    }
    await gallery.locator('.slick-current .ant-image').click();
    const preview = page.locator('.ant-image-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.ant-image-preview-img')).toHaveCSS('clip-path', 'none');
    expect(requests.writes).toBe(0);
});

for (const motion of ['no-preference', 'reduce']) {
test(`QR sheet content stays unboxed and mock scanning stops and closes with ${motion} motion`, async ({ page }) => {
    const { requests } = await mockUiApi(page);
    // 개발용 스캐너만 대체하며 실제 카메라나 QR 해독은 사용하지 않는다.
    await page.route('**/node_modules/.vite/deps/html5-qrcode.js*', route => route.fulfill({
        contentType: 'application/javascript',
        body: `export class Html5Qrcode {
            constructor(id) { this.id = id; }
            async start(_camera, _config, _success, noCode) {
                const container = document.getElementById(this.id);
                const video = document.createElement('video');
                Object.defineProperties(video, { videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
                video.style.cssText = 'width:100%;height:100%;background:#23262b';
                container.replaceChildren(video);
                this.ticks = setInterval(noCode, 100);
            }
            async stop() { clearInterval(this.ticks); document.getElementById(this.id)?.replaceChildren(); }
            pause() {} resume() {}
        }`,
    }));
    await theme(page, 'dark');
    await page.emulateMedia({ reducedMotion: motion });
    await page.addInitScript(() => {
        window.__cameraRequests = 0;
        navigator.mediaDevices.getUserMedia = () => {
            window.__cameraRequests += 1;
            return Promise.reject(new Error('UI tests cannot access a real camera'));
        };
    });
    await page.goto('/business?tab=qr-checkin');
    const sheet = page.getByRole('dialog', { name: 'QR 체크인', exact: true });
    await expect(sheet).toBeVisible();
    const start = sheet.getByRole('button', { name: 'QR 스캔 시작', exact: true });
    await expect(start).toBeEnabled();
    const content = sheet.locator('.reserve-qr-scanner > div');
    await expect(content).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(content).toHaveCSS('border-radius', '0px');
    await expect(content).toHaveCSS('box-shadow', 'none');
    await start.click();
    const waiting = sheet.getByText('스캔 대기 중…', { exact: true });
    await expect(waiting).toBeVisible();
    await expect(waiting.locator('..')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(sheet.locator('.reserve-qr-scanning-dot')).toHaveCSS('background-color', 'rgb(50, 211, 101)');
    await sheet.getByRole('button', { name: '스캔 중지', exact: true }).click();
    await expect(start).toBeEnabled();
    await sheet.getByRole('button', { name: '닫기', exact: true }).filter({ hasText: /^닫기$/ }).click();
    await expect(sheet).toBeHidden();
    expect(await page.evaluate(() => window.__cameraRequests)).toBe(0);
    expect(requests.writes).toBe(0);
});
}
