import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { installReleasePreview, account, store } from './reservation-release-preview.js';

export const SECURITY_SCENARIOS = [
    ['enroll', '추가 인증 등록'], ['totp', '인증 앱 QR'], ['codes', '일회용 복구코드'],
    ['verify', '로그인 추가 인증'], ['backup', '복구코드 로그인'], ['settings', '인증 수단 목록'],
    ['manage', '인증 수단 관리'], ['optional', '일반 회원 선택 설정'], ['unregistered', '일반 회원 연결'],
    ['login', '로그인'], ['signup', '회원가입'], ['profile', '기본 프로필 아이콘'], ['news', '혜택·소식 디자인'], ['payment', '예약·결제 방법 선택'],
    ['settlement', 'TEST 가상 정산'], ['settlementoff', '가상 정산 준비 상태'], ['messenger', '메시지 첫 열기'],
];
export const scenarioPath = mode => mode === 'signup' ? '/signup?preview=signup'
    : mode === 'profile' ? '/my-page?tab=photo&preview=profile'
    : mode === 'news' ? '/benefits?preview=news'
    : mode === 'login' ? '/login?preview=login'
    : ['settlement', 'settlementoff'].includes(mode) ? '/business?tab=settlements&preview=' + mode
        : mode === 'messenger' ? '/store/81?preview=messenger'
    : mode === 'payment' ? '/my-reservations?preview=payment'
    : ['settings', 'manage', 'optional', 'unregistered'].includes(mode) ? '/my-page?preview=' + mode
        : '/login?mfa=1&preview=' + mode;
const pageOf = content => ({ content, page: { number: 0, totalElements: content.length, totalPages: content.length ? 1 : 0 } });
const demoCodes = Array.from({ length: 10 }, (_, index) => 'DEMO-RECOVERY-' + String(index + 1).padStart(2, '0'));

