import { expect, test } from '@playwright/test';

test('ad payment queue separates reading, explicit processing, and refund completion', async ({ page }, testInfo) => {
    const writes = [];
    let row = {
        id: 1, adId: 42, storeId: 7, merchantUid: 'AD-LOCAL-REVIEW',
        amount: 1000, state: 'REVIEW_REQUIRED', pgStatus: 'PAID',
        issueCode: 'PAID_WITHOUT_DELIVERABLE_AD', legacy: false, cancelRequested: false,
    };
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        let data = { content: [], page: { totalElements: 0 } };
        if (path === '/api/member/me') data = {
            id: 1, name: '검증 관리자', email: 'admin@example.test', role: 'ADMIN', termsAgreed: true,
        };
        if (path === '/api/admin/ad-payments') data = { content: [row], page: { totalElements: 1 } };
        if (path.startsWith('/api/admin/ad-payments/') && route.request().method() === 'POST') {
            writes.push(path);
            row = { ...row, state: 'REFUND_PENDING', refundDispatchedAt: '2026-09-07T01:00:00', issueCode: 'REFUND_REQUESTED_RECHECK_REQUIRED' };
            data = row;
        }
        if (path.endsWith('waiting-count') || path.endsWith('/unread')) data = 0;
        return route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/admin');
    if (testInfo.project.name === 'mobile-chromium') {
        await page.getByRole('button', { name: 'ellipsis' }).click();
        await page.getByRole('option', { name: /결제 운영/ }).click();
    } else {
        await page.getByRole('tab', { name: /결제 운영/ }).click();
    }
    await page.getByRole('radio', { name: '광고 결제', exact: true }).click();
    await expect(page.getByText('AD-LOCAL-REVIEW', { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    await page.getByRole('button', { name: '환불 요청', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('전액 환불');
    expect(writes).toEqual([]);
    await dialog.getByRole('button', { name: '환불 요청', exact: true }).click();
    await expect(page.getByText('환불 확인 중', { exact: true })).toBeVisible();
    await expect(page.getByText('환불 완료', { exact: true })).not.toBeVisible();
    expect(writes).toEqual(['/api/admin/ad-payments/1/refund']);
    expect(browserErrors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('ad-payment-queue.png'), fullPage: true });
});
