const easyProviders = Object.freeze({
    NAVERPAY: '네이버페이', KAKAOPAY: '카카오페이', TOSSPAY: '토스페이', SAMSUNGPAY: '삼성페이', APPLEPAY: 'Apple Pay',
});
const validKey = value => typeof value === 'string' && /^channel-key-[0-9a-f-]{36}$/i.test(value);
const providerCodes = value => (value || '').split(',').map(code => code.trim().toUpperCase()).filter(code => Object.hasOwn(easyProviders, code));
export const CARD_COMPANIES = Object.freeze([
    { code: 'KOOKMIN_CARD', label: 'KB국민' }, { code: 'SHINHAN_CARD', label: '신한' }, { code: 'SAMSUNG_CARD', label: '삼성' },
    { code: 'HYUNDAI_CARD', label: '현대' }, { code: 'LOTTE_CARD', label: '롯데' }, { code: 'HANA_CARD', label: '하나' },
    { code: 'WOORI_CARD', label: '우리' }, { code: 'NH_CARD', label: 'NH농협' }, { code: 'BC_CARD', label: 'BC' },
    { code: 'CITI_CARD', label: '씨티' }, { code: 'GWANGJU_CARD', label: '광주' }, { code: 'JEONBUK_CARD', label: '전북' }, { code: 'SUHYUP_CARD', label: '수협' },
]);
export const cardCompanyLabel = code => CARD_COMPANIES.find(company => company.code === code)?.label;
export const cardCompanySupported = (code, provider) => Boolean(cardCompanyLabel(code)) && !(provider === 'kcp_v2' && code === 'JEONBUK_CARD');
const kcpOrderCompatible = value => typeof value === 'string' && /^[A-Za-z0-9]{1,40}$/.test(value);
const kcpOrderRestriction = prepared => prepared && !kcpOrderCompatible(prepared.merchantUid)
    ? { disabledReason: '기존 주문번호는 KCP TEST에서 사용할 수 없어요. 다른 결제 수단을 선택해주세요.' } : {};
const naverOrderRestriction = prepared => {
    if (!Number.isSafeInteger(prepared?.amount) || prepared.amount < 100)
        return { disabledReason: '네이버페이는 100원 이상 결제할 수 있어요.' };
    const id = prepared.reservationId ?? prepared.adId;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof prepared.productName !== 'string' || !prepared.productName.trim())
        return { disabledReason: '네이버페이 주문 정보를 확인하지 못했어요. 내역에서 다시 시도해주세요.' };
    return {};
};
export const paymentMethodBrand = method => method?.brand || method?.easyPayProvider || (method?.id === 'TOSSPAY' ? 'TOSSPAY' : method?.payMethod);

export function paymentWasCancelled(result, method) {
    if (/cancel|취소/i.test([result?.code, result?.message, result?.pgMessage].join(' '))) return true;
    // KCP의 3001은 사용자 종료예요. 다른 PG의 같은 번호에는 적용하지 않아요.
    return method?.pgProvider === 'kcp_v2' && (String(result?.pgCode ?? '') === '3001'
        || result?.pgCode == null && /^\[3001\]\s*사용자\s+Web\s+Close\s*$/i.test(result?.message || ''));
}

export function configuredPaymentMethods(env = import.meta.env, prepared) {
    const methods = [];
    const toss = env.VITE_PORTONE_TOSS_CHANNEL_KEY;
    const localTest = env.DEV === true && env.VITE_PORTONE_PAYMENT_ENV === 'TEST';
    const naverTest = localTest && validKey(env.VITE_PORTONE_NAVERPAY_TEST_CHANNEL_KEY) ? env.VITE_PORTONE_NAVERPAY_TEST_CHANNEL_KEY : null;
    const kcp = env.DEV === true && env.VITE_PORTONE_PAYMENT_ENV === 'TEST' && validKey(env.VITE_PORTONE_KCP_TEST_CHANNEL_KEY)
        ? env.VITE_PORTONE_KCP_TEST_CHANNEL_KEY : null;
    const kcpProviders = kcp ? providerCodes(env.VITE_PORTONE_KCP_TEST_EASY_PAY_PROVIDERS)
        .filter(provider => ['NAVERPAY', 'SAMSUNGPAY', 'APPLEPAY'].includes(provider)) : [];
    const directChannels = { NAVERPAY: naverTest || env.VITE_PORTONE_NAVERPAY_CHANNEL_KEY, KAKAOPAY: env.VITE_PORTONE_CHANNEL_KEY, TOSSPAY: env.VITE_PORTONE_TOSSPAY_CHANNEL_KEY };
    const directProviders = { NAVERPAY: 'naverpay', KAKAOPAY: 'kakaopay', TOSSPAY: 'tosspay_v2' };
    const enabled = validKey(toss) ? providerCodes(env.VITE_PORTONE_TOSS_EASY_PAY_PROVIDERS) : [];
    const trials = validKey(toss) && env.DEV === true && env.VITE_PORTONE_PAYMENT_ENV === 'TEST'
        ? providerCodes(env.VITE_PORTONE_TOSS_TEST_EASY_PAY_PROVIDERS) : [];
    if (kcp) methods.push({ id: 'CARD', brand: 'CARD', label: '카드결제', payMethod: 'CARD', channelKey: kcp, pgProvider: 'kcp_v2', testOnly: true,
        ...kcpOrderRestriction(prepared) });
    else if (validKey(toss)) methods.push({ id: 'CARD', brand: 'CARD', label: '카드결제', payMethod: 'CARD', channelKey: toss, pgProvider: 'tosspayments' });
    for (const [provider, label] of Object.entries(easyProviders)) {
        if (validKey(directChannels[provider])) {
            methods.push({ id: provider, brand: provider, label, payMethod: 'EASY_PAY', channelKey: directChannels[provider],
                pgProvider: directProviders[provider], ...(provider === 'KAKAOPAY' ? { easyPayProvider: provider } : {}),
                ...(provider === 'NAVERPAY' && naverTest ? { testOnly: true } : {}),
                ...(provider === 'NAVERPAY' && prepared ? naverOrderRestriction(prepared) : {}) });
        } else if (kcpProviders.includes(provider)) {
            methods.push({ id: 'KCP_' + provider, brand: provider, label, payMethod: 'EASY_PAY', channelKey: kcp,
                pgProvider: 'kcp_v2', easyPayProvider: provider, testOnly: true, ...kcpOrderRestriction(prepared) });
        } else if (enabled.includes(provider) || trials.includes(provider)) {
            methods.push({ id: 'TOSS_' + provider, brand: provider, label, payMethod: 'EASY_PAY', channelKey: toss,
                pgProvider: 'tosspayments', easyPayProvider: provider, ...(!enabled.includes(provider) ? { testOnly: true } : {}) });
        }
    }
    return methods;
}

