import { expect, test } from '@playwright/test';

async function mockResult(page, type, status, error = false) {
    const paymentRequests = [];
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname.startsWith('/api/payment/')) paymentRequests.push({ path: url.pathname, method: request.method() });
        if (url.pathname === '/api/member/me') data = {
            id: 1, name: '검토 사업자', email: 'owner@example.test', role: 'BUSINESS', termsAgreed: true,
        };
        if (url.pathname === '/api/payment/status') {
            if (error) return route.fulfill({ status: 503, json: { success: false, message: '검토용 조회 실패' } });
            data = { type, status, merchantUid: 'RESULT-TEST', amount: 1000 };
        }
        if (url.pathname.endsWith('/unread')) data = 0;
        return route.fulfill({ json: { success: true, data } });
    });
    return paymentRequests;
}

test('forged success cannot confirm a READY payment or issue a new payment request', async ({ page }) => {
    const requests = await mockResult(page, 'reservation', 'READY');
    await page.goto('/payment/result?success=true&merchant_uid=RESULT-TEST&imp_uid=legacy-id');
    await expect(page.getByText('결제 상태 확인', { exact: true })).toBeVisible();
    await expect(page.getByText('결제 완료', { exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: '상태 다시 확인' }).click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests.every(request => request.method === 'GET' && request.path === '/api/payment/status')).toBe(true);
});

test('server PAID overrides a stale failure URL', async ({ page }) => {
    await mockResult(page, 'reservation', 'PAID');
    await page.goto('/payment/result?success=false&merchant_uid=RESULT-TEST&error_msg=old-error');
    await expect(page.getByText('결제 완료', { exact: true })).toBeVisible();
    await expect(page.getByText('old-error')).not.toBeVisible();
});

test('unknown ad result leads directly to the ad tab, including after reload', async ({ page }) => {
    await mockResult(page, 'ad', 'PENDING_PAYMENT');
    await page.goto('/payment/result?success=true&type=ad&merchant_uid=RESULT-TEST');
    await expect(page.getByText('결제 상태 확인', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '내 광고 확인하기' }).click();
    await expect(page).toHaveURL(/\/business\?tab=ads$/);
    await expect(page.getByRole('tab', { name: /광고 관리/ })).toHaveAttribute('aria-selected', 'true');
    await page.reload();
    await expect(page.getByRole('tab', { name: /광고 관리/ })).toHaveAttribute('aria-selected', 'true');
});

test('a status lookup failure never appears as payment success', async ({ page }) => {
    await mockResult(page, 'reservation', 'PAID', true);
    await page.goto('/payment/result?success=true&merchant_uid=RESULT-TEST');
    await expect(page.getByText('결제 상태 확인', { exact: true })).toBeVisible();
    await expect(page.getByText(/서버에서 결제 내역을 확인하지 못했습니다/)).toBeVisible();
    await expect(page.getByText('결제 완료', { exact: true })).not.toBeVisible();
});

test('a success flag without an order ID cannot display success', async ({ page }) => {
    const requests = await mockResult(page, 'reservation', 'PAID');
    await page.goto('/payment/result?success=true');
    await expect(page.getByText('결제 상태 확인', { exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
});
