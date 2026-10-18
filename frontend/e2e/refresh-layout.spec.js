import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const user = { id: 41, email: 'ui@example.test', role: 'USER', termsAgreed: true };
const empty = { content: [], page: { totalElements: 0, totalPages: 0 } };
const cases = [
    ['/feed', '.reserve-feed-directory-tools', 'feed'],
    ['/waiting', '.reserve-explore-filters', 'waiting'],
    ['/stores', '.reserve-explore-filters', 'explore'],
    ['/my-favorites', '.reserve-filter-toolbar', 'favorites'],
    ['/my-reservations', '.reserve-explore-filters', 'reservations'],
];

async function capture(page, name, info) {
    if (process.env.RESERVE_CAPTURE_UI !== 'true') return;
    const folder = path.resolve('test-results/refresh-layout-review');
    await mkdir(folder, { recursive: true });
    await page.screenshot({ path: path.join(folder, `${name}-${info.project.name}.png`) });
}

test('cold refresh preserves toolbar geometry across authentication, route and data skeletons', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(current => {
        localStorage.setItem('auth-storage', JSON.stringify({ state: { user: current, isLoggedIn: true }, version: 0 }));
        window.reviewMotions = [];
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
            if (this.classList.contains('reserve-feed-content')) window.reviewMotions.push(args[0]);
            return animate.apply(this, args);
        };
    }, user);
    let releaseAuth;
    let auth;
    const requests = [];
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        const endpoint = url.pathname;
        if (!endpoint.startsWith('/api/')) return route.continue();
        requests.push(url);
        const ok = data => route.fulfill({ json: { success: true, data } });
        if (endpoint === '/api/member/me') { await auth; return ok(user); }
        if (endpoint.endsWith('/config')) return ok({ enabled: true, notificationsEnabled: true });
        if (endpoint === '/api/feed/me/profile') return ok({ publicId: 'review', nickname: '확인 사용자' });
        if (endpoint === '/api/favorites/my' || endpoint.endsWith('/regions')) return ok([]);
        if (endpoint.endsWith('/count')) return ok({ unread: 0 });
        if (endpoint.includes('unread')) return ok(0);
        return ok(empty);
    });
    for (const [url, selector, name] of cases) {
        auth = new Promise(resolve => { releaseAuth = resolve; });
        await page.goto(url);
        const toolbar = page.locator(selector).first();
        await expect(toolbar).toBeVisible();
        const initial = await toolbar.boundingBox();
        if (name === 'feed') await capture(page, 'feed-loading', info);
        releaseAuth();
        await expect(page.locator('.reserve-boot-shell')).toHaveCount(0);
        await expect(page.locator('.reserve-route-skeleton')).toHaveCount(0);
        await expect(toolbar.locator('.reserve-icon-tool--skeleton')).toHaveCount(0);
        const ready = await toolbar.boundingBox();
        for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(ready[key] - initial[key]), `${name} ${key}`).toBeLessThan(1);
        await capture(page, `${name}-ready`, info);
        if (name === 'feed') {
            expect(await page.evaluate(() => window.reviewMotions)).toHaveLength(0);
            await page.getByRole('button', { name: '피드 보기' }).click();
            await page.getByText('인기순', { exact: true }).click();
            await expect.poll(() => requests.some(request => request.pathname === '/api/feed/posts' && request.searchParams.get('sort') === 'popular')).toBe(true);
            await expect.poll(() => page.evaluate(() => window.reviewMotions.length)).toBe(1);
        }
    }
});
