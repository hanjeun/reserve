import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const photo = readFileSync(new URL('../public/images/discovery-v3/dining-cover.webp', import.meta.url));
const files = ['first.webp', 'second.webp', 'third.webp'].map(name => ({ name, mimeType: 'image/webp', buffer: photo }));
const config = { enabled: true, imageEnabled: true, commentPhotosEnabled: true, maxImages: 6, maxImageBytes: 7340032 };
const user = { id: 41, name: '검사 사용자', email: 'ui@example.test', role: 'USER', termsAgreed: true };
const profile = { publicId: 'design-review', nickname: '검사 작성자' };
const pageOf = content => ({ content, page: { number: 0, totalElements: content.length, totalPages: 1 } });
const photos = [1, 2, 3].map(id => ({ id, url: `/api/feed/media/${id}`, width: 800, height: 450 }));
const store = { id: 81, name: '디자인 검사 가게', category: '카페', ownerId: 8, phone: '02-1234-5678',
    mainImageUrl: '/api/feed/media/1', detailImageUrls: ['/api/feed/media/2'], reservationEnabled: true,
    description: '예약 폼과 아이콘을 확인하는 가게예요.', bookingType: 'SESSION',
    openTime: '09:00', closeTime: '18:00', sessionTimes: ['10:00'], maxCapacityPerSlot: 3 };

async function capture(page, name, testInfo) {
    if (process.env.RESERVE_CAPTURE_UI !== 'true') return;
    const directory = path.resolve('test-results/design-details-review');
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, `${name}-${testInfo.project.name}.png`) });
}

async function setup(page) {
    const requests = [];
    let failSecond = true;
    await page.route('**/api/**', async route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!pathname.startsWith('/api/')) return route.continue();
        const ok = data => route.fulfill({ json: { success: true, data } });
        if (/^\/api\/feed\/media\/\d+$/.test(pathname) || /\/messages\/\d+\/image$/.test(pathname))
            return route.fulfill({ body: photo, contentType: 'image/webp' });
        if (pathname === '/api/member/me') return ok(user);
        if (pathname === '/api/stores/81') return ok(store);
        if (pathname.includes('favorite')) return ok({ isFavorite: false });
        if (pathname.includes('unread')) return ok(0);
        if (pathname === '/api/chat/images/config') return ok({ enabled: true });
        if (pathname.startsWith('/api/chat/') && pathname.endsWith('/open')) return ok({
            roomId: 1, storeId: 81, type: 'STORE', title: store.name, counterpartName: store.name,
            viewerRole: 'MEMBER', canSend: true, messages: [],
        });
        if (pathname === '/api/chat/rooms/1/images') {
            const body = request.postDataBuffer().toString();
            const filename = /filename="([^"]+)"/.exec(body)?.[1];
            const nonce = /name="clientMessageId"\r\n\r\n([^\r]+)/.exec(body)?.[1];
            requests.push({ filename, nonce });
            if (filename === 'second.webp' && failSecond) {
                failSecond = false;
                return route.fulfill({ status: 503, json: { success: false, message: '사진 전송을 다시 시도해주세요.' } });
            }
            const id = 30 + requests.length;
            return ok({ id, content: requests.length === 1 ? '사진 세 장이에요.' : '', senderRole: 'MEMBER',
                clientMessageId: nonce, imageUrl: `/api/chat/rooms/1/messages/${id}/image`, imageWidth: 800, imageHeight: 450, createdAt: new Date().toISOString() });
        }
        if (pathname === '/api/feed/config' || pathname === '/api/store-news/config' || pathname === '/api/feed/interactions/config') return ok(config);
        if (pathname === '/api/feed/me/profile') return ok(profile);
        if (pathname === '/api/feed/posts/8') return ok({ id: 8, revision: 0, state: 'PUBLISHED', author: profile,
            content: '사진 배지와 댓글 입력을 확인해요.', images: photos, createdAt: new Date().toISOString() });
        if (pathname === '/api/promotions/public/7') return ok({ id: 7, title: '사진 배지 확인', content: '같은 사진 수 표기를 사용해요.',
            images: photos, state: 'PUBLISHED', storeId: 81, storeName: store.name, createdAt: new Date().toISOString() });
        if (pathname === '/api/stores') return ok(pageOf([store]));
        if (pathname.endsWith('/comments') || pathname.includes('conversations') || pathname.includes('inbox')) return ok(pageOf([]));
        if (pathname.endsWith('/retractions')) return ok({ messages: [], nextRevision: 0 });
        return ok([]);
    });
    return requests;
}

