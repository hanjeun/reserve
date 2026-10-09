import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

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

const openRegistrationOperation = async page => {
    await page.goto('/store/register');
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
};

const continueToIdentity = async page => {
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

const selectEditSection = async (page, label, heading) => {
    await expect(page.getByRole('heading', { name: '무엇을 수정하시겠어요?', exact: true })).toBeVisible();
    await page.getByRole('group', { name: '수정할 항목', exact: true })
        .getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
};

test.beforeEach(async ({ context, page }) => {
    let editFetchCount = 0;
    await context.clearCookies();
    await page.addInitScript(() => {
        // A same-origin preview frame shares storage with the page under test.
        if (window !== window.top) return;
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

test('store photo autoplay has a compact control matching its loading placeholder', async ({ page }) => {
    await openRegistrationOperation(page);
    await continueToIdentity(page);
    const control = page.getByRole('switch', { name: '사진 자동 넘김' });
    await expect(control).toBeChecked();
    await expect(page.locator('.reserve-store-photo-autoplay .ant-form-item-control-input')).toHaveCSS('min-height', '22px');
    expect(await control.evaluate(el => el.getBoundingClientRect().height)).toBe(22);
    await control.click();
    await expect(control).not.toBeChecked();
    await expect(page.getByText('휴대폰에서는 사진을 길게 누른 뒤 끌어주세요.', { exact: false })).toBeVisible();
});

test('store editing keeps a local draft and warns when the server base changed', async ({ page }) => {
    await page.goto('/store/99/edit');

    await expect(page.getByRole('heading', { name: '무엇을 수정하시겠어요?', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '임시저장' }))
        .toHaveClass(/reserve-btn--secondary/);
    await page.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '손님에게 이렇게 보여요.', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '수정 완료' }))
        .toHaveClass(/reserve-btn--primary/);
    await page.getByRole('button', { name: '이전 화면으로 돌아가기', exact: true }).click();
    await selectEditSection(page, '소개·사진', '손님에게 가게를 소개해주세요.');

    const nameInput = page.getByPlaceholder('가게 이름');
    await expect(nameInput).toHaveValue('서버 원본 가게');
    await nameInput.fill('내 수정 초안 가게');
    await page.getByRole('button', { name: '임시저장' }).click();
    await expect(page.getByText(/이 브라우저에 저장됨/)).toBeVisible();

    await page.reload();
    const conflictDialog = page.getByRole('dialog').filter({ hasText: '가게 정보가 달라졌어요' });
    await expect(conflictDialog).toBeVisible();
    await expect(conflictDialog).toContainText('초안과 현재 가게 정보가 달라요');
    await expect(conflictDialog).toContainText('초안을 불러오면 최신 값 일부가 바뀔 수 있어요.');
    await conflictDialog.getByRole('button', { name: '이어서 작성' }).click();
    await expect(page.getByPlaceholder('가게 이름')).toHaveValue('내 수정 초안 가게');
});

test('store registration uses the shared calendar and restores a browser-local draft', async ({ page }) => {
    await openRegistrationOperation(page);
    const draftButton = page.getByRole('button', { name: '임시저장' });
    await expect(draftButton).toHaveClass(/reserve-btn--secondary/);

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

    await continueToIdentity(page);
    await page.getByPlaceholder('가게 이름').fill('브라우저 임시저장 가게');
    await page.getByLabel('주소', { exact: true }).fill('경기 안산시 단원구');
    await page.getByRole('option').click();
    const postcode = page.locator('.reserve-store-form-address-box').filter({ hasText: /^15455$/ });
    await expect(postcode).toBeVisible();
    await page.getByLabel('연락처', { exact: true }).fill('02-1234-5678');
    await page.locator('.reserve-onboarding-step:not([hidden]) input[type="file"]').first().setInputFiles({
        name: 'draft-main.png',
        mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=', 'base64'),
    });
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.getByRole('heading', { name: '손님에게 이렇게 보여요.', exact: true })).toBeVisible();
    const submitButton = page.getByRole('button', { name: '등록 완료', exact: true });
    await expect(submitButton).toHaveClass(/reserve-btn--primary/);
    expect(await draftButton.evaluate(element => getComputedStyle(element).backgroundColor))
        .not.toBe(await submitButton.evaluate(element => getComputedStyle(element).backgroundColor));
    await page.getByRole('button', { name: '이전 화면으로 돌아가기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '손님에게 가게를 소개해주세요.', exact: true })).toBeVisible();
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

test('mobile registration and editing keep booking, payment and refund fields in their own questions', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), '모바일 레이아웃 전용 검증');

    const verifyFields = async labels => {
        for (const label of labels) {
            const control = page.getByLabel(label, { exact: true });
            await expect(control).toBeVisible();
            const box = await control.boundingBox();
            expect(box.width).toBeGreaterThan(100);
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    };

    await openRegistrationOperation(page);
    await verifyFields(['영업 시간', '운영 기간']);
    await expect(page.getByLabel('최대 예약 인원', { exact: true })).toBeHidden();
    await page.getByLabel('영업 시간', { exact: true }).click();
    const hours = page.getByRole('dialog', { name: '시간 범위 선택' });
    await hours.getByRole('textbox', { name: '시작 시간 직접 입력', exact: true }).fill('09:00');
    await hours.getByRole('textbox', { name: '종료 시간 직접 입력', exact: true }).fill('18:00');
    await hours.getByRole('button', { name: '선택 완료', exact: true }).click();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.getByRole('heading', { name: '예약을 어떤 규칙으로 받을까요?', exact: true })).toBeVisible();
    await verifyFields(['최대 예약 인원', '예약 가능 기간', '예약 마감']);
    await expect(page.getByLabel('노쇼 예약금', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await page.getByRole('radio', { name: '예약금 설정하기', exact: true }).click();
    await page.getByLabel('노쇼 예약금', { exact: true }).fill('1000');
    await page.getByRole('radio', { name: '나중 결제도 허용', exact: true }).click();
    await verifyFields(['노쇼 예약금', '결제 마감']);
    await expect(page.getByLabel('전액 환불 기준', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.getByRole('heading', { name: '예약금을 언제까지 돌려드릴까요?', exact: true })).toBeVisible();
    await verifyFields(['전액 환불 기준', '부분 환불 기준', '부분 환불율']);
    await expect(page.getByLabel('결제 마감', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: '다음', exact: true }).click();
    await expect(page.getByLabel('연락처', { exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: '예약 방식', exact: true })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await page.goto('/store/99/edit');
    await selectEditSection(page, '예약 접수 규칙', '예약을 어떤 규칙으로 받을까요?');
    await verifyFields(['최대 예약 인원', '예약 가능 기간', '예약 마감']);
    await expect(page.getByLabel('노쇼 예약금', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: '이전 화면으로 돌아가기', exact: true }).click();
    await selectEditSection(page, '노쇼 예약금·결제', '노쇼 예약금을 설정하실 건가요?');
    await page.getByRole('radio', { name: '예약금 설정하기', exact: true }).click();
    await page.getByLabel('노쇼 예약금', { exact: true }).fill('1000');
    await page.getByRole('radio', { name: '나중 결제도 허용', exact: true }).click();
    await verifyFields(['노쇼 예약금', '결제 마감']);
    await page.getByRole('button', { name: '이전 화면으로 돌아가기', exact: true }).click();
    await selectEditSection(page, '취소·환불 정책', '예약금을 언제까지 돌려드릴까요?');
    await verifyFields(['전액 환불 기준', '부분 환불 기준', '부분 환불율']);
    await page.getByRole('button', { name: '이전 화면으로 돌아가기', exact: true }).click();
    await selectEditSection(page, '예약 방식', '손님이 무엇을 선택하면 되나요?');
    await expect(page.getByLabel('시간 선택 간격', { exact: true })).toBeVisible();
    await expect(page.getByLabel('연락처', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: '이전 화면으로 돌아가기', exact: true }).click();
    await selectEditSection(page, '소개·사진', '손님에게 가게를 소개해주세요.');
    await expect(page.getByLabel('연락처', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('store editing reserves its selection skeleton while the initial data is delayed', async ({ page }) => {
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

    // Measure the held data request, not the first load of the form/authentication chunks.
    await page.goto('/store/register');
    await expect(page.getByRole('heading', { name: '어떤 가게를 운영하시나요?', exact: true })).toBeVisible();
    const skeleton = page.getByRole('status', { name: '가게 정보를 불러오는 중' });
    try {
        await page.goto('/store/99/edit', { waitUntil: 'domcontentloaded' });
        await expect(skeleton).toBeVisible();
        await expect(skeleton).toHaveAttribute('aria-busy', 'true');
        await expect(skeleton.locator('..').locator('.reserve-onboarding-heading')).toHaveText('무엇을 수정하시겠어요?');
        await expect(skeleton.locator('..').locator('.reserve-onboarding-edit-selection')).toBeVisible();
        const choices = skeleton.locator('..').locator('.reserve-service-domain-option');
        await expect(choices).toHaveCount(9);
        for (let index = 0; index < 9; index += 1) {
            const choice = choices.nth(index);
            await expect(choice).toBeVisible();
            const media = choice.locator('.reserve-service-domain-option__media > .reserve-skeleton-block');
            await expect(media).toHaveCount(1);
            await expect(media).toHaveCSS('width', '56px');
            await expect(media).toHaveCSS('height', '56px');
            await expect(choice.locator('.reserve-service-domain-option__label > .reserve-skeleton-block')).toHaveCSS('height', '20px');
        }
        const actions = skeleton.locator('..').locator('.reserve-store-form-skeleton > div[aria-hidden="true"] > .reserve-skeleton-block');
        await expect(actions).toHaveCount(2);
        for (let index = 0; index < 2; index += 1) {
            await expect(actions.nth(index)).toBeVisible();
            await expect(actions.nth(index)).toHaveCSS('height', page.viewportSize().width < 768 ? '44px' : '56px');
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    } finally {
        releaseEditRequest();
    }
    await expect(page.getByRole('group', { name: '수정할 항목', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '무엇을 수정하시겠어요?', exact: true })).toBeVisible();
    await expect(skeleton).toBeHidden();
});
