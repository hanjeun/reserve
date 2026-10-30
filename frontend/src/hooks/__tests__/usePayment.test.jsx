import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePayment from '../usePayment';
import useAuthStore from '../../store/useAuthStore';
import { configuredPaymentMethods } from '../../utils/paymentMethods';
import { clearPaymentReturns, consumePaymentReturn } from '../../utils/paymentReturnContext';
const fixture = vi.hoisted(() => ({ prepare: vi.fn(), verify: vi.fn(), sdk: vi.fn(), choose: vi.fn(), navigate: vi.fn(), error: vi.fn(), notice: vi.fn() }));
vi.mock('../../services/paymentService', () => ({ default: { prepare: fixture.prepare, verify: fixture.verify } }));
vi.mock('@portone/browser-sdk/v2', () => ({ default: { requestPayment: fixture.sdk } }));
vi.mock('../usePaymentMethodDialog', () => ({ default: () => ({ choosePayment: fixture.choose, paymentDialog: null }) }));
vi.mock('../useMessage', () => ({ default: () => ({ message: { error: fixture.error }, modal: { info: fixture.notice } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => fixture.navigate,
    useLocation: () => ({ pathname: '/my-reservations', search: '?page=2&view=list' }) }));
const reservation = { id: 7, storeName: '합성 가게', depositAmount: 99999 };
const buyer = { name: '합성 회원', email: 'preview@example.test' };
const prepared = { merchantUid: 'synthetic-order-7', storeId: 'synthetic-store', amount: 10000, productName: '합성 보증금', buyerName: buyer.name, buyerEmail: buyer.email };
describe('선택한 예약 결제 경로', () => {

    it.each(['response', 'exception'])('KCP Web Close는 모바일과 같은 주문 결과 화면으로 이동해요 (%s)', async kind => {
        const order = { ...prepared, merchantUid: 'ORDsynthetic7' };
        const closed = { code: 'PGProviderError', pgCode: '3001', message: '[3001] 사용자 Web Close' };
        fixture.prepare.mockResolvedValueOnce(order);
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
        fixture.prepare.mockResolvedValueOnce(prepared).mockResolvedValueOnce({ ...prepared, merchantUid: 'new-account-order' });
        fixture.sdk.mockImplementationOnce(() => new Promise(resolve => { oldResponse = resolve; }))
            .mockImplementationOnce(() => new Promise(resolve => { newResponse = resolve; }));
        const { result } = renderHook(() => usePayment()); let oldAttempt, newAttempt;
        await act(async () => { oldAttempt = result.current.pay(reservation, buyer); });
        act(() => useAuthStore.setState({ sessionRevision: 2 }));
        await act(async () => { newAttempt = result.current.pay(reservation, buyer); });
        await act(async () => { oldResponse({ paymentId: prepared.merchantUid }); await oldAttempt; });
        expect(result.current.paying).toBe(true);
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.prepare).toHaveBeenCalledTimes(2);
        await act(async () => { newResponse({ code: 'PAY_PROCESS_CANCELED' }); await newAttempt; });
        expect(result.current.paying).toBe(false); expect(fixture.verify).not.toHaveBeenCalled();
    });

    beforeEach(() => {
        vi.clearAllMocks(); clearPaymentReturns(); useAuthStore.setState({ sessionRevision: 1, user: { id: 7 } });
        vi.stubEnv('VITE_PORTONE_NAVERPAY_CHANNEL_KEY', '');
        vi.stubEnv('VITE_PORTONE_KCP_TEST_CHANNEL_KEY', '');
        vi.stubEnv('VITE_PORTONE_TOSS_CHANNEL_KEY', 'channel-key-11111111-1111-4111-8111-111111111111');
        vi.stubEnv('VITE_PORTONE_CHANNEL_KEY', 'channel-key-22222222-2222-4222-8222-222222222222');
        vi.stubEnv('VITE_PORTONE_TOSS_EASY_PAY_PROVIDERS', '');
        fixture.prepare.mockResolvedValue(prepared); fixture.verify.mockResolvedValue({ status: 'PAID' });
        fixture.choose.mockResolvedValue({ ...configuredPaymentMethods()[0], cardCompany: 'SHINHAN_CARD' }); fixture.sdk.mockResolvedValue({ paymentId: prepared.merchantUid });
    });
    afterEach(() => vi.unstubAllEnvs());
    it('카드는 서버 금액과 주문으로 요청하고 서버 검증 후 이동해요', async () => {
        const { result } = renderHook(() => usePayment());
        await act(async () => { await result.current.pay(reservation, buyer); });
        expect(fixture.sdk).toHaveBeenCalledWith(expect.objectContaining({ payMethod: 'CARD', card: { cardCompany: 'SHINHAN_CARD' }, totalAmount: 10000, paymentId: prepared.merchantUid }));
        expect(fixture.sdk.mock.calls[0][0]).not.toHaveProperty('easyPay');
        expect(fixture.verify).toHaveBeenCalledWith({ merchantUid: prepared.merchantUid, reservationId: 7 });
        expect(fixture.navigate).toHaveBeenCalledWith(expect.stringContaining('success=true'));
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
        fixture.prepare.mockResolvedValueOnce(order);
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
        let ready; fixture.prepare.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
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
        expect(fixture.prepare).toHaveBeenCalledTimes(1); expect(fixture.sdk).toHaveBeenCalledTimes(1);
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
