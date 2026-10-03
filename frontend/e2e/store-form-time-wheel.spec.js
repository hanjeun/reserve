import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off' });

const business = { id: 41, name: '시간 선택 검증 사업자', email: 'time-wheel@example.test', role: 'BUSINESS', termsAgreed: true };
const emptyPage = { content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } };

test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (!path.startsWith('/api/')) {
            await route.continue();
            return;
        }
        if (request.method() !== 'GET') {
            throw new Error(`Time picker verification must not write to the API: ${request.method()} ${path}`);
        }
        let data = emptyPage;
        if (path === '/api/member/me') data = business;
        if (path === '/api/stores/99/edit') data = {
            id: 99, ownerId: 41, name: '시간 선택 검증 가게', category: '카페',
            phone: '02-1234-5678', address: '서울특별시 중구 세종대로 1',
            description: '시간 선택 검증용 가게', openTime: '09:00', closeTime: '18:00',
            breakStartTime: '12:00', breakEndTime: '13:00',
            closedDays: [], closedDates: [], detailImageUrls: [],
        };
        if (path.endsWith('/waiting-count') || path === '/api/chat/my/unread') data = 0;
        await route.fulfill({ json: { success: true, data } });
    });
});

const openHours = async page => {
    await page.goto('/store/99/edit');
    const trigger = page.getByLabel('영업 시간', { exact: true });
    await expect(trigger).toContainText('09:00');
    await trigger.scrollIntoViewIfNeeded();
    const pageBefore = await page.evaluate(() => ({ scrollY: window.scrollY, headingTop: document.querySelector('main h2').getBoundingClientRect().top }));
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '시간 범위 선택' });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toHaveClass(/ant-zoom-(appear|enter)(?:-[a-z]+)?(?:\s|$)/);
    const hours = dialog.getByRole('listbox', { name: '시', exact: true });
    await expect(hours.getByRole('option', { selected: true })).toHaveText('09');
    await expect.poll(() => hours.getByRole('option', { selected: true }).evaluate(element => {
        const wheel = element.parentElement.getBoundingClientRect();
        const row = element.getBoundingClientRect();
        return Math.abs(row.top + row.height / 2 - wheel.top - wheel.height / 2);
    })).toBeLessThan(1);
    const band = await dialog.locator('.reserve-time-wheels').evaluate(element => {
        const style = getComputedStyle(element, '::before');
        const bounds = element.getBoundingClientRect();
        const scale = bounds.height / element.offsetHeight;
        const row = element.querySelector('[role="listbox"][aria-label="시"] [aria-selected="true"]').getBoundingClientRect();
        const part = document.querySelector('.reserve-time-parts .reserve-form-cal-part');
        return {
            radius: style.borderRadius,
            partRadius: getComputedStyle(part).borderRadius,
            centerDifference: Math.abs(bounds.bottom - (Number.parseFloat(style.bottom) + Number.parseFloat(style.height) / 2) * scale - row.top - row.height / 2),
        };
    });
    expect(band.radius).toBe(band.partRadius);
    expect(band.centerDifference).toBeLessThan(1);
    return { trigger, dialog, pageBefore };
};

const selectedMinute = dialog => dialog.getByRole('listbox', { name: '분', exact: true }).getByRole('option', { selected: true });
const centeredMinute = async dialog => {
    await expect.poll(() => selectedMinute(dialog).evaluate(element => {
        const wheel = element.parentElement.getBoundingClientRect();
        const row = element.getBoundingClientRect();
        return Math.abs(row.top + row.height / 2 - wheel.top - wheel.height / 2);
    })).toBeLessThan(1);
};

