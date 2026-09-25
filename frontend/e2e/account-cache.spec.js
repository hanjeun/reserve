import { expect, test } from '@playwright/test';

test('switching A to B in the same SPA cannot reuse A favorites', async ({ page }) => {
    let account = { id: 1, name: 'A 사용자', email: 'a@example.test', role: 'USER', termsAgreed: true };
    let releaseB;
    const waitForB = new Promise(resolve => { releaseB = resolve; });
    let bRequested = false;
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        let data = [];
        if (path === '/api/member/me') data = account;
        if (path === '/api/auth/logout') account = null;
        if (path === '/api/auth/login') {
            account = { id: 2, name: 'B 사용자', email: 'b@example.test', role: 'USER', termsAgreed: true };
            data = account;
        }
        if (path === '/api/favorites/my') {
            if (account?.id === 2) { bRequested = true; await waitForB; }
            data = [{ id: account?.id, storeId: account?.id, storeName: account?.id === 1 ? 'A만의 즐겨찾기' : 'B만의 즐겨찾기',
                storeCategory: '카페', storeRating: 4, storeReviewCount: 1 }];
        }
        if (path.endsWith('/unread')) data = 0;
        return route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/my-favorites');
    await expect(page.getByText('A만의 즐겨찾기', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '내 계정 메뉴 열기' }).click();
    await page.getByRole('menuitem', { name: /로그아웃/ }).click();
    await expect(page.getByText('A만의 즐겨찾기', { exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: '로그인', exact: true }).first().click();
    await page.getByPlaceholder('이메일 주소').fill('b@example.test');
    await page.getByPlaceholder('비밀번호').fill('local-test-password');
    await page.getByRole('main').getByRole('button', { name: '로그인', exact: true }).click();
    await page.getByRole('button', { name: '내 계정 메뉴 열기' }).click();
    await page.getByRole('menuitem', { name: /즐겨찾기/ }).click();
    await expect.poll(() => bRequested).toBe(true);
    // B의 느린 응답을 기다리는 동안에도 A 캐시가 placeholder로 비치면 안 된다.
    await expect(page.getByText('A만의 즐겨찾기', { exact: true })).not.toBeVisible();
    releaseB();
    await expect(page.getByText('B만의 즐겨찾기', { exact: true })).toBeVisible();
});

test('an account change in another tab discards the first tab private cache', async ({ page, context }) => {
    let account = { id: 1, name: 'A 사용자', email: 'a@example.test', role: 'USER', termsAgreed: true };
    await context.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        let data = [];
        if (path === '/api/member/me') data = account;
        if (path === '/api/favorites/my') data = [{
            id: account.id, storeId: account.id, storeName: account.id === 1 ? 'A 비공개 목록' : 'B 비공개 목록',
            storeCategory: '카페', storeRating: 4, storeReviewCount: 1,
        }];
        if (path.endsWith('/unread')) data = 0;
        return route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/my-favorites');
    await expect(page.getByText('A 비공개 목록', { exact: true })).toBeVisible();
    const otherTab = await context.newPage();
    await otherTab.goto('/my-favorites');
    await expect(otherTab.getByText('A 비공개 목록', { exact: true })).toBeVisible();
    account = { ...account, id: 2, name: 'B 사용자', email: 'b@example.test' };
    // 쿠키 계정 전환을 모의한 뒤 다른 탭의 실제 storage 이벤트를 발생시킨다.
    await otherTab.evaluate(user => {
        localStorage.setItem('auth-storage', JSON.stringify({ state: { user, isLoggedIn: true }, version: 0 }));
    }, account);
    await expect(page.getByText('B 비공개 목록', { exact: true })).toBeVisible();
    await expect(page.getByText('A 비공개 목록', { exact: true })).not.toBeVisible();
    await otherTab.close();
});