export async function installAccountSecurityPreview(page, origin, { theme = 'light' } = {}) {
    account.profileImageUrl = origin + '/__release-preview__/avatar.svg';
    store.mainImageUrl = origin + '/og-image.png';
    store.detailImageUrls = [store.mainImageUrl];
    const base = await installReleasePreview(page, { port: new URL(origin).port, theme });
    const newsPhoto = await readFile(new URL('../../public/og-image.png', import.meta.url));
    const newsItems = ['STANDARD', 'PHOTO', 'COMPACT'].map((design, index) => ({ id: 901 + index, storeId: 81,
        storeName: '미리보기 가게', title: '가게에서 전하는 안내', excerpt: '밝은 배경에서도 읽을 수 있는 소식이에요.',
        content: '편안하게 방문해주세요.', newsType: 'NEWS', state: 'PUBLISHED', benefitState: 'APPROVED', design,
        images: [{ id: 901 + index, url: '/api/store-news/media/' + (901 + index), width: 1200, height: 630 }],
        createdAt: '2026-10-27T00:00:00Z', revision: 0 }));
    const state = { mode: null, registered: false, verified: false, authenticated: false, paid: false, sdkCalls: 0 };
    const reservation = { id: 701, storeId: 81, storeName: '서촌 도예공방', storeMainImageUrl: origin + '/og-image.png', reservationCode: 'DEMO-RESERVATION-701',
        reservationDate: '2026-10-28', reservationTime: '14:00:00', guestCount: 2, depositAmount: 10000,
        depositPaid: false, status: 'PENDING', attendanceRefundEnabled: true, canCancel: true,
        canEdit: true, memberId: account.id, memberName: account.name, createdAt: new Date().toISOString(),
        allowLatePayment: false, paymentTimeoutMinutes: 10, paymentDeadline: new Date(Date.now() + 600000).toISOString() };
    const ok = (route, data) => route.fulfill({ json: { success: true, data } });
    const fail = route => route.fulfill({ status: 400, json: { success: false, message: '인증 코드를 확인해주세요.' } });
    const view = (purpose = 'LOGIN') => ({ mfaRequired: true, enrollmentRequired: !state.registered,
        verified: state.verified, passkeyAvailable: state.registered && !['verify', 'backup', 'manage', 'optional'].includes(state.mode), totpAvailable: state.registered,
        purpose, expiresAt: new Date(Date.now() + 300000).toISOString() });
    await page.route('**/api/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace(/^\/api\/v1(?=\/|$)/, '/api');
        const mode = new URL(page.url()).searchParams.get('preview') || state.mode || 'enroll';
        if (state.mode !== mode) {
            state.mode = mode; state.verified = false;
            state.authenticated = !['login', 'signup', 'enroll', 'totp', 'codes', 'verify', 'backup'].includes(mode);
            state.registered = !['enroll', 'totp', 'codes', 'unregistered'].includes(mode);
        }
        const body = request.headers()['content-type']?.includes('application/json') && request.postData() ? request.postDataJSON() : {};
        if (request.resourceType() === 'eventsource' || request.headers().accept?.includes('text/event-stream'))
            return route.fulfill({ contentType: 'text/event-stream', body: 'retry: 60000' + String.fromCharCode(10, 10) });
        const member = { ...account, ...(mode === 'profile' ? { profileImageUrl: null, profileImage: null } : {}), role: ['optional', 'unregistered'].includes(mode) ? 'USER' : 'BUSINESS' };
        if (path === '/api/auth/session') return ok(route, { member: state.authenticated ? member : null, refreshPossible: false });
        if (path === '/api/member/me') return ok(route, state.authenticated ? member : null);
        if (path === '/api/store-news/config') return ok(route, { enabled: true, benefitApprovalEnabled: true,
            benefitDesignEnabled: true, benefitEventsEnabled: false, imageEnabled: true, maxImages: 6, maxImageBytes: 7340032 });
        if (path === '/api/promotions/public') return ok(route, pageOf(newsItems));
        if (path === '/api/store-news/stores') return ok(route, [{ ...store, ownerId: account.id }, { ...store, id: 82, name: '다른 미리보기 가게', ownerId: account.id }]);
        if (path === '/api/store-news/me') return ok(route, pageOf(newsItems));
        if (/^\/api\/store-news\/media\/\d+$/.test(path)) return route.fulfill({ contentType: 'image/png', body: newsPhoto });
        if (/^\/api\/store-news\/\d+$/.test(path)) return ok(route, newsItems.find(item => item.id === Number(path.split('/').at(-1))));
        if (path === '/api/auth/login-policy') return ok(route, { idleSeconds: 1209600, absoluteSeconds: 2592000 });
        if (path === '/api/stores/my') return ok(route, [{ ...store, ownerId: account.id }]);
        if (path === '/api/business/settlements/status') return ok(route, { enabled: mode !== 'settlementoff' });
        if (path === '/api/business/settlements') return ok(route, { page: 0, hasNext: false, content: [
            { paymentId: 7, reservationCode: 'DEMO-NOSHOW', reservationDate: '2026-10-24', paidAmount: 10000, refundedAmount: 0, feeAmount: 0, expectedAmount: 10000, simulatedAmount: state.simulated ? 10000 : 0, balance: state.simulated ? 0 : 10000, held: false },
            { paymentId: 8, reservationCode: 'DEMO-REFUNDED', reservationDate: '2026-10-24', paidAmount: 10000, refundedAmount: 10000, feeAmount: 0, expectedAmount: 0, simulatedAmount: 0, balance: 0, held: false },
            { paymentId: 9, reservationCode: 'DEMO-HELD', reservationDate: '2026-10-24', paidAmount: 10000, refundedAmount: 0, feeAmount: 0, expectedAmount: 0, simulatedAmount: 0, balance: 0, held: true },
        ] });
        if (path === '/api/business/settlements/81/simulate') { state.simulated = true; return ok(route, { environment: 'TEST', paymentId: 7, amount: 10000, feeAmount: 0 }); }
        if (path === '/api/member/mfa') return ok(route, { available: true, enabled: state.registered,
            required: member.role === 'BUSINESS', recoveryCodes: 10, credentials: state.registered ? [
                { id: 'demo-passkey', kind: 'PASSKEY', name: '패스키', createdAt: '2026-10-26T00:00:00' },
                { id: 'demo-totp', kind: 'TOTP', name: '인증 앱', createdAt: '2026-10-26T00:00:00' },
            ] : [] });
        if (path === '/api/member/mfa/manage') return ok(route, view('MANAGE'));
        if (path === '/api/auth/mfa/status' || path === '/api/auth/mfa/passkey/login') return ok(route, view());
        if (path === '/api/auth/mfa/totp/setup') return ok(route, { secret: 'JBSWY3DPEHPK3PXP',
            uri: 'otpauth://totp/RESERVE:DEMO?secret=JBSWY3DPEHPK3PXP&issuer=RESERVE' });
        if (path === '/api/auth/mfa/totp/confirm') {
            if (body.code !== '123456') return fail(route);
            state.registered = true; state.verified = true;
            return ok(route, { codes: demoCodes });
        }
        if (path === '/api/auth/mfa/passkey/options') {
            const publicKey = body.registration ? {
                rp: { id: 'localhost', name: 'RESERVE 합성 미리보기' },
                user: { id: Buffer.from('reserve-demo-member-41').toString('base64url'), name: 'preview@example.test', displayName: account.name },
                pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, attestation: 'none',
            } : { rpId: 'localhost', userVerification: 'required' };
            publicKey.challenge = randomBytes(32).toString('base64url');
            publicKey.timeout = 60000;
            return ok(route, JSON.stringify({ publicKey }));
        }
        if (path === '/api/auth/mfa/passkey/confirm') { state.registered = true; state.verified = true; return ok(route, { codes: demoCodes }); }
        if (path === '/api/auth/mfa/verify') {
            if (body.kind !== 'PASSKEY' && body.proof !== '123456' && !demoCodes.includes(body.proof)) return fail(route);
            state.verified = true;
            return ok(route, view(['manage', 'optional', 'settings'].includes(mode) ? 'MANAGE' : 'LOGIN'));
        }
        if (path === '/api/auth/mfa/recovery') return ok(route, { codes: demoCodes });
        if (path === '/api/auth/mfa/finish') { state.authenticated = true; return ok(route, null); }
        if (['/api/auth/mfa/cancel', '/api/auth/mfa/remove', '/api/auth/mfa/disable'].includes(path)) return ok(route, null);
        if (path === '/api/reservations/my/page') return ok(route, pageOf([{ ...reservation, depositPaid: state.paid }]));
        if (path === '/api/payment/prepare') return ok(route, { merchantUid: 'demo-reserve-payment-701', storeId: 'demo-store',
            amount: 10000, productName: '서촌 도예공방 방문 보증금', buyerName: account.name,
            buyerEmail: account.email, buyerTel: '01000000000', reservationId: 701 });
        if (path === '/api/payment/verify') { state.paid = true; return ok(route, { status: 'PAID', amount: 10000 }); }
        if (path === '/api/payment/status') return ok(route, { type: 'RESERVATION', merchantUid: 'demo-reserve-payment-701', status: state.paid ? 'PAID' : 'READY', amount: 10000, payMethod: 'CARD' });
        if (path === '/api/reservations/701') return ok(route, { ...reservation, depositPaid: state.paid });
        return route.fallback();
    });
    return { ...base, state };
}
