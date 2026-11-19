import { expect, test } from '@playwright/test';
import { PUBLIC_ID, STORE_PUBLIC_ID, store } from './fixtures/reservation-release-preview';

const storePath = '/store/' + STORE_PUBLIC_ID;
const profilePath = '/feed/u/' + PUBLIC_ID;
const profile = { publicId: PUBLIC_ID, nickname: '흙빛 산책', activityAvailable: true, mine: false };
const reviewTitle = '돌아올 방문 후기';
const reviews = Array.from({ length: 14 }, (_, index) => {
    const authored = index === 0 || index === 4;
    return {
        id: index + 1, rating: 5, title: index === 4 ? reviewTitle : '방문 후기 ' + (index + 1),
        memberName: authored ? profile.nickname : '리저브 이용자',
        authorPublicId: authored ? profile.publicId : null,
        content: '차분한 분위기에서 도자기를 만들었어요. 천천히 진행할 수 있어서 좋았어요.',
        createdAt: '2026-11-15T11:00:00+09:00',
    };
});
const authorReviews = [{ ...reviews[0], storePublicId: STORE_PUBLIC_ID, storeName: store.name }];

test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, '모바일 가게 상세의 섹션 표시와 복귀를 검증해요.');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.route(/^https?:\/\/[^/]+\/api\//, route => {
        const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1\//, '/api/');
        let data = [];
        if (path === '/api/auth/session') data = { member: null, refreshPossible: false };
        else if (path === '/api/member/me' || path === '/api/auth/refresh') {
            return route.fulfill({ status: 401, json: { success: false, message: '로그인이 필요해요.' } });
        } else if (path === '/api/stores/' + STORE_PUBLIC_ID) data = { ...store, address: null, reviewCount: reviews.length };
        else if (path === '/api/reviews/store/' + store.id) data = reviews;
        else if (path === '/api/feed/config') data = { enabled: true };
        else if (path === '/api/feed/authors/' + PUBLIC_ID) data = profile;
        else if (path.startsWith('/api/feed/authors/' + PUBLIC_ID + '/')) {
            const content = path.endsWith('/reviews') ? authorReviews : [];
            data = { content, page: { number: 0, size: 12, totalElements: content.length, totalPages: content.length } };
        }
        return route.fulfill({ json: { success: true, data } });
    });
});

const reviewSection = page => page.getByRole('navigation', { name: '가게 상세 섹션' }).getByRole('link', { name: '리뷰', exact: true });
const scrollTop = page => page.evaluate(() => window.scrollY);

async function scrollToReview(page) {
    const review = page.getByText(reviewTitle, { exact: true });
    await expect(review).toBeAttached();
    await page.evaluate(async () => { await document.fonts.ready; });
    await review.scrollIntoViewIfNeeded();
    await expect(reviewSection(page)).toHaveAttribute('aria-current', 'location');
    const top = await scrollTop(page);
    expect(top).toBeGreaterThan(0);
    return top;
}

async function expectReviewRestored(page, top) {
    await expect(page).toHaveURL(url => url.pathname === storePath);
    await expect.poll(async () => Math.abs(await scrollTop(page) - top)).toBeLessThanOrEqual(1);
    await expect(reviewSection(page)).toHaveAttribute('aria-current', 'location');
    await expect(page.getByText(reviewTitle, { exact: true })).toBeInViewport();
}

test('mobile returns from the review author profile to the same review position', async ({ page }) => {
    await page.goto(storePath);
    const top = await scrollToReview(page);
    const author = page.getByRole('article').filter({ hasText: reviewTitle }).getByRole('link', { name: profile.nickname, exact: true });
    await expect(author).toBeInViewport();
    await author.tap();
    await expect(page).toHaveURL(url => url.pathname === profilePath);
    await expect(page.getByRole('heading', { name: profile.nickname, exact: true })).toBeVisible();
    await page.locator('.reserve-feed-heading').getByRole('button', { name: '이전 화면으로 돌아가기' }).tap();
    await expectReviewRestored(page, top);
});

test('mobile returns from search cancel to the same review position', async ({ page }) => {
    await page.goto(storePath);
    const top = await scrollToReview(page);
    await page.getByRole('link', { name: '통합 검색' }).tap();
    await expect(page.getByRole('searchbox')).toBeVisible();
    await page.getByRole('button', { name: '취소', exact: true }).tap();
    await expectReviewRestored(page, top);
});

test('mobile restores the current position when the store was opened at a different review', async ({ page }) => {
    await page.goto(profilePath + '?tab=reviews');
    await page.getByRole('link', { name: store.name, exact: true }).tap();
    await expect(page.getByRole('article').filter({ hasText: reviews[0].title }).first()).toBeFocused();
    const top = await scrollToReview(page);
    await page.getByRole('link', { name: '통합 검색' }).tap();
    await page.getByRole('button', { name: '취소', exact: true }).tap();
    await expectReviewRestored(page, top);
});
