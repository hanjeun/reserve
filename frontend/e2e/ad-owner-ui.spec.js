import { expect, test } from '@playwright/test';
import path from 'node:path';

const owner = { id: 51, name: '광고 검증 사업자', email: 'ads@example.test', role: 'BUSINESS', termsAgreed: true };
const stores = [{
    id: 71, name: '광고 검증 가게', category: '카페', description: '예약 가능한 공간',
    rating: 4.8, reviewCount: 12, mainImageUrl: 'http://127.0.0.1:4173/images/discovery-v3/operation-guide-cover-v1.webp',
}];
const ads = [
    {
        id: 81, storeId: 71, storeName: '지난 광고', adType: 'BADGE',
        startDate: '2020-01-01', endDate: '2020-01-02', amount: 2000, status: 'PAYMENT_FAILED',
    },
    {
        id: 82, storeId: 71, storeName: '결제할 광고', adType: 'BADGE',
        startDate: '2099-01-01', endDate: '2099-01-02', amount: 2000, status: 'PAYMENT_FAILED',
    },
];

async function mockOwnerAds(page) {
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname === '/api/member/me') data = owner;
        else if (url.pathname === '/api/stores/my') data = stores;
        else if (url.pathname === '/api/advertisements/my') {
            data = {
                content: ads,
                page: { number: 0, size: 20, totalElements: ads.length, totalPages: 1 },
            };
        }
        else if (url.pathname.endsWith('/unread')) data = 0;
        await route.fulfill({ json: { success: true, data } });
    });
}

