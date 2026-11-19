import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { installReleasePreview, PUBLIC_ID, store, TICKET } from './fixtures/reservation-release-preview';

test.skip(process.env.RESERVE_RELEASE_PREVIEW !== '1', 'Explicit local release preview only');
test.use({ channel: 'chrome', screenshot: 'off', trace: 'off', video: 'off' });

const output = path.resolve('test-results/release-preview-20261023');
async function capture(page, info, label, fullPage = false) {
    const manual = process.env.RESERVE_UI_PREVIEW_MANUAL === '1';
    if (fullPage) {
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    await page.evaluate(() => document.fonts.ready);
    for (const image of await page.locator('.slick-active img:visible, .reserve-feed-media-item img:visible, .reserve-chat-photo img:visible, img[src*="/__release-preview__/"]:visible, img[src*="/og-image.png"]:visible, .ant-image-preview-img:visible').all()) {
        await expect(image).toHaveJSProperty('complete', true);
        await expect.poll(() => image.evaluate(element => element.naturalWidth)).toBeGreaterThan(0);
    }
    if (manual) await page.evaluate(() => Promise.all(document.getAnimations()
        .filter(motion => Number.isFinite(motion.effect?.getComputedTiming().endTime))
        .map(motion => motion.finished.catch(() => undefined))));
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `${info.project.name === 'chromium' ? 'pc' : 'mobile'}-${label}.png`),
        fullPage, animations: manual ? 'allow' : 'disabled' });
    if (manual) await page.pause();
}
async function prepare(page, info) {
    await page.setViewportSize(info.project.name === 'chromium' ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    return installReleasePreview(page);
}
async function selectReservation(page, { navigate = true } = {}) {
    if (navigate) await page.goto('/store/00000000-0000-4000-8000-000000000081');
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
    await capture(page, info, '01-admission-waiting');
    const original = await savedAttempt(page);
    const joined = fixture.joins;
    await page.reload();
    await selectReservation(page, { navigate: false });
    expect(await savedAttempt(page)).toMatchObject({ ticket: TICKET, requestId: original.requestId });
    expect(fixture.joins).toBe(joined);
    await capture(page, info, '33-admission-f5-restored');
    for (const position of [2, 1]) {
        fixture.admissionPosition = position;
        await expect(dialog.getByText(`${position}번째`, { exact: true })).toBeVisible();
        await capture(page, info, `${position === 2 ? '34' : '35'}-admission-position-${position}`);
    }
    fixture.admissionState = 'ADMITTED';
    await expect(dialog.getByText('예약할 차례예요.')).toBeVisible();
    await capture(page, info, '02-admission-admitted');
    expect(fixture.reservations).toHaveLength(0);
    await dialog.getByRole('button', { name: '예약 계속하기' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('timer', { name: '예약 입장 남은 시간' })).toBeVisible();
    await expect(page.getByPlaceholder('요청 사항을 입력하세요.')).toHaveValue('처음 방문해요. 수업 안내 부탁드려요.');
    expect(fixture.reservations).toHaveLength(0);
    expect(await savedAttempt(page)).toMatchObject({ ticket: TICKET, requestId: original.requestId });
    await capture(page, info, '03-admission-returned-form');
    expect(fixture.errors).toEqual([]);
});

test('queue expiry, temporary errors, explicit choices, and cancellation recovery', async ({ page }, info) => {
    const fixture = await prepare(page, info);
    const dialog = await selectReservation(page);
    const original = await savedAttempt(page);
    fixture.statusErrors = 1;
    await expect(dialog.getByRole('alert')).toBeVisible();
    await capture(page, info, '04-admission-503');
    expect(await savedAttempt(page)).toMatchObject({ ticket: TICKET, requestId: original.requestId });
    await dialog.getByRole('button', { name: '다시 확인', exact: true }).click();
    await expect(dialog.getByText('3번째')).toBeVisible();
    fixture.admissionState = 'EXPIRED';
    await expect(dialog.getByText('입장 시간이 지났어요.')).toBeVisible();
    await capture(page, info, '05-admission-expired');
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
    await capture(page, info, '06-admission-cancel-retry');
    await dialog.getByRole('button', { name: '대기 취소 다시 시도', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await savedAttempt(page)).toBeUndefined();
    expect(fixture.cancels).toBe(2);
    await capture(page, info, '07-admission-cancelled-form');
    expect(fixture.errors).toEqual([]);
});

test('account security forms, settings order, and public profile photo actions', async ({ page }, info) => {
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
    await capture(page, info, '08-account-security-default', true);
    await security.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
    await expect(security.getByPlaceholder('현재 비밀번호')).toBeVisible();
    await expect.poll(() => settingsCard.evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(initialHeight, 1);
    await security.scrollIntoViewIfNeeded();
    await capture(page, info, '09-account-password-form', true);
    await security.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(security.getByPlaceholder('현재 비밀번호')).toBeHidden();
    await security.getByRole('button', { name: 'Google 로그인 연결 해제', exact: true }).click();
    await expect(security.getByText('RESERVE의 소셜 로그인 연결을 해제해요.', { exact: false })).toBeVisible();
    await expect.poll(() => settingsCard.evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(initialHeight, 1);
    await capture(page, info, '10-account-unlink-form', true);
    await page.getByRole('tab').filter({ hasText: '피드 프로필' }).click();
    const photoLabel = page.locator('.reserve-account-public-profile-avatar .ant-form-item-label');
    const viewProfile = page.getByRole('link', { name: '내 피드 프로필 보기', exact: true });
    await expect(viewProfile).toBeVisible();
    await capture(page, info, '11-public-profile-photo', true);
    const alignment = await photoLabel.evaluate(element => {
        const label = element.querySelector('label'); const title = label.querySelector('span'); const action = label.querySelector('a');
        const after = getComputedStyle(label, '::after');
        return { title: title.getBoundingClientRect().toJSON(), action: action.getBoundingClientRect().toJSON(), label: label.getBoundingClientRect().toJSON(),
            after: { content: after.content, display: after.display, width: after.width, marginLeft: after.marginLeft } };
    });
    expect.soft(Math.abs(alignment.title.y + alignment.title.height / 2 - alignment.action.y - alignment.action.height / 2)).toBeLessThan(3);
    expect.soft(Math.abs(alignment.label.right - alignment.action.right)).toBeLessThan(3);
    if (Math.abs(alignment.label.right - alignment.action.right) >= 3) console.log('Public profile photo label geometry:', JSON.stringify(alignment));
    await page.getByRole('button', { name: '기본 이미지로 변경', exact: true }).click();
    await expect(page.getByRole('button', { name: '계정 사진으로 되돌리기', exact: true })).toBeVisible();
    await capture(page, info, '12-public-profile-default-image', true);
    await page.getByRole('tabpanel').filter({ has: page.getByText('피드 프로필 사진', { exact: true }) })
        .getByRole('button', { name: '저장', exact: true }).click();
    await expect.poll(() => fixture.lastProfileSave?.avatarSource).toBe('NONE');
    await viewProfile.click();
    await expect(page).toHaveURL(new RegExp(`/feed/u/${PUBLIC_ID}`));
    await expect(page.getByRole('heading', { name: '피드 프로필', exact: true })).toBeVisible();
    await capture(page, info, '13-public-profile-view');
    expect(fixture.errors).toEqual([]);
});

test('messenger home, store search, room entry, photo preview, and search restoration', async ({ page }, info) => {
    const fixture = await prepare(page, info);
    if (info.project.name === 'chromium') {
        await page.goto('/my-page');
        await page.getByRole('button', { name: '메시지 열기', exact: true }).click();
    } else await page.goto('/messages');
    const messenger = page.locator('.reserve-messenger').last();
    await expect(messenger.getByRole('button', { name: '가게에 문의', exact: true })).toHaveCount(0);
    await capture(page, info, '14-messenger-home');
    await messenger.getByRole('button', { name: '대화', exact: true }).click();
    await messenger.getByRole('button', { name: '채팅 검색', exact: true }).click();
    const search = messenger.getByRole('searchbox', { name: '대화 상대, 메시지, 가게 검색' });
    await search.fill('공방');
    const result = messenger.getByRole('button', { name: `${store.name}, 문의 시작`, exact: true });
    await expect(result).toBeVisible();
    await expect(messenger.getByRole('button', { name: '내 미리보기 공방, 내 가게에는 문의를 보낼 수 없어요.', exact: true })).toHaveAttribute('aria-disabled', 'true');
    expect(fixture.roomOpens).toBe(0);
    await capture(page, info, '15-messenger-store-search');
    await result.click();
    await expect(messenger.getByText('안녕하세요. 궁금한 점을 편하게 남겨주세요.', { exact: true })).toBeVisible();
    await expect(messenger).not.toHaveClass(/is-opening-thread/);
    await capture(page, info, '16-messenger-store-room');
    const photo = messenger.getByRole('button', { name: '사진 크게 보기', exact: true });
    await expect(photo).toBeVisible();
    await photo.focus();
    if (info.project.name === 'chromium') await photo.hover();
    await capture(page, info, '17-messenger-photo-hint');
    if (info.project.name === 'chromium') await photo.click();
    else await photo.tap();
    await expect(page.locator('.reserve-image-preview')).toBeVisible();
    await capture(page, info, '18-messenger-photo-expanded');
    await page.locator('.reserve-image-preview .ant-image-preview-close').click();
    await expect(page.locator('.reserve-image-preview')).toBeHidden();
    await photo.press('Enter');
    await expect(page.locator('.reserve-image-preview')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.reserve-image-preview')).toBeHidden();
    await messenger.getByRole('button', { name: '검색 결과로 돌아가기', exact: true }).click();
    await expect(search).toHaveValue('공방');
    await expect(result).toBeFocused();
    await capture(page, info, '19-messenger-restored-search');
    expect(fixture.roomOpens).toBe(1);
    expect(fixture.errors).toEqual([]);
});

test('store and feed photos share enlarge hints and keep the feed header aligned', async ({ page }, info) => {
    const fixture = await prepare(page, info);
    await page.goto('/store/00000000-0000-4000-8000-000000000081');
    const storePhoto = page.locator('.slick-active .reserve-photo-preview-trigger').first();
    await expect(storePhoto).toBeVisible();
    await storePhoto.focus();
    if (info.project.name === 'chromium') await storePhoto.hover();
    await capture(page, info, '20-store-photo-hint');
    await storePhoto.press('Enter');
    await expect(page.locator('.reserve-image-preview')).toBeVisible();
    await capture(page, info, '21-store-photo-expanded');
    await page.locator('.reserve-image-preview .ant-image-preview-close').click();
    await page.goto('/feed');
    const article = page.getByRole('article', { name: '흙빛 산책의 게시물', exact: true });
    await expect(article).toBeVisible();
    const header = article.locator('.reserve-feed-post-header');
    await expect(header).toBeVisible();
    await capture(page, info, '22-feed-header');
    const feedPhoto = article.getByRole('button', { name: '게시물 사진 1 크게 보기', exact: true });
    await expect(feedPhoto).toBeVisible();
    await feedPhoto.focus();
    if (info.project.name === 'chromium') await feedPhoto.hover();
    await capture(page, info, '23-feed-photo-hint');
    await feedPhoto.press('Enter');
    await expect(page.locator('.reserve-image-preview')).toBeVisible();
    await capture(page, info, '24-feed-photo-expanded');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(fixture.errors).toEqual([]);
});

test('discovery, waiting, and feed toolbars plus waiting information and detail', async ({ page }, info) => {
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
    await capture(page, info, '25-explore-toolbar');
    fixture.storeListError = 403;
    await page.getByPlaceholder('가게 검색', { exact: true }).fill('확인필요');
    await expect(exploreCount).toHaveText('목록 확인 필요');
    await expect(exploreCount).toHaveCSS('color', baselineColor);
    await capture(page, info, '26-explore-confirm-required');
    fixture.storeListError = 0;
    await refresh.click();
    await expect(exploreCount).toHaveText('7개 가게');
    await expect(refresh).not.toHaveAttribute('aria-busy', 'true');

    await page.goto('/waiting');
    const waiting = page.getByLabel('웨이팅 가게 보기', { exact: true });
    await expect(waiting.locator('.reserve-explore-count')).toHaveText('1개 가게');
    expect((await waiting.boundingBox()).y).toBeCloseTo(exploreTop, 0);
    await expect(waiting.locator('.reserve-explore-count')).toHaveCSS('color', baselineColor);
    await capture(page, info, '27-waiting-toolbar');
    fixture.waitingListError = 403;
    await page.getByPlaceholder('웨이팅 가게 검색', { exact: true }).fill('확인필요');
    await expect(waiting.locator('.reserve-explore-count')).toHaveText('목록 확인 필요');
    await expect(waiting.locator('.reserve-explore-count')).toHaveCSS('color', baselineColor);
    await capture(page, info, '28-waiting-confirm-required');
    fixture.waitingListError = 0;
    await page.getByRole('button', { name: '새로고침', exact: true }).click();
    const hint = page.getByRole('button', { name: '웨이팅 정보: 접수 가능, 대기 3팀', exact: true });
    await expect(hint).toBeVisible();
    await hint.click();
    await expect(page.locator('.reserve-info-hint-popup').getByText('대기 3팀', { exact: true })).toBeVisible();
    await capture(page, info, '29-waiting-information-icon');

    await page.goto('/feed');
    const feed = page.locator('.reserve-feed-directory-tools');
    await expect(feed.getByRole('button', { name: '새 글 작성', exact: true })).toBeVisible();
    await expect(feed.locator('.reserve-feed-column-tools')).toBeVisible();
    expect((await feed.boundingBox()).y).toBeCloseTo(exploreTop, 0);
    const left = await feed.locator('.reserve-feed-write-tools').boundingBox();
    const right = await feed.locator('.reserve-feed-column-tools').boundingBox();
    expect(Math.abs(left.y + left.height / 2 - right.y - right.height / 2)).toBeLessThan(1);
    await capture(page, info, '30-feed-toolbar-alignment');

    await page.goto('/my-reservations?tab=waiting');
    const detailTrigger = page.getByRole('button', { name: `${store.name} 17번 웨이팅 상세 보기`, exact: true });
    await expect(detailTrigger).toBeVisible();
    await capture(page, info, '31-my-waiting-detail-entry');
    await detailTrigger.click();
    const detail = page.getByRole('dialog', { name: '웨이팅 상세', exact: true });
    await expect(detail.getByText('내 앞에 2팀이 있어요.', { exact: true })).toBeVisible();
    await expect(detail.getByText('17번', { exact: true })).toBeVisible();
    await capture(page, info, '32-waiting-detail-modal');
    expect(fixture.errors).toEqual([]);
});
