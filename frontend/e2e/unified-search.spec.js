import { expect, test } from '@playwright/test';

const keywordUrl = keyword => '/search?keyword=' + encodeURIComponent(keyword);
const user = { id: 7, role: 'BUSINESS', name: '검색 검사 계정', email: 'search@example.test', termsAgreed: true };
const group = (key, items = [], error = null) => ({ key, title: key, items, error, hasMore: false });
const item = (id, type, title, path) => ({ id, type, title, path, description: '합성 검색 결과' });
const pageOf = content => ({ content, page: { number: 0, totalElements: content.length, totalPages: content.length ? 1 : 0 } });

async function setup(page, signedIn = false) {
    const requests = [];
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        if (!path.startsWith('/api/')) return route.fallback();
        requests.push({ path, method: request.method(), keyword: url.searchParams.get('keyword'), limit: url.searchParams.get('limit') });
        const ok = data => route.fulfill({ json: { success: true, data } });
        if (path === '/api/member/me' || path === '/api/auth/refresh') return signedIn ? ok(user)
            : route.fulfill({ status: 401, json: { success: false, message: '로그인이 필요해요.' } });
        if (path === '/api/service-admission') return ok({ campaignId: 'service-entry', mode: 'OFF', state: 'BYPASS',
            position: 0, expiresAt: 0, absoluteExpiresAt: 0, serverTime: Date.now(), pollAfterSeconds: 4, heartbeatTimeoutSeconds: 60, continuityId: null });
        if (path === '/api/search') return ok({ keyword: url.searchParams.get('keyword'), groups: [
            group('stores', [item(3, 'STORE', '검색 가게', '/store/3')]),
            group('benefits', [], { status: 503, message: '현재 혜택 검색을 사용할 수 없어요.' }),
            group('feed', [item(4, 'FEED', '검색 피드', '/feed/posts/4')]),
        ] });
        if (path === '/api/search/me') return ok({ keyword: url.searchParams.get('keyword'), groups: [
            group('reservations', [item(9, 'RESERVATION', '선택할 내 예약', '/my-reservations?reservationId=9')]),
            group('waiting', [item(12, 'WAITING', '선택할 내 웨이팅', '/my-reservations?tab=waiting&entryId=12')]),
            group('messages', [item(19, 'MESSAGE', '선택할 내 대화', '/messages?kind=support')]),
        ] });
        if (path === '/api/waiting/my/12') return ok({ entry: { id: 12, storeId: 3, entryNumber: 10, partySize: 2,
            status: 'WAITING', businessDate: '2030-01-01', createdAt: '2030-01-01T01:00:00Z' }, storeName: '검색 가게', teamsAhead: 2 });
        if (path === '/api/chat/support/open') return ok({ roomId: 90, type: 'SUPPORT', viewerRole: 'MEMBER', canSend: true,
            title: 'RESERVE 고객지원', messages: [{ id: 101, content: '검색에서 여는 합성 대화', senderRole: 'ADMIN', createdAt: '2030-01-01T01:00:00Z' }] });
        if (path === '/api/chat/rooms/90/retractions') return ok({ messages: [], nextRevision: 0 });
        if (path === '/api/chat/rooms/90/messages') return ok([]);
        if (path.endsWith('/unread-count') || path.includes('/unread')) return ok(0);
        if (path.includes('/intro/')) return ok({});
        if (path.endsWith('/read')) return ok(null);
        if (path.includes('/config')) return ok({ enabled: false, imageEnabled: false });
        if (path === '/api/waiting/my' || path.includes('/conversations') || path.includes('/inbox')) return ok(pageOf([]));
        if (path === '/api/stores' || path === '/api/waiting/stores') return ok(pageOf([]));
        if (path === '/api/stores/3') return ok({ id: 3, name: '검색 가게', ownerId: 8, category: '카페', address: '서울', reservationEnabled: false });
        return ok([]);
    });
    return requests;
}