test('three chat photos keep tools clear, animate after load and retry only the unsent photos', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const requests = await setup(page);
    await page.goto('/messages?storeId=81');
    const input = page.getByLabel('첨부할 사진 선택');
    await expect(page.getByRole('button', { name: '사진 첨부', exact: true })).toBeEnabled();
    // Bounding boxes include ancestor transforms, so capture the baseline after the panel/route entrance settles.
    await expect.poll(() => page.locator('.reserve-chat-composer').evaluate(element => {
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            if (ancestor.getAnimations().some(animation => animation.playState === 'running')) return false;
        }
        return true;
    })).toBe(true);
    const emptyComposer = await page.locator('.reserve-chat-composer').boundingBox();
    const emptyToolbar = await page.locator('.reserve-chat-composer-toolbar').boundingBox();
    await page.evaluate(() => {
        window.attachmentEntries = 0;
        document.addEventListener('animationstart', event => {
            if (event.animationName === 'slideUpIn' && event.target.classList.contains('reserve-chat-attachment')) window.attachmentEntries++;
        });
    });
    await input.setInputFiles(files);
    await expect(page.getByRole('button', { name: '첨부 사진 크게 보기' })).toHaveCount(3);
    await expect.poll(() => page.evaluate(() => window.attachmentEntries)).toBe(3);
    await expect(page.getByRole('button', { name: '사진 첨부', exact: true })).toBeDisabled();
    const previews = await page.locator('.reserve-chat-attachments').boundingBox();
    const toolbar = await page.locator('.reserve-chat-composer-toolbar').boundingBox();
    expect((await page.locator('.reserve-chat-composer').boundingBox()).height).toBeCloseTo(emptyComposer.height, 1);
    expect(toolbar.y).toBeCloseTo(emptyToolbar.y, 1);
    expect(previews.y + previews.height).toBeLessThanOrEqual(toolbar.y);
    await expect(page.getByRole('button', { name: '이모지 선택', exact: true })).toBeVisible();
    await capture(page, 'chat-three-photos', testInfo);
    await page.getByRole('button', { name: '첨부 사진 제거: second.webp' }).click();
    await expect(page.getByRole('button', { name: '첨부 사진 크게 보기' })).toHaveCount(2);
    await input.setInputFiles([files[1]]);
    await expect(page.getByRole('button', { name: '첨부 사진 크게 보기' })).toHaveCount(3);
    // Reopen starts with the selected order: first, third, second.
    await page.getByRole('button', { name: '첨부 사진 제거: third.webp' }).click();
    await expect(page.getByRole('button', { name: '첨부 사진 크게 보기' })).toHaveCount(2);
    await input.setInputFiles([files[2]]);
    await page.getByRole('textbox', { name: '메시지 입력' }).fill('사진 세 장이에요.');
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(page.getByRole('button', { name: '첨부 사진 크게 보기' })).toHaveCount(2);
    await expect(page.getByRole('textbox', { name: '메시지 입력' })).toHaveValue('');
    await capture(page, 'chat-unsent-photos', testInfo);
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await expect.poll(() => requests.length).toBe(4);
    expect(requests.map(request => request.filename)).toEqual(['first.webp', 'second.webp', 'second.webp', 'third.webp']);
    expect(requests[1].nonce).toBeTruthy();
    expect(requests[2].nonce).toBe(requests[1].nonce);
    await expect(page.getByRole('button', { name: '첨부 사진 크게 보기' })).toHaveCount(0);
});

test('comment attachments remain inside the original input footprint', async ({ page }, testInfo) => {
    await setup(page);
    await page.goto('/feed/posts/8');
    const composer = page.locator('.reserve-feed-comment-composer .reserve-chat-composer');
    await expect(composer).toBeVisible();
    await composer.scrollIntoViewIfNeeded();
    const before = await composer.boundingBox();
    await page.getByLabel('첨부할 사진 선택').setInputFiles(files);
    await expect(composer.getByRole('button', { name: '첨부 사진 크게 보기', exact: true })).toHaveCount(3);
    expect((await composer.boundingBox()).height).toBeCloseTo(before.height, 1);
    const field = await composer.locator('.reserve-chat-composer-input-area').boundingBox();
    const photos = await composer.locator('.reserve-chat-composer-attachments').boundingBox();
    const tools = await composer.locator('.reserve-chat-composer-toolbar').boundingBox();
    expect(photos.y).toBeGreaterThanOrEqual(field.y);
    expect(photos.y + photos.height).toBeLessThanOrEqual(tools.y);
    await expect(composer.getByRole('button', { name: '이모지 선택' })).toBeEnabled();
    await composer.getByRole('button', { name: '댓글 남기기', exact: true }).click({ trial: true });
    await capture(page, 'comment-three-photos', testInfo);
});