export function readPaymentDevice() {
    const ua = globalThis.navigator?.userAgent || '';
    let applePay = false;
    try { applePay = globalThis.ApplePaySession?.canMakePayments() === true; } catch { /* 지원 확인이 거부되면 다른 수단을 안내해요. */ }
    return {
        apple: /iPhone|iPad|iPod|Macintosh/i.test(ua),
        safari: /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS|SamsungBrowser/i.test(ua),
        mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/i.test(ua) && (globalThis.navigator?.maxTouchPoints || 0) > 1),
        android: /Android/i.test(ua), nonGalaxy: /Pixel|Nexus|Redmi|POCO|Moto|OnePlus/i.test(ua), applePay,
    };
}
export function paymentMethodAvailability(method, device = readPaymentDevice()) {
    if (method?.disabledReason) return { available: false, reason: method.disabledReason };
    const brand = paymentMethodBrand(method);
    if (brand === 'APPLEPAY' && !(device.apple && device.safari && device.applePay))
        return { available: false, reason: 'Apple Pay를 지원하는 Apple 기기의 Safari에서 사용할 수 있어요.' };
    if (brand === 'SAMSUNGPAY' && device.mobile && (!device.android || device.nonGalaxy))
        return { available: false, reason: '지원 갤럭시 또는 PC에서 사용할 수 있어요.' };
    return { available: true, reason: '' };
}

export function paymentMethodRequest(method, prepared) {
    if (!method || !validKey(method.channelKey)) throw new Error('결제 수단을 다시 선택해주세요.');
    const availability = paymentMethodAvailability(method);
    if (!availability.available) throw new Error(availability.reason);
    let kcpRequest = {};
    if (method.pgProvider === 'kcp_v2') {
        if (!kcpOrderCompatible(prepared?.merchantUid)) throw new Error('기존 주문번호는 KCP TEST에서 사용할 수 없어요. 다른 결제 수단을 선택해주세요.');
        const characters = Array.from(prepared.productName || 'RESERVE 결제');
        const encoder = new TextEncoder();
        while (encoder.encode(characters.join('')).length > 100) characters.pop();
        kcpRequest = { orderName: characters.join(''), bypass: { kcp_v2: { site_name: 'RESERVE' } } };
    }
    if (method.payMethod === 'CARD') {
        if (!cardCompanySupported(method.cardCompany, method.pgProvider)) throw new Error('지원하는 카드사를 선택해주세요.');
        if (method.pgProvider === 'kcp_v2') {
            return { channelKey: method.channelKey, payMethod: 'CARD', ...kcpRequest,
                card: { cardCompany: method.cardCompany, installment: { monthOption: { fixedMonth: 0 } } } };
        }
        return { channelKey: method.channelKey, payMethod: 'CARD', card: { cardCompany: method.cardCompany } };
    }
    if (method.payMethod !== 'EASY_PAY' || !Object.hasOwn(easyProviders, paymentMethodBrand(method))
        || (method.easyPayProvider && !Object.hasOwn(easyProviders, method.easyPayProvider)))
        throw new Error('지원하지 않는 결제 수단이에요.');
    if (method.pgProvider === 'naverpay') {
        const restriction = naverOrderRestriction(prepared);
        if (restriction.disabledReason) throw new Error(restriction.disabledReason);
        const uid = prepared.reservationId != null ? 'reservation-' + prepared.reservationId : 'advertisement-' + prepared.adId;
        return { channelKey: method.channelKey, payMethod: 'EASY_PAY',
            windowType: { pc: 'POPUP', mobile: 'REDIRECTION' },
            // 범용 예약·광고는 분류 불가 상품의 ETC 규격을 사용해요. 계약별 판매자·이용완료일은 임의로 채우지 않아요.
            bypass: { naverpay: { productItems: [{ categoryType: 'ETC', categoryId: 'ETC', uid, name: prepared.productName, count: 1 }] } } };
    }
    // 공용 KCP TEST MID의 네이버페이는 포인트 결제만 지원해요.
    const naverPointsOnly = method.pgProvider === 'kcp_v2' && method.testOnly === true && method.easyPayProvider === 'NAVERPAY';
    return { channelKey: method.channelKey, payMethod: 'EASY_PAY', ...kcpRequest,
        ...(method.easyPayProvider ? { easyPay: { easyPayProvider: method.easyPayProvider,
            ...(naverPointsOnly ? { availablePayMethods: ['CHARGE'] } : {}) } } : {}) };
}
