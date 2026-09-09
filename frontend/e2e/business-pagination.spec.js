import { expect, test } from '@playwright/test';

const business = { id: 9001, name: '검토 사업자', email: 'owner@example.test', role: 'BUSINESS', termsAgreed: true };
const stores = [{ id: 9002, name: '첫 가게' }, { id: 9003, name: '둘째 가게' }];

async function mockReservations(page, count) {
    const requests = [];
    const rows = Array.from({ length: count }, (_, index) => ({
        id: count - index, storeId: index === count - 1 ? 9003 : 9002,
        storeName: index === count - 1 ? '둘째 가게' : '첫 가게',
        memberName: index === count - 1 ? '백번째밖예약자' : `검토 ${index + 1}`,
        reservationCode: `REVIEW-${count - index}`, guestCount: 1,
        reservationDate: '2030-01-01', reservationTime: '12:00:00', status: 'CONFIRMED', depositPaid: false,
    }));
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/member/me') data = business;
        else if (url.pathname === '/api/stores/my') data = stores;
        else if (url.pathname === '/api/reservations/store') {
            requests.push(Object.fromEntries(url.searchParams));
            const search = url.searchParams.get('search') || '';
            const storeId = url.searchParams.get('storeId');
            const matching = rows.filter(row => row.memberName.includes(search) && (!storeId || row.storeId === Number(storeId)));
            const number = Number(url.searchParams.get('page') || 0);
            const size = Math.min(100, Number(url.searchParams.get('size') || 100));
            data = { content: matching.slice(number * size, (number + 1) * size),
                page: { number, size, totalElements: matching.length, totalPages: Math.ceil(matching.length / size) } };
        } else if (url.pathname.endsWith('/unread')) data = 0;
        await route.fulfill({ json: { success: true, data } });
    });
    return requests;
}

for (const count of [101, 201]) {
    test(`business reservations: all ${count} rows are counted and an older row is searchable`, async ({ page }) => {
        const requests = await mockReservations(page, count);
        await page.goto('/business');
        await expect(page.getByText(`${count}건`, { exact: true })).toBeVisible();
        await expect(page.getByText(/^REVIEW-\d+$/)).toHaveCount(15);
        await page.getByRole('navigation', { name: '예약 목록 페이지' }).getByTitle('2', { exact: true }).click();
        await expect.poll(() => requests.at(-1)?.page).toBe('1');
        await expect(page.getByText(/^REVIEW-\d+$/)).toHaveCount(15);
        await page.getByPlaceholder('가게명, 예약자로 검색').fill('백번째밖예약자');
        await expect(page.getByText('1건', { exact: true })).toBeVisible();
        // Mobile cards hide the member name; this identifier is visible on both layouts.
        await expect(page.getByText('REVIEW-1', { exact: true })).toBeVisible();
        expect(requests.at(-1)).toMatchObject({ page: '0', size: '15', search: '백번째밖예약자' });
    });
}

test('business reservations: a failed request is not displayed as an empty list', async ({ page }) => {
    await mockReservations(page, 101);
    await page.route('**/api/reservations/store?**', route => route.fulfill({ status: 500,
        json: { success: false, message: '검토용 조회 실패' } }));
    await page.goto('/business');
    await expect(page.getByText('예약을 불러오지 못했습니다. 새로고침으로 다시 시도해주세요.')).toBeVisible();
    await expect(page.getByText('예약 내역이 없습니다.', { exact: true })).not.toBeVisible();
});
