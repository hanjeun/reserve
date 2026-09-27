import { expect, test } from '@playwright/test';

const business = {
    id: 41,
    name: '가게 폼 검증 사업자',
    email: 'store-form@example.test',
    role: 'BUSINESS',
    termsAgreed: true,
};

const emptyPage = {
    content: [],
    page: { size: 10, number: 0, totalElements: 0, totalPages: 0 },
};

const ok = (route, data) => route.fulfill({ json: { success: true, data } });

test.beforeEach(async ({ context, page }) => {
    let editFetchCount = 0;
    await context.clearCookies();
    await page.addInitScript(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });
    page.on('pageerror', error => console.error(`[browser error] ${error.message}`));
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        if (!url.pathname.startsWith('/api/')) {
            await route.continue();
            return;
        }
        if (url.pathname === '/api/member/me') {
            await ok(route, business);
            return;
        }
        if (url.pathname === '/api/stores/99/edit') {
            editFetchCount += 1;
            await ok(route, {
                id: 99,
                ownerId: business.id,
                name: editFetchCount === 1 ? '서버 원본 가게' : '서버에서 갱신된 가게',
                category: '카페',
                phone: '02-1234-5678',
                address: '서울특별시 중구 세종대로 1',
                zipCode: '04524',
                addressDetail: '1층',
                description: '수정 폼 검증용 가게',
                openTime: '09:00',
                closeTime: '18:00',
                closedDays: [],
                closedDates: [],
                detailImageUrls: [],
            });
            return;
        }
        if (url.pathname === '/api/address/search') {
            await ok(route, { documents: [{
                road_address: {
                    address_name: '경기 안산시 단원구 광덕동로 26',
                    zone_no: '15455',
                    building_name: '테스트 건물',
                },
                address: { address_name: '경기 안산시 단원구 고잔동 1' },
                x: '126.8309', y: '37.3219',
            }] });
            return;
        }
        if (url.pathname.endsWith('/waiting-count') || url.pathname === '/api/chat/my/unread') {
            await ok(route, 0);
            return;
        }
        await ok(route, emptyPage);
    });
});

test('store editing keeps a local draft and warns when the server base changed', async ({ page }) => {
    await page.goto('/store/99/edit');

    await expect(page.getByRole('heading', { name: '가게 정보 수정' })).toBeVisible();
    await expect(page.getByRole('button', { name: '임시저장' }))
        .toHaveClass(/reserve-btn--secondary/);
    await expect(page.getByRole('button', { name: '수정 완료' }))
        .toHaveClass(/reserve-btn--primary/);

    const nameInput = page.getByPlaceholder('가게 이름');
    await expect(nameInput).toHaveValue('서버 원본 가게');
    await nameInput.fill('내 수정 초안 가게');
    await page.getByRole('button', { name: '임시저장' }).click();
    await expect(page.getByText(/이 브라우저에 저장됨/)).toBeVisible();

    await page.reload();
    const conflictDialog = page.getByRole('dialog').filter({ hasText: '가게 정보가 달라졌어요' });
    await expect(conflictDialog).toBeVisible();
    await expect(conflictDialog).toContainText('현재 가게 정보가 다릅니다');
    await conflictDialog.getByRole('button', { name: '이어서 작성' }).click();
    await expect(page.getByPlaceholder('가게 이름')).toHaveValue('내 수정 초안 가게');
});

