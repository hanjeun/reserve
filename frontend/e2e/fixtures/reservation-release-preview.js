import { readFileSync } from 'node:fs';

export const PUBLIC_ID = 'f3dd7675-84a3-4339-9e3e-2334cbe762c2';
export const TICKET = '11111111-1111-4111-8111-111111111111';
export const account = { id: 41, name: '미리보기 회원', email: 'preview@example.test', role: 'BUSINESS',
    termsAgreed: true, emailNotificationEnabled: true, marketingAgreed: false,
    profileImageUrl: 'http://127.0.0.1:4173/__release-preview__/avatar.svg' };
export const store = { id: 81, name: '서촌 도예공방', category: '공방', serviceDomain: 'CLASS',
    description: '일상의 속도를 잠시 늦추고, 나만의 도자기를 만드는 작은 공방이에요.',
    address: '서울 종로구 미리보기길 12', phone: '02-0000-0000', ownerId: 8, status: 'ACTIVE',
    mainImageUrl: 'http://127.0.0.1:4173/og-image.png', mainImageWidth: 1200, mainImageHeight: 630,
    detailImageUrls: ['http://127.0.0.1:4173/og-image.png', 'http://127.0.0.1:4173/og-image.png?preview=2'],
    bookingType: 'TIME', reservationEnabled: true, waitingEnabled: false, reservationSlotMinutes: 60,
    openTime: '09:00', closeTime: '18:00', rating: 4.8, reviewCount: 0, imageAutoplayEnabled: false,
    noShowDeposit: 0, maxCapacityPerSlot: 6, bookingDeadlineHours: 0, maxAdvanceBookingDays: 30,
    closedDays: [], autoApprovalEnabled: false };
const pageOf = content => ({ content, page: { number: 0, totalElements: content.length, totalPages: content.length ? 1 : 0 } });
const ok = (route, data) => route.fulfill({ json: { success: true, data } });
const failure = (route, status, message) => route.fulfill({ status, json: { success: false, message } });
const chatPng = readFileSync(new URL('../../public/og-image.png', import.meta.url));
const svg = (avatar, second) => avatar
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#e1e9ee"/><circle cx="120" cy="91" r="40" fill="#647e8b"/><path d="M43 234c0-74 154-74 154 0" fill="#647e8b"/></svg>'
    : `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="${second ? '#e0e8e2' : '#e7ded1'}"/><rect x="70" y="55" width="285" height="335" rx="8" fill="#faf8f2"/><path d="M210 55v335M70 220h285" stroke="#b4a58c" stroke-width="10"/><path d="M0 455h960v185H0" fill="#b79b7b"/><path d="M455 443c-35-71-37-174 28-194h72c65 20 63 123 28 194z" fill="${second ? '#648879' : '#b96949'}"/><ellipse cx="519" cy="247" rx="37" ry="10" fill="#7e4e3c"/><path d="M672 447c-28-51-30-123 18-145h58c48 22 46 94 18 145z" fill="#f0e9dd"/><ellipse cx="719" cy="301" rx="30" ry="9" fill="#bbb0a2"/><path d="M805 447c-6-91 29-138 55-172" stroke="#597764" stroke-width="9" fill="none"/><path d="M846 303c-61 11-57-42-56-58 47-2 62 30 56 58M842 325c55-5 64-46 60-62-47 0-65 35-60 62" fill="#698a75"/><text x="68" y="588" font-family="sans-serif" font-size="28" fill="#fff">RESERVE · LOCAL UI PREVIEW</text></svg>`;

