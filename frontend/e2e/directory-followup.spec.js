import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const photo = readFileSync(new URL('../public/images/discovery-v3/dining-cover.webp', import.meta.url));
const user = { id: 41, name: '확인 사용자', email: 'ui@example.test', role: 'BUSINESS', termsAgreed: true };
const profile = { publicId: '326f8cca-6b4d-4ef2-90bc-d380872f1888', nickname: '확인 작성자' };
const pageOf = content => ({ content, page: { number: 0, totalElements: content.length, totalPages: 1 } });
const store = { id: 81, ownerId: 41, name: '리저브 카페', category: '맛집 · 카페', description: '커피와 함께 잠시 쉬어가는 공간이에요.',
    mainImageUrl: '/api/feed/media/1', mainImageWidth: 800, mainImageHeight: 450, detailImageUrls: ['/api/feed/media/1', '/api/feed/media/2'],
    imageAutoplayEnabled: false, reservationEnabled: true, waitingEnabled: true, waitingIntakeMode: 'ONSITE',
    bookingType: 'SESSION', openTime: '09:00', closeTime: '18:00', sessionTimes: ['10:00'], maxCapacityPerSlot: 3 };
const post = { id: 8, state: 'PUBLISHED', author: profile, store, content: '새로 문을 연 카페를 소개해요.', images: [], createdAt: new Date().toISOString() };

async function capture(page, name, info) {
    if (process.env.RESERVE_CAPTURE_UI !== 'true') return;
    const folder = path.resolve('test-results/ui-followup-review');
    await mkdir(folder, { recursive: true });
    await page.screenshot({ path: path.join(folder, `${name}-${info.project.name}.png`), animations: 'disabled' });
}

async function setup(page, { holdInteractions = false } = {}) {
    const requests = [];
    let teams = 3;
    let releaseInteractions;
    const interactions = holdInteractions ? new Promise(resolve => { releaseInteractions = resolve; }) : Promise.resolve();
    await page.addInitScript(() => {
        window.reviewStreams = [];
        window.EventSource = class extends EventTarget {
            constructor() {
                super();
                this.readyState = 1;
                window.reviewStreams.push(this);
                queueMicrotask(() => this.dispatchEvent(new MessageEvent('ready', { data: JSON.stringify({
                    epoch: 'review', domains: ['STORE', 'WAITING', 'FEED', 'COMMENT', 'LIKE', 'FAVORITE', 'REVIEW'], serverTime: new Date().toISOString(),
                }) })));
            }
            close() { this.readyState = 2; }
        };
    });
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const endpoint = url.pathname;
        if (!endpoint.startsWith('/api/')) return route.continue();
        requests.push({ endpoint, search: url.search, method: request.method() });
        const ok = data => route.fulfill({ json: { success: true, data } });
        if (/^\/api\/feed\/media\/\d+$/.test(endpoint)) return route.fulfill({ body: photo, contentType: 'image/webp' });
        if (endpoint === '/api/member/me') return ok(user);
        if (endpoint === '/api/waiting/stores') return ok(pageOf([{ ...store, waitingTeams: teams }]));
        if (endpoint === '/api/stores') return ok(pageOf([store]));
        if (endpoint === '/api/stores/81') return ok(store);
        if (endpoint === '/api/stores/my') return ok([store]);
        if (endpoint === '/api/favorites/my') return ok([{ id: 4, storeId: 81, storeName: store.name, storeCategory: store.category, storeMainImageUrl: store.mainImageUrl }]);
        if (endpoint.includes('/favorites/status/')) return ok({ isFavorite: false });
        if (endpoint === '/api/feed/config') return ok({ enabled: true, imageEnabled: true, maxImages: 6 });
        if (endpoint === '/api/feed/interactions/config') {
            await interactions;
            return ok({ enabled: true, notificationsEnabled: true, commentLikesEnabled: true });
        }
        if (endpoint === '/api/feed/me/profile') return ok(profile);
        if (endpoint === `/api/feed/authors/${profile.publicId}`) return ok(profile);
        if (endpoint === `/api/feed/authors/${profile.publicId}/posts`) return ok(pageOf([post]));
        if (endpoint === '/api/feed/notifications') return ok(pageOf([]));
        if (endpoint === '/api/feed/posts') return ok(pageOf([post]));
        if (endpoint === '/api/feed/posts/8') return ok(post);
        if (endpoint === '/api/feed/me/likes' || endpoint.endsWith('/comments')) return ok(pageOf([]));
        if (endpoint.includes('/feed/likes/')) return ok({ liked: false, likeCount: 0, commentCount: 0 });
        if (endpoint === '/api/feed/notifications/count') return ok({ unread: 2 });
        if (endpoint.endsWith('/unread')) return ok(0);
        if (endpoint === '/api/advertisements/my') return ok(pageOf([]));
        return ok([]);
    });
    return { requests, setTeams: value => { teams = value; }, releaseInteractions: () => releaseInteractions?.() };
}

