import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test.beforeEach(({ page }) => {
    page.on('pageerror', (error) => console.error(error.stack || error.message));
});

const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGYkAAAAASUVORK5CYII=',
    'base64'
);
const profile = {
    publicId: 'f3dd7675-84a3-4339-9e3e-2334cbe762c2',
    nickname: '공개 작성자',
    bio: '',
    useAccountAvatar: false,
};
const config = { enabled: true, imageEnabled: true, maxImages: 6, maxImageBytes: 7340032, deleteGraceDays: 30 };
const pageData = (content) => ({
    content,
    page: { number: 0, size: 12, totalElements: content.length, totalPages: content.length ? 1 : 0 },
});

async function setup(page, role) {
    const state = { profile: role === 'BUSINESS' ? null : profile, news: [], posts: [], uploads: 0, saved: null };
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        let data = [];
        if (path === '/api/member/me')
            data = { id: 9, name: '비공개 계정 이름', email: 'local@example.test', role, termsAgreed: true };
        else if (path === '/api/feed/config' || path === '/api/store-news/config') data = config;
        else if (path === '/api/feed/me/profile') {
            if (request.method() === 'PUT') state.profile = { ...profile, ...request.postDataJSON() };
            data = state.profile;
        } else if (path === '/api/store-news/stores') data = [{ id: 12, name: '내 가게' }];
        else if (path === '/api/feed/media' && request.method() === 'POST') {
            expect(request.headers()['content-type']).toContain('multipart/form-data');
            state.uploads++;
            data = { id: state.uploads, url: `/api/feed/media/${state.uploads}`, width: 1, height: 1 };
        } else if (/^\/api\/feed\/media\/\d+$/.test(path)) {
            return route.fulfill({ body: image, contentType: 'image/png' });
        } else if (path === '/api/store-news' && request.method() === 'POST') {
            const values = request.postDataJSON();
            state.saved = values;
            data = {
                ...values,
                id: 7,
                revision: 0,
                state: values.draft ? 'DRAFT' : 'PUBLISHED',
                storeName: '내 가게',
                images: values.mediaIds.map((id) => ({ id, url: `/api/feed/media/${id}`, width: 1, height: 1 })),
                excerpt: values.content,
                createdAt: new Date().toISOString(),
            };
            state.news = [data];
        } else if (path === '/api/feed/posts' && request.method() === 'POST') {
            const values = request.postDataJSON();
            state.saved = values;
            data = {
                ...values,
                id: 8,
                revision: 0,
                state: values.draft ? 'DRAFT' : 'PUBLISHED',
                author: state.profile,
                store: null,
                promotion: null,
                createdAt: new Date().toISOString(),
                images: values.mediaIds.map((id) => ({ id, url: `/api/feed/media/${id}`, width: 1, height: 1 })),
            };
            state.posts = [data];
        } else if (path === '/api/promotions/public') data = pageData(state.news);
        else if (path === '/api/feed/posts' || path === '/api/feed/me/posts') data = pageData(state.posts);
        else if (path.endsWith('/unread')) data = 0;
        return route.fulfill({ json: { success: true, data } });
    });
    return state;
}

test('benefits write icon opens the writer directly, selects a public profile and publishes news with a photo', async ({
    page,
}) => {
    const state = await setup(page, 'BUSINESS');
    await page.goto('/benefits');
    const write = page.getByRole('button', { name: '가게 소식 작성', exact: true });
    await expect(write).toHaveAttribute('aria-disabled', 'false');
    await expect(write).toHaveCSS('width', '44px');
    await expect(write).toHaveCSS('height', '44px');
    await expect(page.getByRole('link', { name: '내 가게 소식 관리' })).toHaveAttribute('href', '/business?tab=news');
    await write.click();
    await expect(page).toHaveURL(/\/benefits$/);
    const publicProfile = page.getByRole('dialog', { name: '피드 공개 프로필' });
    await publicProfile.getByRole('textbox', { name: '공개 닉네임' }).fill(profile.nickname);
    await expect(publicProfile.getByRole('checkbox')).not.toBeChecked();
    await publicProfile.getByRole('button', { name: '저장', exact: true }).click();
    const editor = page.getByRole('dialog', { name: /새 가게 소식|가게 소식 미리보기/ });
    await editor.getByRole('textbox', { name: '가게 소식 제목' }).fill('새로운 가게 소식');
    await editor.getByRole('textbox', { name: '가게 소식 본문' }).fill('같은 원문으로 전하는 소식이에요.');
    await editor
        .getByLabel('가게 소식 사진 선택')
        .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: image });
    await expect(editor.getByRole('checkbox')).toBeChecked();
    await editor.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(editor.getByText('새로운 가게 소식', { exact: true })).toBeVisible();
    await editor.getByRole('button', { name: '게시하기', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect(page.getByRole('link', { name: '내 가게 · 새로운 가게 소식 소식 보기' })).toBeVisible();
    expect(state.uploads).toBe(1);
    expect(state.saved).toMatchObject({
        storeId: 12,
        mediaIds: [1],
        feedEnabled: true,
        draft: false,
        newsType: 'NEWS',
    });
});

test('an ordinary member publishes text and a photo without a store or real-name disclosure', async ({ page }) => {
    const state = await setup(page, 'USER');
    await page.goto('/feed');
    await page.getByRole('button', { name: '새 글 작성', exact: true }).click();
    const editor = page.getByRole('dialog', { name: /피드 글쓰기|게시물 미리보기/ });
    await editor.getByRole('textbox', { name: '게시물 글' }).fill('회원 모두가 나누는 일상이에요.');
    await editor
        .getByLabel('피드 사진 선택')
        .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: image });
    await expect(editor.getByRole('combobox', { name: '연결할 내 가게' })).toHaveCount(0);
    await editor.getByRole('button', { name: '미리보기', exact: true }).click();
    await expect(editor.getByRole('article')).toHaveText(/공개 작성자/);
    await editor.getByRole('button', { name: '게시하기', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect(page.getByRole('article', { name: '공개 작성자의 게시물' })).toContainText(
        '회원 모두가 나누는 일상이에요.'
    );
    await expect(page.locator('.reserve-feed-page')).not.toContainText('비공개 계정 이름');
    expect(state.saved).toMatchObject({ storeId: null, promotionId: null, mediaIds: [1], draft: false });
    expect(state.uploads).toBe(1);
});
