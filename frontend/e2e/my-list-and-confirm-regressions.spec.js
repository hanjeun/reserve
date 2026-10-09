import { expect, test } from '@playwright/test';

const member = { id: 41, name: '화면 검사 사업자', email: 'ui@example.test', role: 'BUSINESS', termsAgreed: true };
const stores = [
    { id: 1, name: '첫 가게', address: '서울특별시', serviceDomain: 'FOOD', category: '카페', rating: 0, reviewCount: 0 },
    { id: 2, name: '둘째 가게', address: '경기도', serviceDomain: 'BEAUTY_CLINIC', category: '뷰티', rating: 4.5, reviewCount: 2 },
];
const reservations = [
    { id: 12, storeId: 1, storeName: '첫 가게', reservationCode: 'R-12',
        reservationDate: '2026-10-02', reservationTime: '15:00', status: 'PENDING',
        depositAmount: 0, depositPaid: false, guestCount: 1 },
    { id: 11, storeId: 2, storeName: '둘째 가게', reservationCode: 'R-11',
        reservationDate: '2026-09-30', reservationTime: '11:00', status: 'COMPLETED',
        depositAmount: 0, depositPaid: false, guestCount: 2 },
];
const emptyPage = { content: [], page: { number: 0, totalElements: 0, totalPages: 0 } };

const advanceRegistrationToIdentity = async page => {
    await expect(page.getByRole('heading', { name: '어떤 가게를 운영하시나요?', exact: true })).toBeVisible();
    await page.getByRole('group', { name: '서비스 분야', exact: true })
        .getByRole('button', { name: '맛집 · 카페', exact: true }).click();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.getByRole('heading', { name: '손님을 어떻게 받고 싶으세요?', exact: true })).toBeVisible();
    await page.getByRole('group', { name: '손님 접수 방식', exact: true })
        .getByRole('button', { name: '예약', exact: true }).click();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.getByRole('heading', { name: '손님이 무엇을 선택하면 되나요?', exact: true })).toBeVisible();
    await page.getByRole('group', { name: '예약 방식', exact: true })
        .getByRole('button', { name: '시간대', exact: true }).click();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.getByRole('heading', { name: '언제 가게를 운영하시나요?', exact: true })).toBeVisible();
    await page.getByLabel('영업 시간', { exact: true }).click();
    const hours = page.getByRole('dialog', { name: '시간 범위 선택' });
    await hours.getByRole('textbox', { name: '시작 시간 직접 입력', exact: true }).fill('09:00');
    await hours.getByRole('textbox', { name: '종료 시간 직접 입력', exact: true }).fill('18:00');
    await hours.getByRole('button', { name: '선택 완료', exact: true }).click();
    await expect(page.getByLabel('영업 시간', { exact: true })).toHaveText(/09:00.*18:00/);
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.getByRole('heading', { name: '예약을 어떤 규칙으로 받을까요?', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.getByRole('heading', { name: '노쇼 예약금을 설정하실 건가요?', exact: true })).toBeVisible();
    await page.getByRole('radio', { name: '예약금 없이 받기', exact: true }).click();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.getByRole('heading', { name: '손님에게 가게를 소개해주세요.', exact: true })).toBeVisible();
};

test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        const data = path === '/api/member/me' ? member
            : path === '/api/stores/my' ? stores
                : path === '/api/reservations/my' ? reservations : emptyPage;
        return route.fulfill({ json: { success: true, data } });
    });
});