test('an empty range requires both times and keeps calendar styling within the viewport', async ({ page }) => {
    await page.goto('/store/register');
    const trigger = page.getByLabel('영업 시간', { exact: true });
    const dimensions = await trigger.evaluate(element => {
        const calendar = document.querySelector('.reserve-form-date-trigger:not(.reserve-form-time-trigger)');
        return {
            timeHeight: element.getBoundingClientRect().height,
            calendarHeight: calendar.getBoundingClientRect().height,
            timeRadius: getComputedStyle(element).borderRadius,
            calendarRadius: getComputedStyle(calendar).borderRadius,
        };
    });
    expect(dimensions.timeHeight).toBe(dimensions.calendarHeight);
    expect(dimensions.timeRadius).toBe(dimensions.calendarRadius);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '시간 범위 선택' });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.top >= 0 && bounds.bottom <= innerHeight + 1;
    })).toBe(true);
    await dialog.getByRole('button', { name: '다음', exact: true }).click();
    await expect(trigger).toContainText('시작 시간');
    await dialog.getByRole('listbox', { name: '오전·오후' }).press('ArrowDown');
    await dialog.getByRole('listbox', { name: '시', exact: true }).press('ArrowUp');
    await dialog.getByRole('listbox', { name: '분', exact: true }).press('PageDown');
    await dialog.getByRole('button', { name: '선택 완료' }).click();
    await expect(trigger).toContainText('09:00');
    await expect(trigger).toContainText('21:05');
});

test('cancel and Escape preserve form values and return focus to the trigger', async ({ page }) => {
    const { trigger, dialog } = await openHours(page);
    await dialog.getByRole('listbox', { name: '시', exact: true }).press('ArrowUp');
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toHaveText(/09:00.*18:00/);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole('listbox', { name: '분', exact: true }).press('PageDown');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toHaveText(/09:00.*18:00/);
    await expect(trigger).toBeFocused();
});

test('native mouse wheel input selects the centered minute and leaves the page in place', async ({ page }) => {
    const { trigger, dialog } = await openHours(page);
    const minutes = dialog.getByRole('listbox', { name: '분', exact: true });
    const before = await page.evaluate(() => window.scrollY);
    await minutes.hover();
    await page.mouse.wheel(0, 132);
    await expect(selectedMinute(dialog)).not.toHaveText('00');
    await centeredMinute(dialog);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    const minute = await selectedMinute(dialog).innerText();
    await dialog.getByRole('button', { name: '선택 완료' }).click();
    await expect(trigger).toHaveText(new RegExp(`09:${minute}.*18:00`));
});

test('mouse dragging snaps a row and does not turn the release into a second selection', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const { trigger, dialog } = await openHours(page);
    const minutes = dialog.getByRole('listbox', { name: '분', exact: true });
    await minutes.hover();
    const bounds = await minutes.boundingBox();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 75, { steps: 8 });
    const movement = observeScroll(minutes);
    await page.mouse.up();
    expect((await movement).some(top => top > 75 && top < 88)).toBe(true);
    await expect(selectedMinute(dialog)).toHaveText('02');
    await centeredMinute(dialog);
    await dialog.getByRole('button', { name: '선택 완료' }).click();
    await expect(trigger).toHaveText(/09:02.*18:00/);
});

test('fine pixel wheel deltas support trackpad-style scrolling', async ({ page }) => {
    const { dialog } = await openHours(page);
    await dialog.getByRole('listbox', { name: '분', exact: true }).hover();
    for (let step = 0; step < 12; step += 1) await page.mouse.wheel(0, 11);
    await expect(selectedMinute(dialog)).not.toHaveText('00');
    await centeredMinute(dialog);
});

test('native touch scrolling selects a centered row without scrolling the form', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Native touch input is covered by the mobile browser project.');
    const { dialog } = await openHours(page);
    const minutes = dialog.getByRole('listbox', { name: '분', exact: true });
    await minutes.hover();
    const bounds = await minutes.boundingBox();
    const before = await page.evaluate(() => window.scrollY);
    const cdp = await page.context().newCDPSession(page);
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let offset = 20; offset <= 80; offset += 20) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - offset }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(selectedMinute(dialog)).not.toHaveText('00');
    await centeredMinute(dialog);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await cdp.detach();
});