/* 모든 API는 합성 응답을 사용하고 외부 출처 요청은 차단한다. */
export async function installReleasePreview(page) {
    const state = { admissionState: 'WAITING', admissionPosition: 3, admissionDate: null, statusErrors: 0, cancelErrors: 0, joins: 0, polls: 0, cancels: 0,
        reservations: [], roomOpens: 0, writes: [], external: [], unknown: [], errors: [], lastProfileSave: null,
        ticket: TICKET, admittedExpiresAt: 0, storeListError: 0, waitingListError: 0,
        serviceMode: 'OFF', serviceState: 'BYPASS', servicePosition: 7, servicePolls: 0, serviceJoins: 0,
        storeListCalls: 0, storeThrottleErrors: 0, storeThrottleAt: 0, favorite: false, favoriteToggles: 0,
        profile: { publicId: PUBLIC_ID, nickname: '흙빛 산책', bio: '천천히 만드는 시간을 좋아해요.',
            avatarSource: 'ACCOUNT', useAccountAvatar: true, avatarUrl: account.profileImageUrl } };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('reserve:theme', 'light');
    });
    const admissionStatus = () => {
        if (state.admissionState === 'ADMITTED') {
            state.admittedExpiresAt ||= Date.now() + 180000;
            if (state.admittedExpiresAt <= Date.now()) state.admissionState = 'EXPIRED';
        }
        const live = ['WAITING', 'ADMITTED', 'CLAIMED', 'CONSUMED'].includes(state.admissionState);
        return { campaignId: 'release-preview', state: state.admissionState, ticket: live ? state.ticket : null,
            position: state.admissionState === 'WAITING' ? state.admissionPosition : 0,
            expiresAt: state.admissionState === 'ADMITTED' ? state.admittedExpiresAt : 0,
            serverTime: Date.now(), pollAfterSeconds: 4 };
    };
    const serviceStatus = () => {
        const live = ['WAITING', 'ADMITTED'].includes(state.serviceState);
        const admitted = state.serviceState === 'ADMITTED';
        return { campaignId: 'service-entry', mode: state.serviceMode, state: state.serviceState,
            position: state.serviceState === 'WAITING' ? state.servicePosition : 0,
            expiresAt: admitted ? Date.now() + 900000 : 0, absoluteExpiresAt: admitted ? Date.now() + 7200000 : 0,
            serverTime: Date.now(), pollAfterSeconds: admitted || state.serviceMode === 'OFF' ? 60 : 4,
            heartbeatTimeoutSeconds: admitted ? 900 : 90, continuityId: live ? 'a'.repeat(64) : null };
    };
    const post = () => ({ id: 501, state: 'PUBLISHED', revision: 0, mine: false, createdAt: new Date().toISOString(),
        author: { ...state.profile }, content: '작은 그릇 하나를 완성했어요. 손으로 만드는 시간을 함께 나눠요.',
        images: [{ id: 1, url: '/api/feed/media/501', width: 960, height: 640 }], store: null, promotion: null });
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const pathname = url.pathname.replace(/^\/api\/v1(?=\/|$)/, '/api');
        if (!pathname.startsWith('/api/') && (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '4173')) {
            state.external.push(`${request.method()} ${url.origin}${url.pathname}`);
            return route.abort('blockedbyclient');
        }
        const method = request.method();
        if (pathname.startsWith('/__release-preview__/')) return route.fulfill({ contentType: 'image/svg+xml',
            body: svg(pathname.endsWith('avatar.svg'), pathname.endsWith('second.svg')) });
        if (!pathname.startsWith('/api/')) return route.continue();
        if (method !== 'GET') state.writes.push(`${method} ${pathname}`);
        if (pathname === '/api/service-admission') {
            state.servicePolls += 1;
            if (method === 'POST') { state.serviceJoins += 1; state.serviceState = 'WAITING'; }
            if (method === 'DELETE') state.serviceState = 'CANCELLED';
            return ok(route, serviceStatus());
        }
        if (pathname === '/api/member/me') return ok(route, account);
        if (pathname === '/api/member/login-methods') return ok(route, { memberId: account.id, email: account.email,
            passwordEnabled: true, socialProvider: 'GOOGLE', linkableSocialProvider: 'GOOGLE', socialProofFresh: true });
        if (pathname === '/api/auth/refresh') return ok(route, null);
        if (pathname.startsWith('/api/member/login-methods/') && method !== 'GET') {
            return failure(route, 409, '미리보기에서는 로그인 방법을 저장하지 않아요.');
        }
        if (pathname === '/api/stores/81') return ok(route, store);
        if (pathname === '/api/stores/my') return ok(route, []);
        if (pathname === '/api/stores') {
            state.storeListCalls += 1;
            if (state.serviceMode === 'EMERGENCY' && state.serviceState !== 'ADMITTED') return route.fulfill({ status: 429,
                headers: { 'Retry-After': '4' }, json: { success: false, message: '접속자가 많아 입장 순서를 기다리고 있어요.',
                    data: { code: 'SERVICE_ADMISSION_REQUIRED', mode: 'EMERGENCY' } } });
            if (state.storeThrottleErrors > 0) {
                state.storeThrottleErrors -= 1; state.storeThrottleAt = Date.now();
                return route.fulfill({ status: 429, headers: { 'Retry-After': '10' },
                    json: { success: false, message: '접속자가 많아 요청이 잠시 제한됐어요. 10초 후 다시 시도해주세요.',
                        data: { code: 'SERVICE_ADMISSION_THROTTLED', mode: 'EMERGENCY' } } });
            }
            if (state.storeListError) return failure(route, state.storeListError, '목록 접근 상태를 확인해주세요.');
            return ok(route, pageOf([
                { ...store, id: 31, ownerId: account.id, name: '내 미리보기 공방' }, store,
                ...Array.from({ length: 5 }, (_, index) => ({ ...store, id: 82 + index, name: `이웃 작업실 ${index + 1}` })),
            ]));
        }
        if (pathname.startsWith('/api/favorites/status/')) return ok(route, { isFavorite: state.favorite });
        if (pathname === '/api/favorites/toggle/81' && method === 'POST') {
            state.favoriteToggles += 1; state.favorite = !state.favorite;
            return ok(route, { isFavorite: state.favorite });
        }
        if (pathname === '/api/waiting/stores') {
            if (state.waitingListError) return failure(route, state.waitingListError, '웨이팅 목록 접근 상태를 확인해주세요.');
            return ok(route, pageOf([{ ...store, waitingEnabled: true, waitingIntakeMode: 'REMOTE', waitingTeams: 3 }]));
        }
        if (pathname === '/api/waiting/my') return ok(route, pageOf([{ storeName: store.name, teamsAhead: 2,
            entry: { id: 701, storeId: store.id, entryNumber: 17, status: 'WAITING', partySize: 2,
                displayName: account.name, businessDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
                createdAt: new Date(Date.now() - 600000).toISOString() } }]));
        if (pathname === '/api/reservations/calendar') {
            const month = url.searchParams.get('month');
            return ok(route, Array.from({ length: 31 }, (_, index) => ({ date: `${month}-${String(index + 1).padStart(2, '0')}`,
                status: 'OPEN', totalSlots: 6, openSlots: 6, holiday: false })));
        }
        if (pathname === '/api/reservations/availability') return ok(route, ['10:00', '11:00', '14:00', '15:00']
            .map(time => ({ time, available: true, remainingCapacity: 6, maxCapacity: 6 })));
        if (pathname === '/api/reservations/admission') {
            // 같은 가게·날짜·시간의 입장권만 복원한다.
            const time = /^(\d{2}:\d{2})(?::00)?$/.exec(url.searchParams.get('time') || '')?.[1];
            const date = url.searchParams.get('date');
            if (Number(url.searchParams.get('storeId')) !== store.id || time !== '14:00' || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return ok(route, null);
            state.admissionDate ||= date;
            if (date !== state.admissionDate) return ok(route, null);
            return ok(route, { id: 'release-preview', opensAt: new Date(Date.now() + 500).toISOString(),
                closesAt: new Date(Date.now() + 3600000).toISOString(), leaseSeconds: 180 });
        }
        if (pathname === '/api/reservations/admission/release-preview/status') {
            state.polls += 1;
            if (state.statusErrors > 0) { state.statusErrors -= 1; return failure(route, 503, '입장 확인이 잠시 지연되고 있어요.'); }
            return ok(route, admissionStatus());
        }
        if (pathname === '/api/reservations/admission/release-preview') {
            if (method === 'DELETE') {
                state.cancels += 1;
                if (state.cancelErrors > 0) { state.cancelErrors -= 1; return failure(route, 503, '대기 취소가 잠시 지연되고 있어요.'); }
                state.admissionState = 'CANCELLED';
            } else {
                state.joins += 1;
                if (state.joins > 1) state.ticket = '22222222-2222-4222-8222-222222222222';
            }
            return ok(route, admissionStatus());
        }
        if (pathname === '/api/reservations/requests/result' && method === 'POST') {
            const payload = request.postDataJSON();
            const previous = state.reservations.find(value => value.requestId === payload.requestId);
            return ok(route, previous ? { id: 901, status: 'PENDING', storeId: store.id, storeName: store.name,
                ...previous, paymentStatus: 'NONE', noShowDeposit: 0 } : null);
        }
        if (pathname === '/api/reservations' && method === 'POST') {
            if (state.admissionState !== 'ADMITTED') return failure(route, 409, '입장 상태를 확인한 뒤 예약해주세요.');
            state.reservations.push(request.postDataJSON());
            return ok(route, { id: 901, status: 'PENDING', storeId: store.id, storeName: store.name,
                ...request.postDataJSON(), paymentStatus: 'NONE', noShowDeposit: 0 });
        }
        if (/^\/api\/reservations\/my\/store\/\d+\/completed$/.test(pathname)) return ok(route, null);
        if (pathname.startsWith('/api/reservations') || pathname.startsWith('/api/reviews/')) return ok(route, pageOf([]));
        if (pathname === '/api/chat/unread' || pathname === '/api/chat/my/unread') return ok(route, 0);
        if (pathname === '/api/chat/images/config') return ok(route, { enabled: true, maxBytes: 7340032 });
        if (pathname.startsWith('/api/chat/intro/')) return ok(route, { configured: false, displayName: 'RESERVE 고객지원', items: [] });
        if (/^\/api\/chat\/stores\/\d+\/open$/.test(pathname)) {
            state.roomOpens += 1;
            return ok(route, { roomId: 12, storeId: store.id, type: 'STORE', title: store.name,
                counterpartName: store.name, viewerRole: 'MEMBER', canSend: true,
                messages: [{ id: 301, senderRole: 'OWNER', content: '안녕하세요. 궁금한 점을 편하게 남겨주세요.', createdAt: new Date().toISOString() },
                    { id: 302, senderRole: 'OWNER', content: '', type: 'IMAGE', imageUrl: '/api/chat/images/302',
                        imageWidth: 1200, imageHeight: 630, createdAt: new Date().toISOString() }] });
        }
        if (/^\/api\/chat\/images\/\d+$/.test(pathname)) return route.fulfill({ contentType: 'image/png', body: chatPng });
        if (/^\/api\/chat\/rooms\/\d+\/retractions$/.test(pathname)) return ok(route, { messages: [], nextRevision: 0, hasMore: false });
        if (/^\/api\/chat\/rooms\/\d+\/read$/.test(pathname)) return ok(route, null);
        if (/^\/api\/chat\/rooms\/\d+\/messages$/.test(pathname)) return ok(route, []);
        if (pathname.startsWith('/api/chat/')) return ok(route, pageOf([]));
        if (pathname === '/api/feed/config') return ok(route, { enabled: true, imageEnabled: true, maxImages: 6, maxImageBytes: 7340032 });
        if (pathname === '/api/feed/interactions/config') return ok(route, { enabled: true, newsEnabled: true, notificationsEnabled: true, commentsEnabled: true });
        if (pathname === '/api/feed/notifications/count') return ok(route, { unread: 2 });
        if (pathname === '/api/feed/me/profile') {
            if (method === 'PUT') {
                state.lastProfileSave = request.postDataJSON();
                state.profile = { ...state.profile, ...state.lastProfileSave,
                    avatarUrl: state.lastProfileSave.avatarSource === 'NONE' ? null : account.profileImageUrl };
            }
            return ok(route, state.profile);
        }
        if (pathname === `/api/feed/authors/${PUBLIC_ID}`) return ok(route, state.profile);
        if (pathname === '/api/feed/posts' || pathname === '/api/feed/me/posts' || pathname.endsWith(`/authors/${PUBLIC_ID}/posts`)) return ok(route, pageOf([post()]));
        if (pathname === '/api/feed/posts/501') return ok(route, post());
        if (pathname === '/api/feed/media/501') return route.fulfill({ contentType: 'image/svg+xml', body: svg(false, false) });
        if (pathname.startsWith('/api/feed/likes/')) return ok(route, { likeCount: 12, commentCount: 3, liked: false });
        if (pathname === '/api/feed/regions') return ok(route, []);
        state.unknown.push(`${method} ${pathname}`);
        return ok(route, pathname.endsWith('/unread') ? 0 : []);
    });
    return state;
}
