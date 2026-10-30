import { describe, expect, it } from 'vitest';
import { configuredPaymentMethods, paymentMethodRequest, paymentMethodAvailability, paymentWasCancelled } from './paymentMethods';
const toss = 'channel-key-11111111-1111-4111-8111-111111111111';
const kakao = 'channel-key-22222222-2222-4222-8222-222222222222';
const tosspay = 'channel-key-33333333-3333-4333-8333-333333333333';
const kcp = 'channel-key-44444444-4444-4444-8444-444444444444';
const naver = 'channel-key-55555555-5555-4555-8555-555555555555';
const naverPrepared = { merchantUid: 'ORDsynthetic7', reservationId: 7, amount: 10000, productName: '합성 가게 예약금' };
const desktop = { mobile: false, apple: false, safari: false, applePay: false };
describe('결제창 사용자 종료', () => {
    it.each([
        { code: 'PAY_PROCESS_CANCELED' },
        { code: 'PGProviderError', pgCode: '3001', message: '[3001] 사용자 Web Close' },
        { code: 'PGProviderError', pgCode: 3001 },
        { code: 'PGProviderError', message: '[3001] 사용자 Web Close' },
    ])('KCP의 명시적 종료를 정상 닫기로 구분해요 (%j)', result => {
        expect(paymentWasCancelled(result, { pgProvider: 'kcp_v2' })).toBe(true);
    });
    it.each([
        [{ code: 'PGProviderError', pgCode: '3001' }, { pgProvider: 'tosspayments' }],
        [{ code: 'PGProviderError', pgCode: '3001' }, undefined],
        [{ code: 'PGProviderError', pgCode: '9999', message: '[3001] 사용자 Web Close' }, { pgProvider: 'kcp_v2' }],
        [{ code: 'PGProviderError', message: 'Web Close' }, { pgProvider: 'kcp_v2' }],
    ])('다른 PG와 불명확한 종료는 취소로 확정하지 않아요 (%j)', (result, method) => {
        expect(paymentWasCancelled(result, method)).toBe(false);
    });
});
describe('네이버페이 전용 채널', () => {
    const env = { DEV: true, VITE_PORTONE_PAYMENT_ENV: 'TEST', VITE_PORTONE_NAVERPAY_CHANNEL_KEY: naver,
        VITE_PORTONE_KCP_TEST_CHANNEL_KEY: kcp, VITE_PORTONE_KCP_TEST_EASY_PAY_PROVIDERS: 'NAVERPAY',
        VITE_PORTONE_TOSS_CHANNEL_KEY: toss, VITE_PORTONE_TOSS_EASY_PAY_PROVIDERS: 'NAVERPAY',
        VITE_PORTONE_CHANNEL_KEY: kakao, VITE_PORTONE_TOSSPAY_CHANNEL_KEY: tosspay };
    it('전용 네이버 채널이 KCP·토스보다 우선하며 다른 브랜드 채널은 유지해요', () => {
        const methods = configuredPaymentMethods(env, naverPrepared);
        expect(methods.filter(method => method.brand === 'NAVERPAY')).toEqual([expect.objectContaining({ id: 'NAVERPAY', channelKey: naver, pgProvider: 'naverpay' })]);
        expect(methods.find(method => method.brand === 'CARD').channelKey).toBe(kcp);
        expect(methods.find(method => method.brand === 'KAKAOPAY').channelKey).toBe(kakao);
        expect(methods.find(method => method.brand === 'TOSSPAY').channelKey).toBe(tosspay);
        expect(paymentMethodRequest(methods.find(method => method.brand === 'NAVERPAY'), naverPrepared)).toEqual({
            channelKey: naver, payMethod: 'EASY_PAY', windowType: { pc: 'POPUP', mobile: 'REDIRECTION' },
            bypass: { naverpay: { productItems: [{ categoryType: 'ETC', categoryId: 'ETC', uid: 'reservation-7', name: naverPrepared.productName, count: 1 }] } },
        });
    });
    it('예약과 광고를 구분하고 상품 수량을 인원수나 결제 금액으로 바꾸지 않아요', () => {
        const prepared = { merchantUid: 'ADsynthetic8', adId: 8, amount: 20000, productName: '합성 광고', guestCount: 3 };
        const method = configuredPaymentMethods(env, prepared).find(value => value.brand === 'NAVERPAY');
        expect(paymentMethodRequest(method, prepared).bypass.naverpay.productItems).toEqual([{
            categoryType: 'ETC', categoryId: 'ETC', uid: 'advertisement-8', name: prepared.productName, count: 1,
        }]);
    });
    it.each([0, 99, 99.5, undefined])('최소 금액과 정수 계약을 확인하고 다른 PG로 전환하지 않아요 (%s)', amount => {
        const prepared = { ...naverPrepared, amount };
        const method = configuredPaymentMethods(env, prepared).find(value => value.brand === 'NAVERPAY');
        expect(method.channelKey).toBe(naver);
        expect(paymentMethodAvailability(method).available).toBe(false);
        expect(() => paymentMethodRequest({ ...method, disabledReason: undefined }, prepared)).toThrow('100원');
    });
    it('100원부터 네이버를 허용하고 누락된 상품 정보로는 요청하지 않아요', () => {
        const method = configuredPaymentMethods(env).find(value => value.brand === 'NAVERPAY');
        expect(paymentMethodRequest(method, { ...naverPrepared, amount: 100 }).channelKey).toBe(naver);
        for (const prepared of [{ ...naverPrepared, productName: '' }, { ...naverPrepared, reservationId: null }, { ...naverPrepared, reservationId: -1 }]) {
            expect(paymentMethodAvailability(configuredPaymentMethods(env, prepared).find(value => value.brand === 'NAVERPAY')).available).toBe(false);
            expect(() => paymentMethodRequest(method, prepared)).toThrow('주문 정보');
        }
    });
    it('전용 채널이 없으면 기존 설정을 유지하고 단독 채널만 있어도 요청을 준비해요', () => {
        for (const channel of ['', 'invalid'])
            expect(configuredPaymentMethods({ ...env, VITE_PORTONE_NAVERPAY_CHANNEL_KEY: channel }, naverPrepared).find(value => value.brand === 'NAVERPAY').pgProvider).toBe('kcp_v2');
        const [standalone] = configuredPaymentMethods({ VITE_PORTONE_NAVERPAY_CHANNEL_KEY: naver }, naverPrepared);
        expect(standalone.brand).toBe('NAVERPAY');
        expect(paymentMethodRequest(standalone, naverPrepared)).not.toHaveProperty('easyPay');
    });
    it('개인 샌드박스 채널은 개발 TEST에서만 선택하고 배포의 전용 채널을 바꾸지 않아요', () => {
        const sandbox = 'channel-key-66666666-6666-4666-8666-666666666666';
        const sandboxEnv = { ...env, VITE_PORTONE_NAVERPAY_TEST_CHANNEL_KEY: sandbox };
        expect(configuredPaymentMethods(sandboxEnv, naverPrepared).find(method => method.brand === 'NAVERPAY'))
            .toMatchObject({ channelKey: sandbox, pgProvider: 'naverpay', testOnly: true });
        for (const guard of [{ DEV: false }, { VITE_PORTONE_PAYMENT_ENV: 'LIVE' }]) {
            const deployed = configuredPaymentMethods({ ...sandboxEnv, ...guard }, naverPrepared).find(method => method.brand === 'NAVERPAY');
            expect(deployed.channelKey).toBe(naver);
            expect(deployed).not.toHaveProperty('testOnly');
            expect(configuredPaymentMethods({ ...sandboxEnv, ...guard, VITE_PORTONE_NAVERPAY_CHANNEL_KEY: '',
                VITE_PORTONE_TOSS_EASY_PAY_PROVIDERS: '' }, naverPrepared).some(method => method.brand === 'NAVERPAY')).toBe(false);
        }
    });
});