test('session times use unique removable chips and save only after confirmation', async ({ page }) => {
    await page.goto('/store/register');
    await page.getByLabel('예약 방식', { exact: true }).click();
    await page.getByText('회차제', { exact: true }).click();
    const trigger = page.getByLabel('회차 시각', { exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '회차 시각 선택' });
    await dialog.getByRole('button', { name: '09:00 회차 추가' }).click();
    await dialog.getByRole('button', { name: '09:00 회차 추가' }).click();
    await expect(dialog.getByRole('button', { name: '09:00 회차 삭제' })).toHaveCount(1);
    await dialog.getByRole('listbox', { name: '시', exact: true }).press('ArrowDown');
    await dialog.getByRole('button', { name: '10:00 회차 추가' }).click();
    await expect(trigger).toHaveText('회차 시각 선택');
    await dialog.getByRole('button', { name: '09:00 회차 삭제' }).click();
    await dialog.getByRole('button', { name: '선택 완료' }).click();
    await expect(trigger).toHaveText('10:00');
});

test('break-time bounds remain enforced by the existing form validation', async ({ page }) => {
    await page.goto('/store/99/edit');
    const trigger = page.getByLabel('브레이크 타임', { exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '시간 범위 선택' });
    await dialog.getByRole('listbox', { name: '오전·오후' }).press('Home');
    await dialog.getByRole('listbox', { name: '시', exact: true }).press('Home');
    await dialog.getByRole('button', { name: '선택 완료' }).click();
    await expect(trigger).toHaveText(/01:00.*13:00/);
    await expect(page.getByText(/브레이크 타임은 영업시간/)).toBeVisible();
    await expect(trigger).not.toHaveAttribute('aria-invalid', /.*/);
    await expect(trigger).toHaveAttribute('aria-describedby', /breakTimes_help/);
    await trigger.click();
    await expect(dialog.getByRole('textbox', { name: '시작 직접 입력' })).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByRole('textbox', { name: '종료 직접 입력' })).toHaveAttribute('aria-invalid', 'true');
});

test('keyboard selection also works with reduced motion enabled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { dialog, trigger } = await openHours(page);
    const minutes = dialog.getByRole('listbox', { name: '분', exact: true });
    await minutes.press('End');
    expect(await minutes.evaluate(element => element.scrollTop)).toBe(59 * 44);
    await centeredMinute(dialog);
    await dialog.getByRole('button', { name: '선택 완료' }).click();
    await expect(trigger).toHaveText(/09:59.*18:00/);
});

const observeScroll = wheel => wheel.evaluate(element => new Promise(resolve => {
    const positions = [];
    const start = performance.now();
    const sample = now => {
        positions.push(element.scrollTop);
        if (now - start >= 320) resolve(positions);
        else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
}));

test('normal motion moves through intermediate positions and settles on the requested minute', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const { dialog, trigger } = await openHours(page);
    const minutes = dialog.getByRole('listbox', { name: '분', exact: true });
    const movement = observeScroll(minutes);
    await minutes.press('PageDown');
    const positions = await movement;
    expect(positions.some(top => top > 0 && top < 5 * 44)).toBe(true);
    await expect(selectedMinute(dialog)).toHaveText('05');
    await centeredMinute(dialog);
    await dialog.getByRole('button', { name: '선택 완료' }).click();
    await expect(trigger).toHaveText(/09:05.*18:00/);
});

test('a new key or range tab supersedes an unfinished animation without a late selection', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const { dialog } = await openHours(page);
    const minutes = dialog.getByRole('listbox', { name: '분', exact: true });
    await minutes.press('End');
    await minutes.press('Home');
    await centeredMinute(dialog);
    await observeScroll(minutes);
    await expect(selectedMinute(dialog)).toHaveText('00');
    await centeredMinute(dialog);
    await minutes.press('End');
    await dialog.getByRole('button', { name: /종료 시간.*18:00/ }).click();
    await observeScroll(minutes);
    await expect(selectedMinute(dialog)).toHaveText('00');
    await centeredMinute(dialog);
    await expect(dialog.getByRole('listbox', { name: '시', exact: true }).getByRole('option', { selected: true })).toHaveText('06');
});

