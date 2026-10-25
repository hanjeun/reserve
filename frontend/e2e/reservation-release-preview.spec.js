import { expect, test } from '@playwright/test';
import process from 'node:process';
import { installReleasePreview, store, TICKET } from './fixtures/reservation-release-preview';

test.skip(process.env.RESERVE_RELEASE_PREVIEW !== '1', 'Explicit local release preview only');
test.use({ channel: 'chrome', screenshot: 'off', trace: 'off', video: 'off' });

async function prepare(page, info) {
    await page.setViewportSize(info.project.name === 'chromium' ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    return installReleasePreview(page);
}
async function selectReservation(page, { navigate = true } = {}) {
    if (navigate) await page.goto('/store/81');
    const date = await page.evaluate(() => {
        const future = new Date(); future.setDate(future.getDate() + 1);
        return { nextMonth: future.getMonth() !== new Date().getMonth(), label: `${future.getMonth() + 1}월 ${future.getDate()}일` };
    });
    await page.getByRole('button', { name: '날짜 선택', exact: true }).click();
    const calendar = page.getByRole('dialog', { name: '예약 날짜 선택' });
    if (date.nextMonth) await calendar.getByRole('button', { name: '다음 달', exact: true }).click();
    await calendar.getByRole('button', { name: date.label, exact: true }).click();
    await expect(calendar).toBeHidden();
    await page.locator('.rsv-time-pill').filter({ hasText: '14:00' }).click();
    await page.getByPlaceholder('요청 사항을 입력하세요.').fill('처음 방문해요. 수업 안내 부탁드려요.');
    await page.getByRole('button', { name: '예약 신청하기', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '예약 입장 대기' });
    await expect(dialog.getByText('3번째')).toBeVisible();
    return dialog;
}
const savedAttempt = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('reserve-admission-attempts-v1'))?.attempts['release-preview']);

