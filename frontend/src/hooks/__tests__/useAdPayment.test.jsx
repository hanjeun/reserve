import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useAdPayment from '../useAdPayment';
import useAuthStore from '../../store/useAuthStore';
import { configuredPaymentMethods } from '../../utils/paymentMethods';
vi.mock('react-router-dom', () => ({ useNavigate: () => fixture.navigate }));
const fixture = vi.hoisted(() => ({ navigate: vi.fn(), create: vi.fn(), prepare: vi.fn(), verify: vi.fn(), sdk: vi.fn(), choose: vi.fn(), error: vi.fn(), success: vi.fn(), invalidate: vi.fn(), notice: vi.fn() }));
vi.mock('../../services/adService', () => ({ default: { createAd: fixture.create, preparePayment: fixture.prepare, verifyPayment: fixture.verify } }));
vi.mock('@portone/browser-sdk/v2', () => ({ default: { requestPayment: fixture.sdk } }));
vi.mock('../usePaymentMethodDialog', () => ({ default: () => ({ choosePayment: fixture.choose, paymentDialog: null }) }));
vi.mock('../useMessage', () => ({ default: () => ({ message: { error: fixture.error, success: fixture.success }, modal: { info: fixture.notice } }) }));
vi.mock('../invalidateAfterWrite', () => ({ invalidateAdData: fixture.invalidate }));
const prepared = { merchantUid: 'synthetic-ad-order', storeId: 'synthetic-store', amount: 20000, productName: '합성 광고' };
const show = () => { const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return renderHook(() => useAdPayment(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }); };
describe('광고 결제 수단 인계', () => {

    it.each(['response', 'exception'])('광고 KCP Web Close도 모바일과 같은 주문 결과 화면으로 이동해요 (%s)', async kind => {
        const closed = { code: 'PGProviderError', pgCode: '3001', message: '[3001] 사용자 Web Close' };
        fixture.prepare.mockResolvedValueOnce({ ...prepared, merchantUid: 'ADsynthetic8' });
        fixture.choose.mockResolvedValueOnce({ ...configuredPaymentMethods()[0], pgProvider: 'kcp_v2', cardCompany: 'SHINHAN_CARD' });
        if (kind === 'response') fixture.sdk.mockResolvedValueOnce(closed);
        else fixture.sdk.mockRejectedValueOnce(closed);
        const { result } = show();
        await act(async () => { expect(await result.current.payExisting(8)).toMatchObject({ success: false, cancelled: true }); });
        expect(result.current.payingId).toBeNull();
        expect(fixture.notice).not.toHaveBeenCalled();
        expect(fixture.error).not.toHaveBeenCalled(); expect(fixture.verify).not.toHaveBeenCalled();
        expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?type=ad&merchant_uid=ADsynthetic8');
        expect(fixture.sdk).toHaveBeenCalledOnce();
    });

    it('SDK 광고 취소는 로딩을 해제하고 결제 검증을 요청하지 않아요', async () => {
        fixture.sdk.mockResolvedValue({ code: 'PAY_PROCESS_CANCELED' });
        const { result } = show();
        await act(async () => { expect((await result.current.payExisting(8)).cancelled).toBe(true); });
        expect(result.current.payingId).toBeNull();
        expect(fixture.verify).not.toHaveBeenCalled(); expect(fixture.error).not.toHaveBeenCalled();
        expect(fixture.notice).not.toHaveBeenCalled();
        expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/payment/result?type=ad&merchant_uid=' + prepared.merchantUid);
    });
    it('SDK 이동 중단은 광고 주문 결과 경로로 복구해요', async () => {
        vi.useFakeTimers();
        try {
            fixture.sdk.mockResolvedValue(undefined); const { result } = show();
            await act(async () => { await result.current.payExisting(8); });
            act(() => vi.advanceTimersByTime(10000));
            expect(result.current.payingId).toBeNull();
            expect(fixture.navigate).toHaveBeenCalledWith('/payment/result?type=ad&merchant_uid=' + prepared.merchantUid);
            expect(fixture.sdk).toHaveBeenCalledTimes(1); expect(fixture.verify).not.toHaveBeenCalled();
        } finally { vi.useRealTimers(); }
    });

    beforeEach(() => {
        vi.clearAllMocks(); useAuthStore.setState({ sessionRevision: 1 });
        vi.stubEnv('VITE_PORTONE_NAVERPAY_CHANNEL_KEY', '');
        vi.stubEnv('VITE_PORTONE_KCP_TEST_CHANNEL_KEY', '');
        vi.stubEnv('VITE_PORTONE_TOSS_CHANNEL_KEY', 'channel-key-11111111-1111-4111-8111-111111111111');
        vi.stubEnv('VITE_PORTONE_TOSS_EASY_PAY_PROVIDERS', '');
        fixture.create.mockResolvedValue(prepared); fixture.prepare.mockResolvedValue(prepared);
        fixture.choose.mockResolvedValue({ ...configuredPaymentMethods()[0], cardCompany: 'SHINHAN_CARD' });
        fixture.sdk.mockResolvedValue({ paymentId: prepared.merchantUid }); fixture.verify.mockResolvedValue({ id: 8 });
    });
    afterEach(() => vi.unstubAllEnvs());
    it.each(['create', 'existing'])('네이버 단독 채널도 같은 광고 원장·검증과 복귀 주소를 사용해요 (%s)', async origin => {
        vi.stubEnv('VITE_PORTONE_NAVERPAY_CHANNEL_KEY', 'channel-key-55555555-5555-4555-8555-555555555555');
        const order = { ...prepared, adId: 8 };
        fixture.create.mockResolvedValueOnce(order); fixture.prepare.mockResolvedValueOnce(order);
        fixture.choose.mockResolvedValueOnce(configuredPaymentMethods(import.meta.env, order).find(method => method.brand === 'NAVERPAY'));
        const { result } = show();
        await act(async () => { await (origin === 'create' ? result.current.pay({}) : result.current.payExisting(8)); });
        expect(fixture.sdk).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ channelKey: 'channel-key-55555555-5555-4555-8555-555555555555',
            totalAmount: prepared.amount, paymentId: prepared.merchantUid, payMethod: 'EASY_PAY',
            windowType: { pc: 'POPUP', mobile: 'REDIRECTION' },
            bypass: { naverpay: { productItems: [expect.objectContaining({ uid: 'advertisement-8', count: 1 })] } },
            redirectUrl: window.location.origin + '/api/advertisements/mobile-redirect' }));
        expect(fixture.verify).toHaveBeenCalledExactlyOnceWith(prepared.merchantUid);
    });
    it('기존 광고도 선택한 카드 채널과 광고 전용 검증을 사용해요', async () => {
        const { result } = show(); await act(async () => { await result.current.payExisting(8); });
        expect(fixture.sdk).toHaveBeenCalledWith(expect.objectContaining({ payMethod: 'CARD', card: { cardCompany: 'SHINHAN_CARD' }, totalAmount: 20000,
            redirectUrl: window.location.origin + '/api/advertisements/mobile-redirect' }));
        expect(fixture.verify).toHaveBeenCalledWith(prepared.merchantUid);
    });
    it('결제 선택을 취소하면 광고를 결제 성공으로 안내하지 않아요', async () => {
        fixture.choose.mockResolvedValue(null);
        const { result } = show(); await act(async () => { await result.current.pay({}); });
        expect(fixture.sdk).not.toHaveBeenCalled(); expect(fixture.verify).not.toHaveBeenCalled();
        expect(fixture.success).not.toHaveBeenCalled(); expect(fixture.invalidate).toHaveBeenCalled();
    });
    it('모바일 인계 뒤 같은 광고의 결제를 다시 열지 않아요', async () => {
        fixture.sdk.mockResolvedValue(undefined);
        const { result } = show(); await act(async () => { await result.current.payExisting(8); });
        expect(result.current.payingId).toBe(8);
        await act(async () => { await result.current.payExisting(8); });
        expect(fixture.prepare).toHaveBeenCalledTimes(1); expect(fixture.sdk).toHaveBeenCalledTimes(1);
        expect(fixture.verify).not.toHaveBeenCalled();
    });
    it('광고 신청 중 중복 클릭으로 신청을 다시 만들지 않아요', async () => {
        let ready; fixture.create.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
        const { result } = show(); let first;
        await act(async () => { first = result.current.pay({}); await result.current.pay({}); });
        expect(fixture.create).toHaveBeenCalledTimes(1);
        await act(async () => { ready(prepared); await first; });
        expect(fixture.sdk).toHaveBeenCalledTimes(1);
    });
});