const equalActions = async (dialog, confirmText) => {
    const cancel = dialog.getByRole('button', { name: '취소', exact: true });
    const confirm = dialog.getByRole('button', { name: confirmText, exact: true });
    const details = async button => button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { height: rect.height, width: rect.width, radius: style.borderRadius, border: style.borderTopStyle, borderWidth: style.borderTopWidth };
    });
    // Pointer targets and physical widths are meaningful after the modal entrance finishes.
    await expect(dialog).not.toHaveClass(/ant-zoom-(appear|enter)(?:-[a-z]+)?(?:\s|$)/);
    await expect.poll(async () => (await details(cancel)).height).toBe(36);
    const cancelSize = await details(cancel);
    const confirmSize = await details(confirm);
    expect(confirmSize.width).toBeGreaterThanOrEqual(cancelSize.width);
    if (confirmText === '선택 완료' || confirmText === '보내기') expect(confirmSize.width).toBeGreaterThan(cancelSize.width);
    expect(cancelSize.height).toBe(confirmSize.height);
    expect(cancelSize.radius).toBe(confirmSize.radius);
    expect(cancelSize.border).toBe('solid');
    expect(cancelSize.borderWidth).toBe('1px');
    expect(confirmSize.borderWidth).toBe('1px');
    return cancelSize.width;
};

const nativeSwipe = async (page, x, y, dx, dy) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 5; step += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 5, y: y + dy * step / 5 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
};

test('time modal actions match and background/edge touches keep the original page position', async ({ page, isMobile }) => {
    const { dialog, pageBefore } = await openHours(page);
    await equalActions(dialog, '선택 완료');
    await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('fixed');
    if (isMobile) {
        await nativeSwipe(page, 4, 300, 0, -100);
        const bounds = await dialog.getByRole('listbox', { name: '분', exact: true }).boundingBox();
        await nativeSwipe(page, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, 0, 70);
        await expect(selectedMinute(dialog)).toHaveText('00');
    } else {
        await page.mouse.move(4, 300);
        await page.mouse.wheel(0, 100);
    }
    expect(await page.evaluate(() => document.querySelector('main h2').getBoundingClientRect().top)).toBeCloseTo(pageBefore.headingTop, 0);
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(pageBefore.scrollY);
    await expect.poll(() => page.evaluate(() => document.body.style.position)).not.toBe('fixed');
});

test('calendar modal contains swipes, preserves month navigation and has the same paired actions', async ({ page, isMobile }) => {
    await page.goto('/store/register');
    const trigger = page.getByLabel('운영 기간', { exact: true });
    await trigger.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '날짜 범위 선택' });
    await equalActions(dialog, '선택 완료');
    await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('fixed');
    const month = dialog.getByText(/\d{4}년 \d{1,2}월/);
    const previous = await month.innerText();
    if (isMobile) {
        await nativeSwipe(page, 4, 300, 0, 100);
        const day = await dialog.locator('.reserve-form-cal-cell').nth(10).boundingBox();
        await nativeSwipe(page, day.x + day.width / 2, day.y + day.height / 2, -90, 0);
    } else await dialog.getByRole('button', { name: '다음 달', exact: true }).click();
    await expect(month).not.toHaveText(previous);
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toContainText('시작일');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
});

test('the shared inquiry form uses matching bordered actions and releases the background lock', async ({ page }) => {
    await page.goto('/store/register');
    const trigger = page.getByRole('button', { name: '문의하기', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '문의하기', exact: true });
    await equalActions(dialog, '보내기');
    await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('fixed');
    await dialog.getByPlaceholder('문의 제목을 입력하세요').fill('로컬 스크롤 확인');
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.body.style.position)).not.toBe('fixed');
});

test('paired picker actions stay inside a 320px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/store/register');
    await page.getByLabel('영업 시간', { exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '시간 범위 선택' });
    const cancelWidth = await equalActions(dialog, '다음');
    await dialog.getByRole('button', { name: '다음', exact: true }).click();
    expect(await equalActions(dialog, '선택 완료')).toBe(cancelWidth);
    expect(await dialog.locator('.reserve-time-footer button').evaluateAll(elements => elements.every(element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    }))).toBe(true);
});