test('waiting reuses exploration geometry and refreshes an open information bubble', async ({ page }, info) => {
    const state = await setup(page);
    await page.goto('/stores?region=');
    await expect(page).toHaveURL(/region=all/);
    const title = page.locator('.reserve-store-card-title-line');
    await expect(title).toBeVisible();
    const cardHeight = (await title.boundingBox()).height;
    const toolbarTop = (await page.locator('.reserve-explore-filters').boundingBox()).y;
    await capture(page, 'explore-cards', info);
    await page.getByRole('button', { name: '목록형 보기로 전환' }).click();
    const listHeight = (await page.locator('.reserve-store-list-row').boundingBox()).height;
    await capture(page, 'explore-list', info);

    await page.goto('/waiting?region=&view=cards');
    await expect(page).toHaveURL(/region=all/);
    const hint = page.getByRole('button', { name: /^웨이팅 정보:/ });
    await expect(hint).toBeVisible();
    expect((await title.boundingBox()).height).toBeCloseTo(cardHeight, 0);
    expect((await page.locator('.reserve-explore-filters').boundingBox()).y).toBeCloseTo(toolbarTop, 0);
    await expect(page.getByRole('heading', { name: '웨이팅', exact: true })).toHaveCount(0);
    if (info.project.name === 'chromium') await hint.hover(); else await hint.click();
    const bubble = page.locator('.reserve-info-hint-popup');
    await expect(bubble.getByText('대기 3팀', { exact: true })).toBeVisible();
    state.setTeams(7);
    await page.evaluate(() => {
        for (const stream of window.reviewStreams.filter(value => value.readyState === 1)) stream.dispatchEvent(new MessageEvent('update', {
            data: JSON.stringify({ domain: 'WAITING', operation: 'UPDATED', epoch: 'review', revision: 1, eventId: 'review:1', entityId: 81, storeId: 81 }),
        }));
    });
    await expect(bubble.getByText('대기 7팀', { exact: true })).toBeVisible();
    await capture(page, 'waiting-cards-live', info);
    await page.getByRole('button', { name: '목록형 보기로 전환' }).click();
    await expect(page.locator('.reserve-store-list-row')).toBeVisible();
    expect((await page.locator('.reserve-store-list-row').boundingBox()).height).toBeCloseTo(listHeight, 0);
    await hint.click();
    await expect(bubble.getByText('대기 7팀', { exact: true })).toBeVisible();
    await capture(page, 'waiting-list-live', info);
    for (const request of state.requests.filter(value => ['/api/stores', '/api/waiting/stores'].includes(value.endpoint))) {
        expect(new URLSearchParams(request.search).has('region')).toBe(false);
    }

    await page.getByRole('link', { name: `${store.name} 상세 보기` }).click();
    const gallery = page.locator('.reserve-store-gallery');
    await expect(gallery).toBeVisible();
    const image = gallery.locator('.slick-active img').first();
    await expect(image).toBeVisible();
    if (info.project.name === 'chromium') {
        await image.scrollIntoViewIfNeeded();
        const box = await image.boundingBox();
        const x = box.x + box.width * 0.65, y = box.y + Math.min(100, box.height / 2);
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 12, y, { steps: 5 }); await page.mouse.up();
        await expect(page.locator('.ant-image-preview')).toHaveCount(0);
        await image.click();
        await expect(page.locator('.ant-image-preview')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('.ant-image-preview')).toHaveCount(0);
        await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(box.x + 20, y, { steps: 15 }); await page.mouse.up();
        await expect(gallery.locator('.slick-slide.slick-active')).toHaveAttribute('data-index', '1');
        await expect(page.locator('.ant-image-preview')).toHaveCount(0);
        await gallery.locator('.slick-active img').first().click();
        await expect(page.locator('.ant-image-preview')).toBeVisible();
        await page.keyboard.press('Escape');
    }
    await capture(page, 'store-gallery', info);
});