test('public grouped search preserves input, retry and other results when one group is unavailable', async ({ page }) => {
    const requests = await setup(page);
    await page.goto('/search');
    const field = page.getByRole('searchbox');
    await field.fill('카페');
    await expect(page.getByRole('button', { name: '카페 검색하기' })).toBeVisible();
    expect(requests.some(request => request.path === '/api/search' || request.path === '/api/search/me')).toBe(false);
    await field.press('Enter');
    await expect(page).toHaveURL(keywordUrl('카페'));
    await expect(page.getByRole('link', { name: /검색 가게/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /검색 피드/ })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('혜택 결과');
    await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
    await expect(field).toBeEnabled();
    await expect(page.getByRole('heading', { name: '혜택', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '어떤 서비스를 찾으세요?' })).toHaveCount(0);
    const searches = requests.filter(request => request.path === '/api/search');
    expect(searches).toHaveLength(1);
    expect(searches[0]).toMatchObject({ keyword: '카페', limit: '5' });
    expect(requests.some(request => request.path === '/api/search/me')).toBe(false);
    await field.fill('광고 관리');
    expect(requests.filter(request => request.path === '/api/search')).toHaveLength(1);
    await field.press('Enter');
    await expect(page.locator('a[href="/business?tab=ads"]')).toHaveCount(0);
});

test('a business menu alias navigates to the existing advertisement tab', async ({ page }) => {
    await setup(page, true);
    await page.goto(keywordUrl('홍보'));
    const advertisement = page.locator('a[href="/business?tab=ads"]');
    await expect(advertisement).toBeVisible();
    await advertisement.click();
    await expect(page).toHaveURL(url => url.pathname === '/business' && url.searchParams.get('tab') === 'ads');
});

test('a personal result rechecks one waiting entry and a conversation is opened only after explicit selection', async ({ page }) => {
    const requests = await setup(page, true);
    await page.goto(keywordUrl('카페'));
    await expect(page.getByRole('link', { name: /선택할 내 대화/ })).toBeVisible();
    expect(requests.some(request => request.path.endsWith('/open') || request.path.endsWith('/read'))).toBe(false);
    await page.getByRole('link', { name: /선택할 내 웨이팅/ }).click();
    const detail = page.getByRole('dialog', { name: '웨이팅 상세' });
    await expect(detail).toContainText('10번');
    await expect(page).toHaveURL(url => url.pathname === '/my-reservations' && url.searchParams.get('tab') === 'waiting' && !url.searchParams.has('entryId'));
    await page.goBack();
    await expect(page).toHaveURL(keywordUrl('카페'));
    await expect(page.getByRole('searchbox')).toHaveValue('카페');
    await page.getByRole('link', { name: /선택할 내 대화/ }).click();
    await expect(page.getByText('검색에서 여는 합성 대화', { exact: true })).toBeVisible();
    expect(requests.some(request => request.path === '/api/chat/support/open')).toBe(true);
});


test('clearing a confirmed search restores only the original landing and old-word typing stays local', async ({ page }) => {
    const requests = await setup(page);
    await page.goto(keywordUrl('카페'));
    await expect(page.getByRole('link', { name: /검색 가게/ })).toBeVisible();
    const calls = requests.filter(request => request.path === '/api/search').length;
    await page.getByRole('button', { name: '검색어 지우기' }).click();
    await expect(page).toHaveURL('/search');
    await expect(page.getByLabel('통합 검색 결과')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '어떤 서비스를 찾으세요?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '빠른 검색' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '최근 검색' })).toBeVisible();
    await page.getByRole('searchbox').fill('카페');
    await expect(page.getByRole('button', { name: '카페 검색하기' })).toBeVisible();
    expect(requests.filter(request => request.path === '/api/search')).toHaveLength(calls);
    await expect(page.getByRole('heading', { name: '어떤 서비스를 찾으세요?' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /검색 가게/ })).toHaveCount(0);
});

for (const [path, placeholder, endpoint] of [
    ['/stores', '가게 검색', '/api/stores'],
    ['/waiting', '웨이팅 가게 검색', '/api/waiting/stores'],
]) {
    test(`the ${path} list keeps its tabs and filters while global search starts empty`, async ({ page }) => {
        const requests = await setup(page);
        await page.goto(path + '?keyword=' + encodeURIComponent('공방') + '&view=list&sort=reviewCount&page=1');
        const field = page.getByPlaceholder(placeholder, { exact: true });
        await expect(field).toBeVisible();
        const header = page.locator('.reserve-header');
        const tabs = page.getByRole('navigation', { name: '서비스 탐색' });
        const selected = path === '/stores' ? '탐색' : '웨이팅';
        await expect(tabs).toBeVisible();
        for (const name of ['홈', '탐색', '혜택', '웨이팅', '피드']) await expect(tabs.getByRole('link', { name, exact: true })).toBeVisible();
        await expect(header.getByRole('button', { name: /목록 검색어 수정/ })).toHaveCount(0);
        await expect(header.getByRole('searchbox')).toHaveCount(0);
        await expect(header.getByRole('button', { name: '이전 화면으로 돌아가기' })).toHaveCount(0);
        await expect(header.getByRole('link', { name: '통합 검색', exact: true })).toHaveAttribute('href', '/search');
        await field.click();
        await expect(field).toBeFocused();
        await expect(page).toHaveURL(url => url.pathname === path && url.searchParams.get('keyword') === '공방');
        await field.fill('공방 검색');
        await field.press('Enter');
        await expect(page).toHaveURL(url => url.pathname === path && url.searchParams.get('keyword') === '공방 검색'
            && url.searchParams.get('view') === 'list' && url.searchParams.get('sort') === 'reviewCount' && url.searchParams.get('page') === '1');
        await expect.poll(() => requests.some(request => request.path === endpoint && request.keyword === '공방 검색')).toBe(true);
        expect(requests.some(request => request.path === '/api/search' || request.path === '/api/search/me')).toBe(false);
        await expect(tabs).toBeVisible();
        await expect(tabs.getByRole('link', { name: selected, exact: true })).toHaveAttribute('aria-current', 'page');
        const returnUrl = page.url();
        const otherPath = path === '/stores' ? '/waiting' : '/stores';
        const otherPlaceholder = path === '/stores' ? '웨이팅 가게 검색' : '가게 검색';
        await tabs.getByRole('link', { name: selected === '탐색' ? '웨이팅' : '탐색', exact: true }).click();
        await expect(page).toHaveURL(url => url.pathname === otherPath);
        await expect(page.getByPlaceholder(otherPlaceholder, { exact: true })).toBeVisible();
        await tabs.getByRole('link', { name: selected, exact: true }).click();
        await expect(page).toHaveURL(returnUrl);
        await expect(field).toHaveValue('공방 검색');
        await expect(tabs).toBeVisible();
        await page.getByRole('link', { name: '통합 검색', exact: true }).click();
        await expect(page).toHaveURL('/search');
        await expect(page.getByRole('searchbox')).toHaveValue('');
        expect(requests.some(request => request.path === '/api/search' || request.path === '/api/search/me')).toBe(false);
        await page.getByRole('button', { name: '취소', exact: true }).click();
        await expect(page).toHaveURL(returnUrl);
        await expect(page.getByPlaceholder(placeholder, { exact: true })).toHaveValue('공방 검색');
    });
}