test('past unpaid ads cannot be paid and both ad previews keep the shared modal layout', async ({ page }) => {
    page.on('pageerror', error => console.error(`[ad owner page error] ${error.message}`));
    await mockOwnerAds(page);
    await page.goto('/business?view=list&tab=ads&statisticsRange=90d');
    await expect(page).toHaveURL(/\/business\?tab=ads$/);

    const staleRow = page.getByRole('row').filter({ hasText: '지난 광고' });
    const payableRow = page.getByRole('row').filter({ hasText: '결제할 광고' });
    await expect(staleRow.getByText('기간 경과')).toBeVisible();
    await expect(staleRow.getByRole('button', { name: /결제/ })).toHaveCount(0);
    await expect(payableRow.getByRole('button', { name: /결제/ })).toBeVisible();

    await page.getByRole('button', { name: '새 광고 신청' }).click();
    const dialog = page.getByRole('dialog', { name: '새 광고 신청' });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate(element => element.getAnimations({ subtree: true })
        .some(animation => animation.playState === 'running'))).toBe(false);
    await expect(dialog.getByRole('radio', { name: '노출형' })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByText(/1 \/ 2/)).toHaveCount(0);
    const modalLayer = await page.locator('.ant-modal-wrap:visible').evaluate(
        element => Number.parseInt(getComputedStyle(element).zIndex, 10),
    );
    const messengerLayer = await page.locator('.reserve-messenger-launcher-wrap').evaluate(
        element => Number.parseInt(getComputedStyle(element).zIndex, 10),
    );
    expect(modalLayer).toBeGreaterThan(messengerLayer);
    const storeSelect = dialog.locator('.reserve-ad-store-select');
    await expect.poll(async () => (await storeSelect.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(45);
    const storeBox = await storeSelect.boundingBox();
    expect(storeBox.height).toBeLessThanOrEqual(48);

    await storeSelect.click();
    const storeDropdown = page.locator('.ant-select-dropdown:visible');
    await expect.poll(() => storeDropdown.evaluate(element => element.getAnimations({ subtree: true })
        .some(animation => animation.playState === 'running'))).toBe(false);
    await storeDropdown.locator('.ant-select-item-option').filter({ hasText: '광고 검증 가게' }).click();
    await expect(storeSelect).toContainText('광고 검증 가게');

    await dialog.locator('.reserve-form-date-trigger').click();
    const dateDialog = page.locator('.reserve-form-cal-modal');
    const activeDatePart = dateDialog.locator('.reserve-form-cal-part.is-active');
    // 편집 중인 시작/종료 칸은 얇은 회색 테두리(gray-400)다 — 진한 테두리를 쓰지 않는다(2026-09-23).
    await expect(activeDatePart).toHaveCSS('border-top-color', 'rgb(181, 184, 189)');
    await dateDialog.getByRole('button', { name: '다음 달' }).click();
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    const month = nextMonth.getMonth() + 1;
    await dateDialog.getByRole('button', { name: `${month}월 1일` }).click();
    await dateDialog.getByRole('button', { name: `${month}월 2일` }).click();
    await dateDialog.getByRole('button', { name: '선택 완료' }).click();

    await dialog.getByRole('button', { name: '미리보기' }).click();
    let previewDialog = page.getByRole('dialog', { name: '광고 미리보기' });
    const placementPreview = previewDialog.locator('.reserve-ad-placement-preview');
    await expect(placementPreview).toBeVisible();
    await expect(placementPreview.getByRole('heading', { name: '카드 보기' })).toBeVisible();
    await expect(placementPreview.getByRole('heading', { name: '리스트 보기' })).toBeVisible();
    await expect(placementPreview.locator('.reserve-store-card-shell .reserve-store-identity-text-ad [aria-hidden="true"]')).toHaveText('AD');
    await expect(placementPreview.locator('.reserve-store-list-row .reserve-store-identity-text-ad [aria-hidden="true"]')).toHaveText('AD');
    const rowImageWidth = await placementPreview.locator('.reserve-store-list-row-image').evaluate(
        element => element.getBoundingClientRect().width,
    );
    expect(rowImageWidth).toBeLessThanOrEqual(96);
    await expect(placementPreview.getByRole('link')).toHaveCount(0);
    await expect(placementPreview.getByRole('button')).toHaveCount(0);
    await expect(placementPreview.locator('.reserve-favorite-button--preview')).toHaveCount(2);
    await expect(previewDialog.getByText(/2 \/ 2/)).toHaveCount(0);
    await expect(previewDialog.getByText('노출형', { exact: true })).toBeVisible();
    await expect(previewDialog.getByText('2,000원')).toBeVisible();
    await expect(previewDialog.getByText('하루 1,000원 × 2일')).toBeVisible();
    await expect(previewDialog.getByRole('button', { name: '이전' })).toHaveClass(/reserve-btn--outline/);
    await expect(previewDialog.getByRole('button', { name: '결제하기' })).toHaveClass(/reserve-btn--primary/);
    await previewDialog.getByRole('button', { name: '이전' }).click();

    await dialog.getByRole('radio', { name: '배너형' }).click();
    const titleInput = dialog.getByRole('textbox', { name: '광고 제목' });
    const descriptionInput = dialog.getByRole('textbox', { name: '광고 내용' });
    await expect(titleInput).toHaveValue('지금 예약할 수 있어요');
    await expect(descriptionInput).toHaveValue('원하는 시간을 바로 확인해보세요');
    await dialog.getByRole('combobox', { name: '추천 문구' }).click();
    await page.locator('.ant-select-dropdown:visible').getByText('새로운 가게를 만나보세요').click();
    await expect(titleInput).toHaveValue('새로운 가게를 만나보세요');
    await expect(descriptionInput).toHaveValue('예약 정보와 이용 시간을 둘러보세요');
    await titleInput.fill('오늘 만나는 광고 검증 가게');
    await descriptionInput.fill('예약 가능한 시간을 미리 확인해보세요');
    const motionChoices = dialog.getByRole('radiogroup', { name: '배너 등장 효과' }).getByRole('radio');
    await expect(motionChoices).toHaveCount(2);
    await expect(dialog.getByRole('radio', { name: /부드럽게 올라오기/ })).toHaveAttribute('aria-checked', 'true');
    await dialog.getByRole('radio', { name: /3D로 세워지기/ }).click();
    await expect(dialog.getByRole('radio', { name: /3D로 세워지기/ })).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.locator('.reserve-ad-motion-demo--soft-rise')).toHaveCount(0);
    await expect(dialog.locator('.reserve-ad-motion-demo--tilt-up-3d')).toBeVisible();
    await expect(dialog.getByText(/정사각형 이미지.*800×800px/)).toBeVisible();
    await expect(dialog.getByRole('textbox')).toHaveCount(2);

    await dialog.locator('input[type="file"]').setInputFiles(path.resolve('public/images/discovery-v3/operation-guide-cover-v1.webp'));
    const modalBody = dialog.locator('.ant-modal-body');
    await modalBody.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await dialog.getByRole('button', { name: '미리보기' }).click();

    previewDialog = page.getByRole('dialog', { name: '광고 미리보기' });
    await expect(previewDialog.getByRole('heading', { name: '가게 목록 화면' })).toBeVisible();
    await expect.poll(() => previewDialog.locator('.ant-modal-body').evaluate(element => element.scrollTop)).toBe(0);
    await expect(previewDialog.locator('.reserve-ad-final-banner--tilt-up-3d')).toBeVisible();
    const bannerLayout = await previewDialog.locator('.reserve-ad-final-banner').evaluate(element => {
        const image = element.querySelector('.reserve-ad-banner-image');
        const clickArea = element.querySelector('.ad-banner-click-area');
        const rect = element.getBoundingClientRect();
        const imageRect = image?.getBoundingClientRect();
        const style = getComputedStyle(element);
        const clickStyle = clickArea ? getComputedStyle(clickArea) : null;
        return {
            rect: { width: rect.width, height: rect.height },
            image: imageRect ? { width: imageRect.width, height: imageRect.height } : null,
            position: style.position,
            display: style.display,
            clickDisplay: clickStyle?.display,
            clickColumns: clickStyle?.gridTemplateColumns,
        };
    });
    expect(bannerLayout.rect.width).toBeLessThanOrEqual(360);
    expect(bannerLayout.rect.height).toBeLessThanOrEqual(110);
    expect(bannerLayout.image).toEqual({ width: 80, height: 80 });
    expect(bannerLayout.position).toBe('absolute');
    expect(bannerLayout.clickDisplay).toBe('grid');
    await expect(previewDialog.getByText('오늘 만나는 광고 검증 가게', { exact: true })).toBeVisible();
    await expect(previewDialog.getByText('예약 가능한 시간을 미리 확인해보세요', { exact: true })).toBeVisible();
    await expect(previewDialog.getByRole('button', { name: '효과 다시 보기' })).toHaveClass(/reserve-btn--ghost-sm/);
    await expect(previewDialog.getByRole('heading', { name: '결제할 금액' })).toBeVisible();
    await expect(previewDialog.getByText('10,000원')).toBeVisible();
    await expect(previewDialog.getByRole('button', { name: '결제하기' })).toBeVisible();
});