test('feed keeps the notification slot, explicit optional choice and previous filters', async ({ page }, info) => {
    const state = await setup(page, { holdInteractions: true });
    await page.goto('/feed?view=all&page=1&region=');
    await expect(page).toHaveURL(/region=all/);
    await expect(page.getByRole('heading', { name: '피드', exact: true })).toHaveCount(0);
    const pending = page.getByRole('button', { name: '피드 알림 확인 중', exact: true });
    await expect(pending).toBeVisible();
    await expect(pending).toBeDisabled();
    const slot = await pending.boundingBox();
    state.releaseInteractions();
    const bell = page.getByRole('link', { name: '피드 알림, 안 읽은 알림 2개', exact: true });
    await expect(bell).toBeVisible();
    expect((await bell.boundingBox()).x).toBeCloseTo(slot.x, 0);
    await capture(page, 'feed-directory', info);
    await page.getByRole('link', { name: '게시물 상세 보기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '게시물', exact: true })).toBeVisible();
    await page.locator('.reserve-feed-heading').getByRole('button', { name: '이전 화면으로 돌아가기' }).click();
    await expect(page).toHaveURL(/\/feed\?view=all&page=1&region=all$/);
    await page.getByRole('button', { name: '새 글 작성', exact: true }).click();
    const select = page.getByRole('combobox', { name: '연결할 내 가게', exact: true });
    await select.click();
    await page.locator('.ant-select-dropdown:visible').getByText(store.name, { exact: true }).click();
    await select.click();
    await page.locator('.ant-select-dropdown:visible').getByText('가게 없이 게시', { exact: true }).click();
    await expect(select.locator('..').locator('..')).toContainText('가게 없이 게시');
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
    await capture(page, 'feed-optional-store', info);

    await page.goto('/my-favorites?kind=all');
    const toggle = page.getByRole('button', { name: '목록형 보기로 전환', exact: true });
    const kind = page.getByRole('button', { name: '좋아요 종류', exact: true });
    await expect(kind).toBeVisible();
    const a = await toggle.boundingBox(), b = await kind.boundingBox();
    expect(a.y + a.height / 2).toBeCloseTo(b.y + b.height / 2, 0);
    await capture(page, 'favorites-toolbar', info);
    await kind.click();
    await page.getByRole('menuitemradio', { name: '게시물', exact: true }).click();
    await expect(page.getByText('좋아요한 게시물이 없어요.', { exact: true })).toBeVisible();
    await expect(page.locator('.reserve-state-illustration img')).toHaveAttribute('src', /empty-favorite/);
    await capture(page, 'liked-posts-empty', info);
});

test('optional advertisement presets allow custom writing without discarding the text', async ({ page }, info) => {
    const state = await setup(page);
    await page.goto('/business?tab=ads');
    await page.getByRole('button', { name: '새 광고 신청', exact: true }).click();
    await page.getByText('배너형', { exact: true }).click();
    const title = page.getByRole('textbox', { name: '광고 제목', exact: true });
    await title.fill('우리 가게의 새로운 소식');
    const preset = page.getByRole('combobox', { name: '추천 문구', exact: true });
    await preset.click();
    await page.locator('.ant-select-dropdown:visible').getByText('새로운 가게를 만나보세요', { exact: true }).click();
    await preset.click();
    await page.locator('.ant-select-dropdown:visible').getByText('직접 작성', { exact: true }).click();
    await expect(title).toHaveValue('새로운 가게를 만나보세요');
    await title.fill('우리 가게의 새로운 소식');
    await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
    await capture(page, 'ad-custom-copy-settled', info);
    expect(state.requests.every(request => request.method === 'GET')).toBe(true);
});

test('feed detail, profile and notifications return through the shared back control', async ({ page }, info) => {
    await setup(page);
    await page.goto('/feed?view=all&page=1&region=서울+종로구');
    const origin = page.url();
    await page.getByRole('link', { name: '게시물 상세 보기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '게시물', exact: true })).toBeVisible();
    await capture(page, 'feed-detail-back', info);
    await page.locator('.reserve-feed-heading').getByRole('button', { name: '이전 화면으로 돌아가기' }).click();
    await expect(page).toHaveURL(origin);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const avatar = page.getByRole('link', { name: `${profile.nickname}의 공개 프로필`, exact: true });
    await avatar.hover();
    await page.mouse.down();
    await expect(avatar.locator(':scope > div')).toHaveCSS('scale', '0.96');
    await page.mouse.up();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('heading', { name: '공개 프로필', exact: true })).toBeVisible();
    await expect(page.locator('.reserve-feed-profile')).toContainText(profile.nickname);
    await capture(page, 'feed-profile-back', info);
    await page.locator('.reserve-feed-heading').getByRole('button', { name: '이전 화면으로 돌아가기' }).click();
    await expect(page).toHaveURL(origin);

    await page.getByRole('link', { name: /^피드 알림,/ }).click();
    await expect(page.getByRole('heading', { name: '피드 알림', exact: true })).toBeVisible();
    await capture(page, 'feed-notifications-back', info);
    await page.locator('.reserve-feed-notification-back').getByRole('button', { name: '이전 화면으로 돌아가기' }).click();
    await expect(page).toHaveURL(origin);
});