test('queue waiting, admitted, and manual return to the reservation form', async ({ page }, info) => {
    test.skip(process.env.RESERVE_UI_PREVIEW_MANUAL === '1', 'Queue manual preview moved: npm run preview:admission -- [--mobile]');
    test.setTimeout(process.env.RESERVE_UI_PREVIEW_MANUAL === '1' ? 0 : 60_000);
    const fixture = await prepare(page, info);
    const dialog = await selectReservation(page);
    await expect(dialog.getByRole('button', { name: '예약 계속하기' })).toBeDisabled();

    const original = await savedAttempt(page);
    const joined = fixture.joins;
    await page.reload();
    await selectReservation(page, { navigate: false });
    expect(await savedAttempt(page)).toMatchObject({ ticket: TICKET, requestId: original.requestId });
    expect(fixture.joins).toBe(joined);

    for (const position of [2, 1]) {
        fixture.admissionPosition = position;
        await expect(dialog.getByText(`${position}번째`, { exact: true })).toBeVisible();

    }
    fixture.admissionState = 'ADMITTED';
    await expect(dialog.getByText('예약할 차례예요.')).toBeVisible();

    expect(fixture.reservations).toHaveLength(0);
    await dialog.getByRole('button', { name: '예약 계속하기' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('timer', { name: '예약 입장 남은 시간' })).toBeVisible();
    await expect(page.getByPlaceholder('요청 사항을 입력하세요.')).toHaveValue('처음 방문해요. 수업 안내 부탁드려요.');
    expect(fixture.reservations).toHaveLength(0);
    expect(await savedAttempt(page)).toMatchObject({ ticket: TICKET, requestId: original.requestId });

    expect(fixture.errors).toEqual([]);
});

test('queue expiry, temporary errors, explicit choices, and cancellation recovery', async ({ page }, info) => {
    const fixture = await prepare(page, info);
    const dialog = await selectReservation(page);
    const original = await savedAttempt(page);
    fixture.statusErrors = 1;
    await expect(dialog.getByRole('alert')).toBeVisible();

    expect(await savedAttempt(page)).toMatchObject({ ticket: TICKET, requestId: original.requestId });
    await dialog.getByRole('button', { name: '다시 확인', exact: true }).click();
    await expect(dialog.getByText('3번째')).toBeVisible();
    fixture.admissionState = 'EXPIRED';
    await expect(dialog.getByText('입장 시간이 지났어요.')).toBeVisible();

    const joins = fixture.joins;
    await expect(dialog.getByRole('button', { name: '다시 대기하기' })).toBeVisible();
    expect(fixture.joins).toBe(joins);
    fixture.admissionState = 'WAITING';
    await dialog.getByRole('button', { name: '다시 대기하기' }).click();
    await expect(dialog.getByText('3번째')).toBeVisible();
    const renewed = await savedAttempt(page);
    expect(renewed.requestId).not.toBe(original.requestId);
    await expect(dialog.locator('.ant-modal-close')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    expect(await savedAttempt(page)).toMatchObject({ requestId: renewed.requestId });
    expect(fixture.cancels).toBe(0);
    fixture.cancelErrors = 1;
    await dialog.getByRole('button', { name: '대기 취소', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();

    await dialog.getByRole('button', { name: '대기 취소 다시 시도', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await savedAttempt(page)).toBeUndefined();
    expect(fixture.cancels).toBe(2);

    expect(fixture.errors).toEqual([]);
});

test('account security forms preserve settings order', async ({ page }, info) => {
    const fixture = await prepare(page, info);
    await page.goto('/my-page');
    const security = page.getByRole('region', { name: '로그인 및 보안', exact: true });
    await expect(security.getByRole('button', { name: '비밀번호 변경', exact: true })).toBeVisible();
    const settings = page.getByText('디자인', { exact: true });
    const settingsCard = settings.locator('..');
    const initialHeight = await settingsCard.evaluate(element => element.getBoundingClientRect().height);
    if (info.project.name !== 'chromium') {
        const positions = await Promise.all(['디자인', '알림 설정', '가게 작성 설정'].map(text => page.getByText(text, { exact: true }).evaluate(element => element.getBoundingClientRect().top + scrollY)));
        const securityTop = await security.evaluate(element => element.getBoundingClientRect().top + scrollY);
        expect(positions[0]).toBeLessThan(positions[1]); expect(positions[1]).toBeLessThan(positions[2]);
        expect(positions[2]).toBeLessThan(securityTop);
    }

    await security.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
    await expect(security.getByPlaceholder('현재 비밀번호')).toBeVisible();
    await expect.poll(() => settingsCard.evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(initialHeight, 1);
    await security.scrollIntoViewIfNeeded();

    await security.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(security.getByPlaceholder('현재 비밀번호')).toBeHidden();
    await security.getByRole('button', { name: 'Google 로그인 연결 해제', exact: true }).click();
    await expect(security.getByText('RESERVE의 소셜 로그인 연결을 해제해요.', { exact: false })).toBeVisible();
    await expect.poll(() => settingsCard.evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(initialHeight, 1);

    expect(fixture.errors).toEqual([]);
});

test('messenger home, store search, room entry, and search restoration', async ({ page }, info) => {
    const fixture = await prepare(page, info);
    if (info.project.name === 'chromium') {
        await page.goto('/my-page');
        await page.getByRole('button', { name: '메시지 열기', exact: true }).click();
    } else await page.goto('/messages');
    const messenger = page.locator('.reserve-messenger').last();
    await expect(messenger.getByRole('button', { name: '가게에 문의', exact: true })).toHaveCount(0);

    await messenger.getByRole('button', { name: '대화', exact: true }).click();
    await messenger.getByRole('button', { name: '가게 찾기', exact: true }).click();
    const search = messenger.getByRole('searchbox', { name: '가게 이름 또는 주소' });
    await search.fill('공방');
    const result = messenger.getByRole('button', { name: `${store.name}, 문의 시작`, exact: true });
    await expect(result).toBeVisible();
    await expect(messenger.getByRole('button', { name: '내 미리보기 공방, 내 가게에는 문의를 보낼 수 없어요.', exact: true })).toHaveAttribute('aria-disabled', 'true');
    expect(fixture.roomOpens).toBe(0);

    await result.click();
    await expect(messenger.getByText('안녕하세요. 궁금한 점을 편하게 남겨주세요.', { exact: true })).toBeVisible();
    await expect(messenger).not.toHaveClass(/is-opening-thread/);

    await messenger.getByRole('button', { name: '가게 검색으로 돌아가기', exact: true }).click();
    await expect(search).toHaveValue('공방');
    await expect(result).toBeFocused();

    expect(fixture.roomOpens).toBe(1);
    expect(fixture.errors).toEqual([]);
});

test('discovery and waiting retain one search entry, refresh, and waiting detail', async ({ page }, info) => {
    const fixture = await prepare(page, info);
    await page.goto('/stores');
    const explore = page.locator('.reserve-explore-filters').first();
    const exploreCount = explore.locator('.reserve-explore-count');
    await expect(exploreCount).toHaveText('7개 가게');
    const baselineColor = await exploreCount.evaluate(element => getComputedStyle(element).color);
    const exploreTop = (await explore.boundingBox()).y;
    const refresh = page.getByRole('button', { name: '새로고침', exact: true });
    await expect(refresh).toBeVisible();
    const refreshGlyph = await refresh.locator('svg').boundingBox();
    expect(refreshGlyph.width).toBeCloseTo(20, 0); expect(refreshGlyph.height).toBeCloseTo(20, 0);

    fixture.storeListError = 403;
    await page.getByPlaceholder('가게 검색', { exact: true }).fill('확인필요');
    await expect(exploreCount).toHaveText('목록 확인 필요');
    await expect(exploreCount).toHaveCSS('color', baselineColor);

    fixture.storeListError = 0;
    await refresh.click();
    await expect(exploreCount).toHaveText('7개 가게');
    await expect(refresh).not.toHaveAttribute('aria-busy', 'true');

    await page.goto('/waiting');
    const waiting = page.getByLabel('웨이팅 가게 보기', { exact: true });
    await expect(waiting.locator('.reserve-explore-count')).toHaveText('1개 가게');
    expect((await waiting.boundingBox()).y).toBeCloseTo(exploreTop, 0);
    await expect(waiting.locator('.reserve-explore-count')).toHaveCSS('color', baselineColor);

    fixture.waitingListError = 403;
    await page.getByPlaceholder('웨이팅 가게 검색', { exact: true }).fill('확인필요');
    await expect(waiting.locator('.reserve-explore-count')).toHaveText('목록 확인 필요');
    await expect(waiting.locator('.reserve-explore-count')).toHaveCSS('color', baselineColor);

    fixture.waitingListError = 0;
    await page.getByRole('button', { name: '새로고침', exact: true }).click();
    const hint = page.getByRole('button', { name: '웨이팅 정보: 접수 가능, 대기 3팀', exact: true });
    await expect(hint).toBeVisible();
    await hint.click();
    await expect(page.locator('.reserve-info-hint-popup').getByText('대기 3팀', { exact: true })).toBeVisible();


    await page.goto('/my-reservations?tab=waiting');
    const detailTrigger = page.getByRole('button', { name: `${store.name} 17번 웨이팅 상세 보기`, exact: true });
    await expect(detailTrigger).toBeVisible();

    await detailTrigger.click();
    const detail = page.getByRole('dialog', { name: '웨이팅 상세', exact: true });
    await expect(detail.getByText('내 앞에 2팀이 있어요.', { exact: true })).toBeVisible();
    await expect(detail.getByText('17번', { exact: true })).toBeVisible();

    expect(fixture.errors).toEqual([]);
});
