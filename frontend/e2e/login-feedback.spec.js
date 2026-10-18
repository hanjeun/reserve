import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const user = { id: 901, name: '확인 사용자', email: 'ui@example.test', role: 'USER', termsAgreed: true };
const greeting = '확인 사용자님, 로그인됐어요!';

async function mockAuth(page, initialUser = null) {
    let current = initialUser;
    await page.route('**/api/**', async route => {
        const request = route.request();
        const endpoint = new URL(request.url()).pathname;
        if (!endpoint.startsWith('/api/')) return route.continue();
        if (endpoint === '/api/auth/login') {
            if (request.postDataJSON()?.password === 'wrong-password') {
                return route.fulfill({ status: 401, json: { success: false, message: '이메일 또는 비밀번호를 확인해주세요.' } });
            }
            current = user;
        }
        if (endpoint === '/api/auth/logout') current = null;
        if (['/api/member/me', '/api/auth/refresh'].includes(endpoint) && !current) {
            return route.fulfill({ status: 401, json: { success: false } });
        }
        let data = [];
        if (['/api/member/me', '/api/auth/login'].includes(endpoint)) data = current;
        if (endpoint.endsWith('/unread')) data = 0;
        return route.fulfill({ json: { success: true, data } });
    });
}

async function readableNotice(page, text) {
    const title = page.getByText(text, { exact: true });
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS('font-weight', '500');
    await expect(title).toHaveCSS('font-size', '15px');
    await expect(title).toHaveCSS('line-height', '24px');
    await expect(title).toHaveCSS('color', 'rgb(26, 31, 39)');
    await expect(title.locator('..')).toHaveCSS('filter', 'none');
    await expect.poll(() => title.evaluate(element => getComputedStyle(element.closest('.ant-message-notice')).opacity)).toBe('1');
    await expect(title.locator('..')).toHaveCSS('will-change', 'auto');
}

async function capture(page, info, label) {
    if (process.env.RESERVE_CAPTURE_UI !== 'true') return;
    const folder = path.resolve('test-results/login-feedback-review');
    await fs.mkdir(folder, { recursive: true });
    await page.screenshot({ path: path.join(folder, `${label}-${info.project.name}.png`) });
}

test('login restores the Google circle and keeps error and login notices readable', async ({ page }, info) => {
    await mockAuth(page);
    await page.goto('/login');
    const google = page.getByRole('button', { name: 'Google로 로그인', exact: true });
    await expect(google).toHaveCSS('border-width', '1px');
    await expect(google).toHaveCSS('border-color', 'rgb(218, 220, 224)');
    await expect(google).toHaveCSS('border-radius', '50%');
    await expect(google).toHaveCSS('width', '52px');
    await capture(page, info, 'login');
    await page.evaluate(() => sessionStorage.setItem('reserve:redirectAfterLogin', '/guide/common'));
    await page.getByPlaceholder('이메일 주소').fill(user.email);
    await page.getByPlaceholder('비밀번호').fill('wrong-password');
    const submit = page.getByRole('main').getByRole('button', { name: '로그인', exact: true });
    await submit.click();
    await readableNotice(page, '이메일 또는 비밀번호를 확인해주세요.');
    await capture(page, info, 'login-error');
    await page.getByPlaceholder('비밀번호').fill('sample-password');
    await submit.click();
    await expect(page).toHaveURL(/\/guide\/common$/);
    await readableNotice(page, greeting);
    await capture(page, info, 'email-success');
});

test('logout uses the same readable notice after navigation', async ({ page }, info) => {
    await mockAuth(page, user);
    await page.goto('/guide/common');
    await page.getByRole('button', { name: '내 계정 메뉴 열기', exact: true }).click();
    await page.getByRole('menuitem', { name: '로그아웃' }).click();
    await readableNotice(page, '로그아웃했어요.');
    await capture(page, info, 'logout-success');
});

test('social login displays its notice after a real document replacement and does not replay it', async ({ page }, info) => {
    await mockAuth(page, user);
    await page.addInitScript(() => {
        if (location.pathname === '/oauth2/callback') sessionStorage.setItem('reserve:redirectAfterLogin', '/guide/common');
    });
    const documents = [];
    page.on('request', request => { if (request.isNavigationRequest()) documents.push(new URL(request.url()).pathname); });
    await page.goto('/oauth2/callback');
    await expect(page).toHaveURL(/\/guide\/common$/);
    await readableNotice(page, greeting);
    await expect(page.getByText(greeting, { exact: true })).toHaveCount(1);
    expect(documents).toEqual(['/oauth2/callback', '/guide/common']);
    expect(await page.evaluate(() => sessionStorage.getItem('reserve:oauth-login-feedback'))).toBeNull();
    await capture(page, info, 'social-success');
    await page.reload();
    await expect(page.getByRole('button', { name: '내 계정 메뉴 열기', exact: true })).toBeVisible();
    await expect(page.getByText(greeting, { exact: true })).toHaveCount(0);
});