test('owned stores hide only the region control; reservations reuse view, status and sort menus', async ({ page }) => {
    await page.goto('/my-stores');
    await expect(page.getByRole('heading', { name: '내 가게 관리' })).toBeVisible();
    await expect(page.getByRole('button', { name: '서비스 분야' })).toBeVisible();
    await expect(page.getByRole('button', { name: '가게 정렬' })).toBeVisible();
    await expect(page.getByRole('button', { name: /전체 지역/ })).toHaveCount(0);
    await page.goto('/stores');
    await expect(page.getByRole('button', { name: /전체 지역/ })).toBeVisible();

    await page.goto('/my-reservations');
    await expect(page.getByRole('heading', { name: '내 예약 확인' })).toBeVisible();
    const status = page.getByRole('button', { name: '예약 상태' });
    const sort = page.getByRole('button', { name: '예약 정렬' });
    await expect(status).toBeVisible();
    await expect(sort).toBeVisible();
    const viewToggle = page.getByRole('button', { name: '사진형 보기로 전환' });
    await expect(viewToggle).toBeVisible();
    await expect(status).toBeEnabled();
    await expect(sort).toBeEnabled();
    await expect(viewToggle).toBeEnabled();
    const statusWidth = await status.evaluate(element => element.getBoundingClientRect().width);
    const sortWidth = await sort.evaluate(element => element.getBoundingClientRect().width);
    expect(await status.locator('.anticon').count()).toBe(1);
    expect(await sort.locator('.anticon').count()).toBe(1);
    expect(await status.evaluate(element => element.classList.contains('reserve-explore-domain-filter'))).toBe(true);
    expect(await sort.evaluate(element => element.classList.contains('reserve-explore-sort-filter'))).toBe(true);
    expect(statusWidth).toBeLessThan(132);
    expect(sortWidth).toBeLessThan(148);
    expect(sortWidth).toBeGreaterThan(statusWidth);

    await viewToggle.click();
    const cards = page.locator('.reserve-reservation-summary-card');
    await expect(cards).toHaveCount(2);
    await expect(page).toHaveURL(/view=cards/);
    await sort.click();
    await page.locator('.reserve-filter-menu-options .ant-dropdown-menu-item').filter({ hasText: '오래된 예약순' }).click();
    await expect(cards.first()).toContainText('둘째 가게');
    await status.click();
    await page.locator('.reserve-filter-menu-options .ant-dropdown-menu-item').filter({ hasText: '승인 대기' }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('첫 가게');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('a selected list presentation survives a return to the same reservation page', async ({ page }) => {
    await page.goto('/my-reservations');
    await expect(page.getByRole('heading', { name: '내 예약 확인' })).toBeVisible();

    await page.getByRole('button', { name: '사진형 보기로 전환' }).click();
    await expect(page.locator('.reserve-reservation-summary-card')).toHaveCount(2);
    await expect(page).toHaveURL(/view=cards/);

    await page.goto('/stores');
    await page.goto('/my-reservations');

    await expect(page.locator('.reserve-reservation-summary-card')).toHaveCount(2);
    await expect(page).toHaveURL(/view=cards/);
});

test('confirmation buttons have their former compact height and creating a new draft deletes the old one', async ({ page }) => {
    await page.goto('/my-reservations');
    await expect(page.getByRole('button', { name: '예약 정렬' })).toBeVisible();
    await page.locator('.reserve-myreservation-row').first().getByRole('button', { name: '취소' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: '예약 취소' });
    await expect(confirm).toBeVisible();
    const buttons = confirm.locator('.ant-modal-confirm-btns .ant-btn');
    await expect(buttons).toHaveCount(2);
    for (const button of await buttons.all()) {
        const height = await button.evaluate(element => parseFloat(getComputedStyle(element).height));
        expect(height).toBeGreaterThanOrEqual(32);
        expect(height).toBeLessThan(40);
    }
    const sentenceGap = await confirm.locator('.ant-modal-confirm-content > div + div').evaluate(
        element => getComputedStyle(element).marginTop);
    expect(sentenceGap).toBe('0px');
    await confirm.getByRole('button', { name: '닫기' }).click();

    await page.goto('/store/register');
    await advanceRegistrationToIdentity(page);
    await expect(page.getByPlaceholder('가게 이름')).toBeVisible();
    await page.getByPlaceholder('가게 이름').fill('이전 초안 가게');
    await page.getByRole('button', { name: '임시저장' }).click();
    await expect(page.getByText(/이 브라우저에 저장됨/)).toBeVisible();
    await page.reload();
    const restore = page.getByRole('dialog').filter({ hasText: '임시저장된 내용이 있어요' });
    await expect(restore).toBeVisible();
    for (const button of await restore.locator('.ant-modal-confirm-btns .ant-btn').all()) {
        const height = await button.evaluate(element => parseFloat(getComputedStyle(element).height));
        expect(height).toBeGreaterThanOrEqual(32);
        expect(height).toBeLessThan(40);
    }
    await restore.getByRole('button', { name: '새로 작성' }).click();
    await expect(restore).toBeHidden();
    await page.reload();
    await advanceRegistrationToIdentity(page);
    await expect(page.getByPlaceholder('가게 이름')).toBeVisible();
    await expect(page.getByPlaceholder('가게 이름')).toHaveValue('');
    await expect(page.getByRole('dialog').filter({ hasText: '임시저장된 내용이 있어요' })).toHaveCount(0);
});