describe('결제 수단 설정', () => {
    it('KCP에서 확인해 명시한 간편결제만 직접 연결하고 정상 단독 채널은 보존해요', () => {
        const env = { DEV: true, VITE_PORTONE_PAYMENT_ENV: 'TEST', VITE_PORTONE_KCP_TEST_CHANNEL_KEY: kcp,
            VITE_PORTONE_KCP_TEST_EASY_PAY_PROVIDERS: 'NAVERPAY,SAMSUNGPAY,APPLEPAY,KAKAOPAY,TOSSPAY',
            VITE_PORTONE_TOSS_CHANNEL_KEY: toss, VITE_PORTONE_CHANNEL_KEY: kakao, VITE_PORTONE_TOSSPAY_CHANNEL_KEY: tosspay,
            VITE_PORTONE_TOSS_TEST_EASY_PAY_PROVIDERS: 'NAVERPAY,SAMSUNGPAY,APPLEPAY' };
        const methods = configuredPaymentMethods(env, { merchantUid: 'ORDfixture' });
        for (const brand of ['NAVERPAY', 'SAMSUNGPAY', 'APPLEPAY'])
            expect(methods.find(method => method.brand === brand)).toMatchObject({ channelKey: kcp, pgProvider: 'kcp_v2', easyPayProvider: brand, testOnly: true });
        expect(methods.find(method => method.brand === 'KAKAOPAY').channelKey).toBe(kakao);
        expect(methods.find(method => method.brand === 'TOSSPAY').channelKey).toBe(tosspay);
        const naver = methods.find(method => method.brand === 'NAVERPAY');
        expect(paymentMethodRequest(naver, { merchantUid: 'ORDfixture', productName: '가'.repeat(80) })).toMatchObject({
            channelKey: kcp, payMethod: 'EASY_PAY', easyPay: { easyPayProvider: 'NAVERPAY', availablePayMethods: ['CHARGE'] }, bypass: { kcp_v2: { site_name: 'RESERVE' } },
        });
        for (const guard of [{ DEV: false }, { VITE_PORTONE_PAYMENT_ENV: 'LIVE' }, { VITE_PORTONE_KCP_TEST_CHANNEL_KEY: 'invalid' }])
            expect(configuredPaymentMethods({ ...env, ...guard }).some(method => method.pgProvider === 'kcp_v2')).toBe(false);
    });
    it('KCP 네이버 포인트 시험을 선택해도 나머지 수단과 배포 경로는 유지해요', () => {
        const env = { DEV: true, VITE_PORTONE_PAYMENT_ENV: 'TEST', VITE_PORTONE_KCP_TEST_CHANNEL_KEY: kcp,
            VITE_PORTONE_KCP_TEST_EASY_PAY_PROVIDERS: 'NAVERPAY', VITE_PORTONE_TOSS_CHANNEL_KEY: toss,
            VITE_PORTONE_CHANNEL_KEY: kakao, VITE_PORTONE_TOSSPAY_CHANNEL_KEY: tosspay,
            VITE_PORTONE_TOSS_TEST_EASY_PAY_PROVIDERS: 'NAVERPAY,SAMSUNGPAY,APPLEPAY' };
        const methods = configuredPaymentMethods(env, { merchantUid: 'ORDfixture' });
        expect(methods.map(method => [method.brand, method.channelKey])).toEqual([
            ['CARD', kcp], ['NAVERPAY', kcp], ['KAKAOPAY', kakao], ['TOSSPAY', tosspay], ['SAMSUNGPAY', toss], ['APPLEPAY', toss],
        ]);
        const naverRequest = paymentMethodRequest(methods.find(method => method.brand === 'NAVERPAY'), { merchantUid: 'ORDfixture' });
        expect(naverRequest.easyPay).toEqual({ easyPayProvider: 'NAVERPAY', availablePayMethods: ['CHARGE'] });
        expect(configuredPaymentMethods({ ...env, DEV: false }).some(method => method.pgProvider === 'kcp_v2')).toBe(false);
        const samsungRequest = paymentMethodRequest(methods.find(method => method.brand === 'SAMSUNGPAY'));
        expect(samsungRequest.easyPay).toEqual({ easyPayProvider: 'SAMSUNGPAY' });
    });
    it('KCP 간편결제도 기존 주문번호를 바꾸거나 토스로 자동 전환하지 않아요', () => {
        const env = { DEV: true, VITE_PORTONE_PAYMENT_ENV: 'TEST', VITE_PORTONE_KCP_TEST_CHANNEL_KEY: kcp,
            VITE_PORTONE_KCP_TEST_EASY_PAY_PROVIDERS: 'NAVERPAY' };
        const naver = configuredPaymentMethods(env, { merchantUid: 'ORD-legacy' }).find(method => method.brand === 'NAVERPAY');
        expect(naver.pgProvider).toBe('kcp_v2');
        expect(paymentMethodAvailability(naver).available).toBe(false);
        expect(() => paymentMethodRequest({ ...naver, disabledReason: undefined }, { merchantUid: 'ORD-legacy' })).toThrow('기존 주문번호');
    });
    it('로컬 TEST의 카드만 KCP로 연결하고 기존 간편결제 채널은 유지해요', () => {
        const env = { DEV: true, VITE_PORTONE_PAYMENT_ENV: 'TEST', VITE_PORTONE_KCP_TEST_CHANNEL_KEY: kcp,
            VITE_PORTONE_TOSS_CHANNEL_KEY: toss, VITE_PORTONE_CHANNEL_KEY: kakao, VITE_PORTONE_TOSSPAY_CHANNEL_KEY: tosspay };
        const methods = configuredPaymentMethods(env, { merchantUid: 'ORD20261028abc123' });
        expect(methods.map(method => method.channelKey)).toEqual([kcp, kakao, tosspay]);
        const request = paymentMethodRequest({ ...methods[0], cardCompany: 'SHINHAN_CARD' },
            { merchantUid: 'ORD20261028abc123', productName: '가'.repeat(80) });
        expect(request).toMatchObject({ channelKey: kcp, card: { cardCompany: 'SHINHAN_CARD', installment: { monthOption: { fixedMonth: 0 } } },
            bypass: { kcp_v2: { site_name: 'RESERVE' } } });
        expect(new TextEncoder().encode(request.orderName).length).toBeLessThanOrEqual(100);
        expect(configuredPaymentMethods({ ...env, DEV: false })[0].channelKey).toBe(toss);
        expect(configuredPaymentMethods({ ...env, VITE_PORTONE_PAYMENT_ENV: 'LIVE' })[0].channelKey).toBe(toss);
    });
    it('기존 주문번호를 바꾸거나 다른 카드 PG로 넘기지 않고 KCP 요청을 막아요', () => {
        const env = { DEV: true, VITE_PORTONE_PAYMENT_ENV: 'TEST', VITE_PORTONE_KCP_TEST_CHANNEL_KEY: kcp, VITE_PORTONE_TOSS_CHANNEL_KEY: toss };
        const [legacy] = configuredPaymentMethods(env, { merchantUid: 'ORD-legacy' });
        expect(legacy.channelKey).toBe(kcp);
        expect(paymentMethodAvailability(legacy).available).toBe(false);
        expect(() => paymentMethodRequest({ ...legacy, disabledReason: undefined, cardCompany: 'KOOKMIN_CARD' }, { merchantUid: 'ORD-legacy' })).toThrow('기존 주문번호');
        const [card] = configuredPaymentMethods(env, { merchantUid: 'ORDvalid123' });
        expect(() => paymentMethodRequest({ ...card, cardCompany: 'JEONBUK_CARD' }, { merchantUid: 'ORDvalid123' })).toThrow('지원하는 카드사');
        expect(() => paymentMethodRequest({ ...card, cardCompany: 'KOOKMIN_CARD' }, { merchantUid: 'A'.repeat(41) })).toThrow('기존 주문번호');
    });
    it('카드사를 선택한 카드만 서버 채널로 직접 호출해요', () => {
        const methods = configuredPaymentMethods({ VITE_PORTONE_TOSS_CHANNEL_KEY: toss, VITE_PORTONE_CHANNEL_KEY: kakao });
        expect(methods.map(method => method.id)).toEqual(['CARD', 'KAKAOPAY']);
        expect(() => paymentMethodRequest(methods[0])).toThrow('카드사');
        expect(() => paymentMethodRequest({ ...methods[0], cardCompany: 'unknown' })).toThrow('카드사');
        expect(paymentMethodRequest({ ...methods[0], cardCompany: 'SHINHAN_CARD' }))
            .toEqual({ channelKey: toss, payMethod: 'CARD', card: { cardCompany: 'SHINHAN_CARD' } });
        expect(paymentMethodRequest(methods[1])).toEqual({ channelKey: kakao, payMethod: 'EASY_PAY', easyPay: { easyPayProvider: 'KAKAOPAY' } });
    });
    it('여섯 수단만 순서대로 제공하며 단독 채널을 우선해요', () => {
        const methods = configuredPaymentMethods({ VITE_PORTONE_TOSS_CHANNEL_KEY: toss, VITE_PORTONE_CHANNEL_KEY: kakao, VITE_PORTONE_TOSSPAY_CHANNEL_KEY: tosspay,
            VITE_PORTONE_TOSS_EASY_PAY_PROVIDERS: 'APPLEPAY,SSGPAY,LPAY,PAYCO,TOSSPAY,NAVERPAY,TOSSPAY,unknown,KAKAOPAY,SAMSUNGPAY' });
        expect(methods.map(method => method.brand)).toEqual(['CARD', 'NAVERPAY', 'KAKAOPAY', 'TOSSPAY', 'SAMSUNGPAY', 'APPLEPAY']);
        expect(methods.find(method => method.brand === 'KAKAOPAY').channelKey).toBe(kakao);
        expect(paymentMethodRequest(methods.find(method => method.brand === 'TOSSPAY'))).toEqual({ channelKey: tosspay, payMethod: 'EASY_PAY' });
        expect(paymentMethodRequest(methods.find(method => method.brand === 'NAVERPAY')))
            .toEqual({ channelKey: toss, payMethod: 'EASY_PAY', easyPay: { easyPayProvider: 'NAVERPAY' } });
    });
    it('개발 TEST에서만 미확인 허용 수단을 시험해요', () => {
        const env = { VITE_PORTONE_TOSS_CHANNEL_KEY: toss, VITE_PORTONE_PAYMENT_ENV: 'TEST',
            VITE_PORTONE_TOSS_TEST_EASY_PAY_PROVIDERS: 'NAVERPAY,PAYCO,SSGPAY,LPAY,PAYPAL,unknown', DEV: true };
        expect(configuredPaymentMethods(env).map(method => method.id)).toEqual(['CARD','TOSS_NAVERPAY']);
        expect(configuredPaymentMethods(env)[1].testOnly).toBe(true);
        expect(configuredPaymentMethods({ ...env, DEV: false }).map(method => method.id)).toEqual(['CARD']);
        expect(configuredPaymentMethods({ ...env, VITE_PORTONE_PAYMENT_ENV: 'LIVE' }).map(method => method.id)).toEqual(['CARD']);
    });
    it('확인된 수단은 시험 목록과 겹쳐도 TEST 시험으로 바뀌지 않아요', () => {
        expect(configuredPaymentMethods({ VITE_PORTONE_TOSS_CHANNEL_KEY: toss, DEV: true, VITE_PORTONE_PAYMENT_ENV: 'TEST',
            VITE_PORTONE_TOSS_EASY_PAY_PROVIDERS: 'NAVERPAY', VITE_PORTONE_TOSS_TEST_EASY_PAY_PROVIDERS: 'NAVERPAY' })[1]).not.toHaveProperty('testOnly');
    });
    it('채널 없는 시험 목록과 지원 밖 수단은 요청을 만들지 않아요', () => {
        expect(configuredPaymentMethods({ DEV: true, VITE_PORTONE_PAYMENT_ENV: 'TEST', VITE_PORTONE_TOSS_TEST_EASY_PAY_PROVIDERS: 'NAVERPAY' })).toEqual([]);
        expect(configuredPaymentMethods({ VITE_PORTONE_TOSS_CHANNEL_KEY: 'invalid', VITE_PORTONE_TOSS_EASY_PAY_PROVIDERS: 'NAVERPAY' })).toEqual([]);
        expect(() => paymentMethodRequest({ channelKey: toss, payMethod: 'EASY_PAY', easyPayProvider: 'PAYCO' })).toThrow('지원하지');
        expect(() => paymentMethodRequest({ channelKey: 'invalid', payMethod: 'CARD', cardCompany: 'SHINHAN_CARD' })).toThrow('다시 선택');
    });
});
describe('기기별 결제 가능 여부', () => {
    it.each([
        ['삼성페이 PC', 'SAMSUNGPAY', desktop, true],
        ['삼성페이 iPhone', 'SAMSUNGPAY', { mobile: true, android: false }, false],
        ['삼성페이 지원 여부 미상 Android', 'SAMSUNGPAY', { mobile: true, android: true }, true],
        ['삼성페이 Pixel', 'SAMSUNGPAY', { mobile: true, android: true, nonGalaxy: true }, false],
        ['Apple Pay Windows', 'APPLEPAY', desktop, false],
        ['Apple Pay Safari', 'APPLEPAY', { apple: true, safari: true, applePay: true }, true],
        ['Apple Pay Chrome', 'APPLEPAY', { apple: true, safari: false, applePay: true }, false],
        ['Apple Pay 지원 확인 실패', 'APPLEPAY', { apple: true, safari: true, applePay: false }, false],
    ])('%s', (_label, brand, device, available) => {
        const result = paymentMethodAvailability({ brand }, device);
        expect(result.available).toBe(available);
        expect(Boolean(result.reason)).toBe(!available);
    });
    it('미지원 환경에서는 요청 단계에서도 Apple Pay를 막아요', () => {
        expect(() => paymentMethodRequest({ channelKey: toss, payMethod: 'EASY_PAY', easyPayProvider: 'APPLEPAY' })).toThrow('Safari');
    });
});