test('store registration uses the shared calendar and restores a browser-local draft', async ({ page }) => {
    await page.goto('/store/register');

    await expect(page.getByRole('heading', { name: '가게 등록' })).toBeVisible();
    const draftButton = page.getByRole('button', { name: '임시저장' });
    const submitButton = page.getByRole('button', { name: '등록 완료' });
    await expect(draftButton).toHaveClass(/reserve-btn--secondary/);
    await expect(submitButton).toHaveClass(/reserve-btn--primary/);
    expect(await draftButton.evaluate(element => getComputedStyle(element).backgroundColor))
        .not.toBe(await submitButton.evaluate(element => getComputedStyle(element).backgroundColor));

    await page.locator('.reserve-form-date-trigger').filter({ hasText: '시작일' }).click();
    const calendar = page.getByRole('dialog', { name: '날짜 범위 선택' });
    await expect(calendar).toBeVisible();
    await expect(calendar.getByRole('button', { name: '이전 달' })).toBeVisible();
    await expect(calendar.getByRole('button', { name: '다음 달' })).toBeVisible();
    const dateCellCount = await calendar.locator('.reserve-form-cal-cell').count();
    expect(dateCellCount).toBeGreaterThanOrEqual(28);
    expect(dateCellCount).toBeLessThanOrEqual(31);
    expect(await calendar.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth + 1;
    })).toBe(true);
    await page.keyboard.press('Escape');
    await expect(calendar).toBeHidden();

    await page.getByPlaceholder('가게 이름').fill('브라우저 임시저장 가게');
    await page.getByPlaceholder('도로명 또는 지번 주소 입력').fill('경기 안산시 단원구');
    await page.getByRole('option').click();
    const postcode = page.locator('.reserve-store-form-address-box').filter({ hasText: /^15455$/ });
    await expect(postcode).toBeVisible();
    await draftButton.click();
    await expect(page.getByText(/이 브라우저에 저장됨/)).toBeVisible();

    await page.reload();
    const restoreDialog = page.getByRole('dialog').filter({ hasText: '임시저장된 내용이 있어요' });
    await expect(restoreDialog).toBeVisible();
    await restoreDialog.getByRole('button', { name: '이어서 작성' }).click();
    await expect(page.getByPlaceholder('가게 이름')).toHaveValue('브라우저 임시저장 가게');
    await expect(postcode).toBeVisible();
    await expect(page.getByPlaceholder('상세주소 (동, 호수 등)')).toHaveValue('테스트 건물');

    expect(await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    )).toBe(true);
});

test('mobile registration and editing keep short structured fields in compact rows', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), '모바일 레이아웃 전용 검증');

    const verifyCompactRows = async () => {
        const rows = page.locator('.reserve-store-form .reserve-store-form-row--compact');
        await expect(rows.first()).toBeVisible();

        const expectedPairs = [
            ['예약 방식', '서비스 분야'],
            ['예약 단위', '연락처'],
            ['최대 예약 인원', '노쇼 예약금'],
        ];
        for (let index = 0; index < expectedPairs.length; index += 1) {
            const row = rows.nth(index);
            for (const label of expectedPairs[index]) await expect(row).toContainText(label);
            const boxes = await row.locator('.ant-form-item').evaluateAll(items => items.map(item => {
                const rect = item.getBoundingClientRect();
                return { top: rect.top, width: rect.width };
            }));
            expect(boxes).toHaveLength(2);
            expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThan(2);
            expect(boxes.every(box => box.width > 100)).toBe(true);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    };

    await page.goto('/store/register');
    await expect(page.getByRole('heading', { name: '가게 등록' })).toBeVisible();
    await verifyCompactRows();

    await page.goto('/store/99/edit');
    await expect(page.getByRole('heading', { name: '가게 정보 수정' })).toBeVisible();
    await verifyCompactRows();
});

test('store editing reserves the full form skeleton while the initial data is delayed', async ({ page }) => {
    let releaseEditRequest;
    const editRequestHeld = new Promise(resolve => { releaseEditRequest = resolve; });

    await page.route('**/api/stores/99/edit', async route => {
        await editRequestHeld;
        await ok(route, {
            id: 99,
            ownerId: business.id,
            name: '지연 응답 가게',
            category: '카페',
            phone: '02-1234-5678',
            address: '서울특별시 중구 세종대로 1',
            zipCode: '04524',
            addressDetail: '1층',
            description: '스켈레톤 검증용 가게',
            openTime: '09:00',
            closeTime: '18:00',
            closedDays: [],
            closedDates: [],
            detailImageUrls: [],
        });
    });

    const navigation = page.goto('/store/99/edit');
    const skeleton = page.getByRole('status', { name: '가게 정보를 불러오는 중' });
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveAttribute('aria-busy', 'true');
    for (const section of ['basic', 'settings', 'images', 'actions']) {
        await expect(skeleton.locator(`[data-skeleton-section="${section}"]`)).toBeVisible();
    }
    await expect(skeleton.locator('.reserve-store-form-skeleton-toggle')).toHaveCount(4);
    await expect(skeleton.locator('.reserve-store-form-skeleton-uploads > .reserve-skeleton-block')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    releaseEditRequest();
    await navigation;
    await expect(page.getByRole('heading', { name: '가게 정보 수정' })).toBeVisible();
    await expect(skeleton).toBeHidden();
});