test('reservation placeholders and all three store actions use matching type and icon measurements', async ({ page }, testInfo) => {
    await setup(page);
    await page.goto('/store/81');
    const date = page.getByText('날짜 선택', { exact: true });
    const time = page.getByText('날짜를 먼저 선택해주세요', { exact: true });
    const typography = element => {
        const style = getComputedStyle(element);
        return Object.fromEntries(['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color'].map(key => [key, style[key]]));
    };
    await expect(time).toBeVisible();
    expect(await date.evaluate(typography)).toEqual(await time.evaluate(typography));
    const actions = page.locator('.reserve-store-identity-actions');
    for (const action of await actions.locator('button, a').all()) {
        expect(await action.evaluate(element => {
            const style = getComputedStyle(element), surface = getComputedStyle(element, '::before');
            return { width: style.width, height: style.height, glyph: getComputedStyle(element.querySelector('svg')).width,
                surface: surface.width, radius: surface.borderRadius };
        })).toEqual({ width: '44px', height: '44px', glyph: '20px', surface: '32px', radius: '50%' });
    }
    if (testInfo.project.name === 'chromium') await actions.getByRole('button', { name: '즐겨찾기 추가' }).hover();
    await capture(page, 'store-actions', testInfo);
    const reservationPanel = page.getByRole('heading', { name: '예약하기', exact: true }).locator('..');
    await capture(reservationPanel, 'reservation-fields', testInfo);
});

test('the shared store favorite keeps its circular hover in cards and list rows', async ({ page }, testInfo) => {
    await setup(page);
    await page.goto('/stores');
    const favorite = page.getByRole('button', { name: '즐겨찾기 추가', exact: true });
    const assertCircle = async () => {
        await expect(favorite).toBeVisible();
        expect(await favorite.evaluate(element => {
            const surface = getComputedStyle(element, '::before');
            return { width: surface.width, height: surface.height, radius: surface.borderRadius };
        })).toEqual({ width: '32px', height: '32px', radius: '50%' });
        if (testInfo.project.name === 'chromium') await favorite.hover();
    };
    await assertCircle();
    await capture(page, 'store-card-favorite', testInfo);
    await page.getByRole('button', { name: '목록형 보기로 전환' }).click();
    await expect(page.getByRole('button', { name: '사진형 보기로 전환' })).toBeVisible();
    await assertCircle();
    await capture(page, 'store-list-favorite', testInfo);
});

test('home keeps its counter, benefits use gallery dots, and fullscreen keeps its default counter', async ({ page }, testInfo) => {
    await setup(page);
    const skin = element => {
        const style = getComputedStyle(element);
        return Object.fromEntries(['backgroundColor', 'color', 'borderRadius', 'borderColor', 'fontSize', 'minHeight'].map(key => [key, style[key]]));
    };
    await page.goto('/');
    const main = page.locator('.reserve-discovery-banner-next');
    await expect(main).toBeVisible();
    await expect(main).toHaveClass(/reserve-photo-count/);
    const mainSkin = await main.evaluate(skin);
    expect(mainSkin).toMatchObject({ backgroundColor: 'rgba(0, 0, 0, 0.58)', color: 'rgb(255, 255, 255)', borderRadius: '30px' });
    await capture(page, 'home-counter', testInfo);
    await page.goto('/benefits/7');
    const gallery = page.locator('.reserve-benefit-photos .reserve-carousel');
    const dots = gallery.locator('.slick-dots li');
    await expect(page.locator('.reserve-benefit-photo-count')).toHaveCount(0);
    await expect(dots).toHaveCount(3);
    await expect(dots.nth(0)).toHaveClass(/slick-active/);
    await expect(gallery.locator('.slick-slide.slick-active').getByAltText('혜택 사진 1', { exact: true })).toBeVisible();
    await dots.nth(1).getByRole('button').click();
    await expect(dots.nth(1)).toHaveClass(/slick-active/);
    await expect(gallery.locator('.slick-slide.slick-active').getByAltText('혜택 사진 2', { exact: true })).toBeVisible();
    await capture(page, 'benefit-gallery-dots', testInfo);
    await page.goto('/feed/posts/8');
    await page.getByAltText('게시물 사진 1', { exact: true }).click();
    const progress = page.locator('.reserve-image-preview .ant-image-preview-progress');
    await expect(progress).toHaveText('1 / 3');
    await expect(progress).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(progress).toHaveCSS('border-radius', '0px');
    expect(await progress.evaluate(skin)).not.toEqual(mainSkin);
    await capture(page, 'feed-preview-counter', testInfo);
});
