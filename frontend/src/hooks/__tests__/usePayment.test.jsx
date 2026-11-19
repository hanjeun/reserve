import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePayment from '../usePayment';
import useAuthStore from '../../store/useAuthStore';
import { configuredPaymentMethods } from '../../utils/paymentMethods';
import { clearPaymentReturns, consumePaymentReturn } from '../../utils/paymentReturnContext';
import { PAYMENT_EXPIRED_MESSAGE } from '../../utils/reservationPayment';
const fixture = vi.hoisted(() => ({ prepare: vi.fn(), verify: vi.fn(), checkReturn: vi.fn(), sdk: vi.fn(), choose: vi.fn(),
    navigate: vi.fn(), error: vi.fn(), notice: vi.fn(), queryClient: { invalidateQueries: vi.fn() }, location: null }));
vi.mock('../../services/paymentService', () => ({ default: { prepare: fixture.prepare, verify: fixture.verify, checkReturn: fixture.checkReturn } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => fixture.queryClient }));
vi.mock('@portone/browser-sdk/v2', () => ({ default: { requestPayment: fixture.sdk } }));
vi.mock('../usePaymentMethodDialog', () => ({ default: () => ({ choosePayment: fixture.choose, paymentDialog: null }) }));
vi.mock('../useMessage', () => ({ default: () => ({ message: { error: fixture.error }, modal: { info: fixture.notice } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => fixture.navigate,
    useLocation: () => fixture.location }));
const reservation = { id: 7, storeName: '합성 가게', depositAmount: 99999 };
const buyer = { name: '합성 회원', email: 'preview@example.test' };
const prepared = { merchantUid: 'synthetic-order-7', storeId: 'synthetic-store', amount: 10000, productName: '합성 보증금', buyerName: buyer.name, buyerEmail: buyer.email };
const tossRejection = { code: 'PGProviderError', pgCode: 'COMMON_INVALID_PARAMETER', pgMessage: '가맹점 정보를 찾을 수 없습니다.' };
const cardCodes = ['KOOKMIN_CARD', 'SHINHAN_CARD', 'SAMSUNG_CARD', 'HYUNDAI_CARD', 'LOTTE_CARD', 'HANA_CARD',
    'WOORI_CARD', 'NH_CARD', 'BC_CARD', 'CITI_CARD', 'GWANGJU_CARD', 'JEONBUK_CARD', 'SUHYUP_CARD'];
const cardRoutes = [
    ...cardCodes.filter(cardCompany => cardCompany !== 'JEONBUK_CARD').map(cardCompany => ({ provider: 'kcp_v2', cardCompany })),
    ...cardCodes.map(cardCompany => ({ provider: 'tosspayments', cardCompany })),
].flatMap(route => ['paid', 'verification-failed', 'provider-failed', 'closed'].map(outcome => ({ ...route, outcome })));
describe('선택한 예약 결제 경로', () => {

    it.each(['response', 'exception'])('KCP Web Close는 모바일과 같은 주문 결과 화면으로 이동해요 (%s)', async kind => {
        const order = { ...prepared, merchantUid: 'ORDsynthetic7' };
        const closed = { code: 'PGProviderError', pgCode: '3001', message: '[3001] 사용자 Web Close' };
        fixture.prepare.mockResolvedValue(order);
        fixture.choose.mockResolvedValueOnce({ ...configuredPaymentMethods()[0], pgProvider: 'kcp_v2', cardCompany: 'SHINHAN_CARD' });
        if (kind === 'response') fixture.sdk.mockResolvedValueOnce(closed);
        else fixture.sdk.mockRejectedValueOnce(closed);
        const { result } = renderHook(() => usePayment());
        await act(async () => { expect(await result.current.pay(reservation, buyer)).toMatchObject({ success: false, cancelled: true }); });
        expect(result.current.paying).toBe(false);
        expect(fixture.notice).not.toHaveBeenCalled();
        expect(fixture.error).not.toHaveBeenCalled(); expect(fixture.verify).not.toHaveBeenCalled();
        expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?checkout_return=true&merchant_uid=ORDsynthetic7');
        expect(fixture.sdk).toHaveBeenCalledOnce();
    });

    it('SDK 취소 코드와 취소 예외 모두 로딩을 해제하고 검증을 요청하지 않아요', async () => {
        const { result } = renderHook(() => usePayment());
        fixture.sdk.mockResolvedValueOnce({ code: 'PAY_PROCESS_CANCELED' });
        await act(async () => { expect((await result.current.pay(reservation, buyer)).cancelled).toBe(true); });
        expect(result.current.paying).toBe(false);
        fixture.sdk.mockRejectedValueOnce({ code: 'PAY_PROCESS_CANCELED' });
        await act(async () => { expect((await result.current.pay(reservation, buyer)).cancelled).toBe(true); });
        expect(result.current.paying).toBe(false);
        expect(fixture.verify).not.toHaveBeenCalled(); expect(fixture.error).not.toHaveBeenCalled();
        expect(fixture.notice).not.toHaveBeenCalled();
        expect(fixture.navigate).toHaveBeenCalledTimes(2);
        expect(fixture.navigate).toHaveBeenLastCalledWith('/payment/result?checkout_return=true&merchant_uid=' + prepared.merchantUid);
    });
    it('결제 준비가 거절되면 취소 문구만으로 PG 닫기 화면에 보내지 않아요', async () => {
        fixture.prepare.mockRejectedValueOnce(new Error('취소된 예약은 결제할 수 없어요.'));
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.sdk).not.toHaveBeenCalled(); expect(fixture.navigate).not.toHaveBeenCalled();
        expect(fixture.error).toHaveBeenCalledWith('취소된 예약은 결제할 수 없어요.');
        expect(fixture.notice).not.toHaveBeenCalled(); expect(result.current.paying).toBe(false);
    });
    it('PC 결제창이 사라져 SDK가 응답하지 않아도 로딩을 끝내고 같은 주문만 확인해요', async () => {
        vi.useFakeTimers();
        try {
            let late;
            const frame = document.createElement('iframe'); frame.id = 'imp-iframe';
            fixture.sdk.mockImplementationOnce(() => { document.body.append(frame); return new Promise(resolve => { late = resolve; }); });
            const { result } = renderHook(() => usePayment()); let pending;
            await act(async () => { pending = result.current.pay(reservation, buyer); });
            expect(result.current.paying).toBe(true);
            await act(async () => { frame.remove(); });
            await act(async () => { vi.advanceTimersByTime(300); await pending; });
            expect(result.current.paying).toBe(false);
            expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?checkout_return=true&merchant_uid=' + prepared.merchantUid);
            await act(async () => { late({ paymentId: prepared.merchantUid }); });
            expect(fixture.verify).not.toHaveBeenCalled(); expect(fixture.sdk).toHaveBeenCalledTimes(1);
        } finally { vi.useRealTimers(); }
    });
    it('SDK 이동이 멈추면 같은 예약 주문 확인으로 복구하고 재결제하지 않아요', async () => {
        vi.useFakeTimers();
        try {
            fixture.sdk.mockResolvedValue(undefined);
            const { result } = renderHook(() => usePayment());
            await act(async () => { await result.current.pay(reservation, buyer); });
            expect(result.current.paying).toBe(true);
            act(() => vi.advanceTimersByTime(10000));
            expect(result.current.paying).toBe(false);
            expect(fixture.navigate).toHaveBeenCalledWith('/payment/result?checkout_return=true&merchant_uid=' + prepared.merchantUid);
            expect(fixture.sdk).toHaveBeenCalledTimes(1); expect(fixture.verify).not.toHaveBeenCalled();
        } finally { vi.useRealTimers(); }
    });
    it('이전 계정의 늦은 응답은 새 결제의 로딩과 중복 방지를 해제하지 않아요', async () => {
        let oldResponse, newResponse;
        fixture.prepare.mockResolvedValueOnce(prepared).mockResolvedValueOnce(prepared)
            .mockResolvedValue({ ...prepared, merchantUid: 'new-account-order' });
        fixture.sdk.mockImplementationOnce(() => new Promise(resolve => { oldResponse = resolve; }))
            .mockImplementationOnce(() => new Promise(resolve => { newResponse = resolve; }));
        const { result } = renderHook(() => usePayment()); let oldAttempt, newAttempt;
        await act(async () => { oldAttempt = result.current.pay(reservation, buyer); });
        act(() => useAuthStore.setState({ sessionRevision: 2 }));
        await act(async () => { newAttempt = result.current.pay(reservation, buyer); });
        await act(async () => { oldResponse({ paymentId: prepared.merchantUid }); await oldAttempt; });
        expect(result.current.paying).toBe(true);
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.prepare).toHaveBeenCalledTimes(4);
        await act(async () => { newResponse({ code: 'PAY_PROCESS_CANCELED' }); await newAttempt; });
        expect(result.current.paying).toBe(false); expect(fixture.verify).not.toHaveBeenCalled();
    });

    beforeEach(() => {
        vi.clearAllMocks(); clearPaymentReturns(); useAuthStore.setState({ sessionRevision: 1, user: { id: 7 } });
        fixture.location = { pathname: '/my-reservations', search: '?page=2&view=list' };
        fixture.checkReturn.mockReset();
        vi.stubEnv('VITE_PORTONE_NAVERPAY_CHANNEL_KEY', '');
        vi.stubEnv('VITE_PORTONE_NAVERPAY_TEST_CHANNEL_KEY', '');
        vi.stubEnv('VITE_PORTONE_PAYMENT_ENV', '');
        vi.stubEnv('VITE_PORTONE_KCP_TEST_CHANNEL_KEY', '');
        vi.stubEnv('VITE_PORTONE_TOSS_CHANNEL_KEY', 'channel-key-11111111-1111-4111-8111-111111111111');
        vi.stubEnv('VITE_PORTONE_CHANNEL_KEY', 'channel-key-22222222-2222-4222-8222-222222222222');
        vi.stubEnv('VITE_PORTONE_TOSS_EASY_PAY_PROVIDERS', '');
        vi.stubEnv('VITE_PORTONE_TOSSPAY_CHANNEL_KEY', '');
        fixture.prepare.mockResolvedValue(prepared); fixture.verify.mockResolvedValue({ status: 'PAID' });
        fixture.choose.mockResolvedValue({ ...configuredPaymentMethods()[0], cardCompany: 'SHINHAN_CARD' }); fixture.sdk.mockResolvedValue({ paymentId: prepared.merchantUid });
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
    it.each([
        ['/my-reservations', 'response'],
        ['/store/00000000-0000-4000-8000-000000000012', 'exception'],
    ])('토스페이에서 가맹점을 찾지 못한 미납 건은 %s에서 바로 안내해요', async (pathname, kind) => {
        fixture.location = { pathname, search: '' };
        vi.stubEnv('VITE_PORTONE_TOSSPAY_CHANNEL_KEY', 'channel-key-33333333-3333-4333-8333-333333333333');
        fixture.choose.mockResolvedValueOnce(configuredPaymentMethods().find(method => method.id === 'TOSSPAY'));
        if (kind === 'response') fixture.sdk.mockResolvedValueOnce(tossRejection);
        else fixture.sdk.mockRejectedValueOnce(tossRejection);
        fixture.checkReturn.mockResolvedValueOnce({ merchantUid: prepared.merchantUid, outcome: 'INCOMPLETE',
            storePublicId: '00000000-0000-4000-8000-000000000012' });
        const { result } = renderHook(() => usePayment());
        await act(async () => { expect(await result.current.pay(reservation, buyer)).toEqual({ success: false }); });
        expect(fixture.checkReturn).toHaveBeenCalledExactlyOnceWith(prepared.merchantUid);
        expect(fixture.error).toHaveBeenCalledWith('토스페이 가맹점 정보를 확인하지 못했어요. 결제 기한 안에는 다른 수단으로 이어갈 수 있어요.');
        expect(fixture.navigate).not.toHaveBeenCalled();
        expect(fixture.verify).not.toHaveBeenCalled();
        expect(fixture.queryClient.invalidateQueries).toHaveBeenCalled();
        expect(result.current.paying).toBe(false);
    });
    it('토스페이 거절 뒤 결과가 미확정이면 같은 주문의 결과 화면을 유지해요', async () => {
        vi.stubEnv('VITE_PORTONE_TOSSPAY_CHANNEL_KEY', 'channel-key-33333333-3333-4333-8333-333333333333');
        fixture.choose.mockResolvedValueOnce(configuredPaymentMethods().find(method => method.id === 'TOSSPAY'));
        fixture.sdk.mockResolvedValueOnce(tossRejection);
        fixture.checkReturn.mockResolvedValueOnce({ merchantUid: prepared.merchantUid, outcome: 'REVIEW_REQUIRED' });
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?checkout_return=true&merchant_uid=' + prepared.merchantUid);
        expect(fixture.verify).not.toHaveBeenCalled();
        expect(fixture.error).not.toHaveBeenCalled();
    });
    it('기한 직전까지 같은 예약과 주문으로 결제를 이어가요', async () => {
        const deadline = Date.parse('2026-11-14T03:15:00Z');
        vi.spyOn(Date, 'now').mockReturnValue(deadline - 1);
        const payable = { ...reservation, status: 'PENDING', allowLatePayment: false, depositPaid: false,
            paymentDeadline: '2026-11-14T03:15:00Z' };
        const { result } = renderHook(() => usePayment());
        await act(async () => { expect((await result.current.pay(payable, buyer)).success).toBe(true); });
        expect(fixture.prepare).toHaveBeenCalledTimes(2);
        expect(fixture.prepare.mock.calls[1]).toEqual(fixture.prepare.mock.calls[0]);
        expect(fixture.sdk).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ paymentId: prepared.merchantUid }));
    });
    it.each([0, 1])('기한에 도달하면 준비 요청과 결제창을 열지 않아요 (%dms)', async elapsed => {
        const deadline = '2026-11-14T03:15:00+09:00';
        vi.spyOn(Date, 'now').mockReturnValue(Date.parse(deadline) + elapsed);
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay({ ...reservation, status: 'PENDING', paymentDeadline: deadline }, buyer); });
        expect(fixture.prepare).not.toHaveBeenCalled(); expect(fixture.choose).not.toHaveBeenCalled();
        expect(fixture.sdk).not.toHaveBeenCalled(); expect(fixture.navigate).not.toHaveBeenCalled();
        expect(fixture.error).toHaveBeenCalledExactlyOnceWith(PAYMENT_EXPIRED_MESSAGE);
        expect(result.current.paying).toBe(false);
    });
    it('수단 선택창을 열어둔 채 기한이 지나면 결제 버튼을 눌러도 현재 화면에서 안내해요', async () => {
        const deadline = '2026-11-14T03:15:00Z';
        const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(deadline) - 1);
        fixture.choose.mockImplementationOnce(async () => {
            now.mockReturnValue(Date.parse(deadline));
            return { ...configuredPaymentMethods()[0], cardCompany: 'SHINHAN_CARD' };
        });
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay({ ...reservation, status: 'PENDING', paymentDeadline: deadline }, buyer); });
        expect(fixture.prepare).toHaveBeenCalledOnce();
        expect(fixture.sdk).not.toHaveBeenCalled(); expect(fixture.navigate).not.toHaveBeenCalled();
        expect(fixture.error).toHaveBeenCalledExactlyOnceWith(PAYMENT_EXPIRED_MESSAGE);
    });
    it.each(['결제 기한이 지났어요.', '이미 결제가 완료된 예약이에요.', '취소되거나 종료된 예약은 결제할 수 없어요.'])(
    '확인 버튼 직전 서버가 거절하면 PG 중단으로 오인하지 않아요: %s', async message => {
        fixture.prepare.mockResolvedValueOnce(prepared).mockRejectedValueOnce(new Error(message));
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.choose).toHaveBeenCalledOnce(); expect(fixture.prepare).toHaveBeenCalledTimes(2);
        expect(fixture.sdk).not.toHaveBeenCalled(); expect(fixture.verify).not.toHaveBeenCalled();
        expect(fixture.navigate).not.toHaveBeenCalled(); expect(fixture.error).toHaveBeenCalledExactlyOnceWith(message);
    });
    it('PG 호출 전 결제 수단 검증 오류는 미결제 복귀 안내로 보내지 않아요', async () => {
        fixture.choose.mockResolvedValueOnce({ ...configuredPaymentMethods()[0], cardCompany: 'UNSUPPORTED' });
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.prepare).toHaveBeenCalledOnce(); expect(fixture.sdk).not.toHaveBeenCalled();
        expect(fixture.navigate).not.toHaveBeenCalled(); expect(fixture.error).toHaveBeenCalledExactlyOnceWith('지원하는 카드사를 선택해주세요.');
    });
    it.each([{ amount: 20000 }, { merchantUid: 'changed-order' }, { storeId: 'changed-store' }])(
    '재확인한 금액이나 주문이 달라지면 이전 동의로 결제하지 않아요: %j', async changed => {
        fixture.prepare.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ ...prepared, ...changed });
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.sdk).not.toHaveBeenCalled(); expect(fixture.navigate).not.toHaveBeenCalled();
        expect(fixture.error).toHaveBeenCalledExactlyOnceWith('결제 정보가 변경됐어요. 다시 확인해주세요.');
    });
    it('최종 재확인 중 계정이 바뀌면 이전 계정의 결제를 시작하지 않아요', async () => {
        fixture.prepare.mockResolvedValueOnce(prepared).mockImplementationOnce(async () => {
            useAuthStore.setState({ sessionRevision: 2 });
            return prepared;
        });
        const { result } = renderHook(() => usePayment());
        await act(async () => { expect((await result.current.pay(reservation, buyer)).stale).toBe(true); });
        expect(fixture.sdk).not.toHaveBeenCalled(); expect(fixture.navigate).not.toHaveBeenCalled();
        expect(fixture.error).not.toHaveBeenCalled();
    });
    it('최종 재확인 중 화면을 떠나면 결제창을 뒤늦게 열지 않아요', async () => {
        let confirm;
        fixture.prepare.mockResolvedValueOnce(prepared).mockImplementationOnce(() => new Promise(resolve => { confirm = resolve; }));
        const { result, unmount } = renderHook(() => usePayment());
        let pending;
        await act(async () => { pending = result.current.pay(reservation, buyer); });
        unmount();
        await act(async () => { confirm(prepared); expect((await pending).stale).toBe(true); });
        expect(fixture.sdk).not.toHaveBeenCalled(); expect(fixture.navigate).not.toHaveBeenCalled();
    });
    it.each(['KAKAOPAY', 'TOSSPAY'])('%s도 기한 안에서는 동일 주문을 재확인하고 간편결제창을 열어요', async brand => {
        vi.stubEnv('VITE_PORTONE_TOSSPAY_CHANNEL_KEY', 'channel-key-33333333-3333-4333-8333-333333333333');
        const method = configuredPaymentMethods().find(item => item.brand === brand);
        fixture.choose.mockResolvedValueOnce(method);
        const { result } = renderHook(() => usePayment());
        await act(async () => { expect((await result.current.pay(reservation, buyer)).success).toBe(true); });
        expect(fixture.prepare).toHaveBeenCalledTimes(2);
        expect(fixture.sdk).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ payMethod: 'EASY_PAY', channelKey: method.channelKey,
            paymentId: prepared.merchantUid, totalAmount: prepared.amount }));
        expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('success=true'));
    });
    it('카드는 서버 금액과 주문으로 요청하고 서버 검증 후 이동해요', async () => {
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.sdk).toHaveBeenCalledWith(expect.objectContaining({ payMethod: 'CARD', card: { cardCompany: 'SHINHAN_CARD' }, totalAmount: 10000, paymentId: prepared.merchantUid }));
        expect(fixture.sdk.mock.calls[0][0]).not.toHaveProperty('easyPay');
        expect(fixture.verify).toHaveBeenCalledWith({ merchantUid: prepared.merchantUid, reservationId: 7 });
        expect(fixture.navigate).toHaveBeenCalledWith(expect.stringContaining('success=true'));
    });
    it.each(cardRoutes)('$provider $cardCompany 인증 뒤에는 같은 주문의 서버 검증으로 결과를 결정해요 ($outcome)', async ({ provider, cardCompany, outcome }) => {
        const kcp = provider === 'kcp_v2';
        vi.stubEnv('DEV', kcp);
        vi.stubEnv('VITE_PORTONE_PAYMENT_ENV', 'TEST');
        vi.stubEnv('VITE_PORTONE_KCP_TEST_CHANNEL_KEY', 'channel-key-33333333-3333-4333-8333-333333333333');
        const order = { ...prepared, merchantUid: 'ORDsyntheticCard7' };
        fixture.prepare.mockResolvedValue(order);
        const method = configuredPaymentMethods(import.meta.env, order)[0];
        expect(method.pgProvider).toBe(provider);
        fixture.choose.mockResolvedValueOnce({ ...method, cardCompany });
        const cancelled = kcp ? { code: 'PG_PROVIDER_ERROR', pgCode: '3001', message: '[3001] 사용자 Web Close' }
            : { code: 'PAY_PROCESS_CANCELED' };
        fixture.sdk.mockResolvedValueOnce(outcome === 'closed' ? cancelled : outcome === 'provider-failed'
            ? { code: 'PG_PROVIDER_ERROR', pgCode: kcp ? 'CC14' : 'SYNTHETIC_DECLINED' } : { paymentId: order.merchantUid });
        if (outcome === 'verification-failed') fixture.verify.mockRejectedValueOnce(new Error('확인 중'));
        const { result } = renderHook(() => usePayment());
        let payment;
        await act(async () => { payment = await result.current.pay(reservation, buyer); });
        expect(fixture.sdk).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ paymentId: order.merchantUid,
            channelKey: kcp ? 'channel-key-33333333-3333-4333-8333-333333333333' : 'channel-key-11111111-1111-4111-8111-111111111111',
            storeId: order.storeId, totalAmount: order.amount, currency: 'KRW', payMethod: 'CARD',
            redirectUrl: window.location.origin + '/api/payment/mobile-redirect',
            card: { cardCompany, ...(kcp ? { installment: { monthOption: { fixedMonth: 0 } } } : {}) } }));
        const request = fixture.sdk.mock.calls[0][0];
        expect(request).not.toHaveProperty('easyPay');
        if (kcp) expect(request.bypass).toEqual({ kcp_v2: { site_name: 'RESERVE' } });
        else expect(request).not.toHaveProperty('bypass');
        expect(result.current.paying).toBe(false);
        expect(fixture.prepare).toHaveBeenCalledTimes(2);
        expect(fixture.error).not.toHaveBeenCalled();
        if (outcome === 'paid') {
            expect(payment.success).toBe(true);
            expect(fixture.verify).toHaveBeenCalledExactlyOnceWith({ merchantUid: order.merchantUid, reservationId: 7 });
            expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?success=true&merchant_uid=' + order.merchantUid + '&reservation_id=7');
        } else {
            expect(payment.success).toBe(false);
            expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?'
                + (outcome === 'verification-failed' ? 'success=false&' : '') + 'checkout_return=true&merchant_uid=' + order.merchantUid);
            expect(fixture.sdk).toHaveBeenCalledTimes(1);
            if (outcome === 'verification-failed') expect(fixture.verify).toHaveBeenCalledExactlyOnceWith({ merchantUid: order.merchantUid, reservationId: 7 });
            else expect(fixture.verify).not.toHaveBeenCalled();
            if (outcome === 'closed') expect(payment.cancelled).toBe(true);
        }
    });
    it('간편결제는 선택한 별도 채널과 공급자를 사용해요', async () => {
        fixture.choose.mockResolvedValue(configuredPaymentMethods().find(method => method.brand === 'KAKAOPAY'));
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.sdk).toHaveBeenCalledWith(expect.objectContaining({ payMethod: 'EASY_PAY', easyPay: { easyPayProvider: 'KAKAOPAY' },
            channelKey: 'channel-key-22222222-2222-4222-8222-222222222222' }));
    });
    it.each(['paid', 'cancelled'])('네이버 단독 경로도 서버 준비 금액과 기존 결과 확인을 유지해요 (%s)', async outcome => {
        vi.stubEnv('VITE_PORTONE_NAVERPAY_CHANNEL_KEY', 'channel-key-55555555-5555-4555-8555-555555555555');
        const order = { ...prepared, reservationId: 7 };
        fixture.prepare.mockResolvedValue(order);
        fixture.choose.mockResolvedValueOnce(configuredPaymentMethods(import.meta.env, order).find(method => method.brand === 'NAVERPAY'));
        if (outcome === 'cancelled') fixture.sdk.mockResolvedValueOnce({ code: 'PAY_PROCESS_CANCELED' });
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.sdk).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ channelKey: 'channel-key-55555555-5555-4555-8555-555555555555',
            totalAmount: prepared.amount, paymentId: prepared.merchantUid, payMethod: 'EASY_PAY',
            windowType: { pc: 'POPUP', mobile: 'REDIRECTION' },
            bypass: { naverpay: { productItems: [expect.objectContaining({ uid: 'reservation-7', name: prepared.productName, count: 1 })] } },
            redirectUrl: window.location.origin + '/api/payment/mobile-redirect' }));
        expect(result.current.paying).toBe(false);
        if (outcome === 'paid') expect(fixture.verify).toHaveBeenCalledExactlyOnceWith({ merchantUid: prepared.merchantUid, reservationId: 7 });
        else {
            expect(fixture.verify).not.toHaveBeenCalled();
            expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?checkout_return=true&merchant_uid=' + prepared.merchantUid);
        }
    });
    it('수단 선택을 취소하면 PG나 결제 검증을 호출하지 않아요', async () => {
        fixture.choose.mockResolvedValue(null);
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.sdk).not.toHaveBeenCalled(); expect(fixture.verify).not.toHaveBeenCalled();
        expect(result.current.paying).toBe(false);
    });
    it('준비 중 중복 클릭으로 주문을 다시 만들지 않아요', async () => {
        let ready; fixture.prepare.mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }));
        const { result } = renderHook(() => usePayment()); let first;
        await act(async () => { first = result.current.pay(reservation, buyer); await result.current.pay(reservation, buyer); });
        expect(fixture.prepare).toHaveBeenCalledTimes(1);
        await act(async () => { ready(prepared); await first; });
        expect(fixture.sdk).toHaveBeenCalledTimes(1);
    });
    it('선택 중 계정이 바뀌면 이전 회원의 PG 창을 열지 않아요', async () => {
        fixture.choose.mockImplementation(async () => { useAuthStore.setState({ sessionRevision: 2 }); return configuredPaymentMethods()[0]; });
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.sdk).not.toHaveBeenCalled(); expect(fixture.navigate).not.toHaveBeenCalled();
    });
    it('모바일 인계 뒤 같은 화면에서 새 결제를 시작하지 않아요', async () => {
        fixture.sdk.mockResolvedValue(undefined);
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(result.current.paying).toBe(true);
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.prepare).toHaveBeenCalledTimes(2); expect(fixture.sdk).toHaveBeenCalledTimes(1);
        expect(fixture.verify).not.toHaveBeenCalled();
    });
    it('SDK가 다른 주문을 반환하면 준비한 주문만 다시 확인해요', async () => {
        fixture.sdk.mockResolvedValue({ paymentId: 'another-order' });
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.verify).not.toHaveBeenCalled(); expect(fixture.error).not.toHaveBeenCalled();
        expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?checkout_return=true&merchant_uid=' + prepared.merchantUid);
    });
    it('모바일 인계 전에 결제를 시작한 내 예약의 조건을 보관해요', async () => {
        fixture.sdk.mockResolvedValueOnce({ code: 'PAY_PROCESS_CANCELED' });
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(consumePaymentReturn(prepared.merchantUid, 7, 12)).toBe('/my-reservations?page=2&view=list');
    });
    it.each(['response', 'exception'])('SDK 오류도 미결제를 단정하지 않고 같은 주문을 서버에서 확인해요 (%s)', async kind => {
        const failure = { code: 'UNKNOWN', message: 'Synthetic provider failure' };
        if (kind === 'response') fixture.sdk.mockResolvedValueOnce(failure);
        else fixture.sdk.mockRejectedValueOnce(failure);
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(result.current.paying).toBe(false);
        expect(fixture.verify).not.toHaveBeenCalled(); expect(fixture.error).not.toHaveBeenCalled();
        expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?checkout_return=true&merchant_uid=' + prepared.merchantUid);
    });
    it.each(['response', 'exception'])('네이버 PG 원문은 노출하지 않고 같은 주문을 확인해요 (%s)', async kind => {
        fixture.choose.mockResolvedValueOnce({ brand: 'NAVERPAY', payMethod: 'EASY_PAY', channelKey: 'channel-key-11111111-1111-1111-1111-111111111111', easyPayProvider: 'NAVERPAY' });
        const failure = { code: 'PG_PROVIDER_ERROR', pgMessage: 'Synthetic provider-only detail' };
        if (kind === 'response') fixture.sdk.mockResolvedValueOnce(failure);
        else fixture.sdk.mockRejectedValueOnce(failure);
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.error).not.toHaveBeenCalled();
        expect(fixture.verify).not.toHaveBeenCalled();
        expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?checkout_return=true&merchant_uid=' + prepared.merchantUid);
        expect(result.current.paying).toBe(false);
    });
});
