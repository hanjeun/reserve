import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import usePaymentHandoff, { PAYMENT_HANDOFF } from './usePaymentHandoff';
import useAuthStore from '../store/useAuthStore';
describe('결제 외부 화면 복귀', () => {
    beforeEach(() => { vi.useFakeTimers(); useAuthStore.setState({ sessionRevision: 1 }); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
    it('이동이 시작되지 않으면 로딩 대신 같은 주문 확인으로 이어가요', () => {
        const returned = vi.fn(); const { result } = renderHook(() => usePaymentHandoff(returned));
        act(() => result.current({ merchantUid: 'synthetic-order' }));
        act(() => vi.advanceTimersByTime(9999)); expect(returned).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1));
        expect(returned).toHaveBeenCalledWith(expect.objectContaining({ merchantUid: 'synthetic-order' }));
    });
    it('외부 창에서 돌아오면 한 번만 복구하고 재결제를 요청하지 않아요', () => {
        const returned = vi.fn(); const { result } = renderHook(() => usePaymentHandoff(returned));
        act(() => { result.current({ merchantUid: 'same-order' }); window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
        act(() => vi.advanceTimersByTime(20000)); expect(returned).toHaveBeenCalledTimes(1);
    });
    it('숨겨진 페이지에서는 기다리고 실제 복귀 때 결과 확인으로 이어가요', () => {
        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        const returned = vi.fn(); const { result } = renderHook(() => usePaymentHandoff(returned));
        act(() => result.current({ merchantUid: 'return-order' }));
        visibility.mockReturnValue('hidden');
        act(() => { document.dispatchEvent(new Event('visibilitychange')); vi.advanceTimersByTime(20000); });
        expect(returned).not.toHaveBeenCalled();
        visibility.mockReturnValue('visible');
        act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(returned).toHaveBeenCalledTimes(1);
    });
    it('뒤로가기로 복원된 페이지도 이전 주문을 확인해요', () => {
        const returned = vi.fn(); const { result } = renderHook(() => usePaymentHandoff(returned));
        const event = new Event('pageshow'); Object.defineProperty(event, 'persisted', { value: true });
        act(() => { result.current({ merchantUid: 'restored-order' }); window.dispatchEvent(event); });
        expect(returned).toHaveBeenCalledTimes(1);
    });
    it('결제 프레임이 열려 있는 동안은 시간·포커스만으로 중단하지 않아요', async () => {
        const returned = vi.fn(); const { result } = renderHook(() => usePaymentHandoff(returned));
        const frame = document.createElement('iframe'); frame.id = 'imp-iframe';
        let done;
        await act(async () => { done = result.current({ merchantUid: 'active-order' }, () => {
            document.body.append(frame); return new Promise(() => {});
        }); });
        act(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); vi.advanceTimersByTime(20000); });
        expect(returned).not.toHaveBeenCalled();
        await act(async () => { frame.remove(); });
        await act(async () => { vi.advanceTimersByTime(300); expect(await done).toBe(PAYMENT_HANDOFF); });
        expect(returned).toHaveBeenCalledTimes(1);
    });
    it.each([{ paymentId: 'popup-order' }, { code: 'PAY_PROCESS_CANCELED' }])('팝업 SDK가 대기 중이면 부모 창 복귀와 시간 경과로 결과를 앞당기지 않아요: %j', async response => {
        const returned = vi.fn(); const { result } = renderHook(() => usePaymentHandoff(returned));
        let complete; let payment;
        await act(async () => { payment = result.current({ merchantUid: 'popup-order' }, () => new Promise(resolve => { complete = resolve; })); });
        act(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); vi.advanceTimersByTime(60000); });
        expect(returned).not.toHaveBeenCalled();
        await act(async () => { complete(response); });
        expect(await payment).toEqual(response);
        expect(returned).not.toHaveBeenCalled();
    });
    it('팝업 SDK가 늦게 거절해도 같은 호출의 오류로 전달해요', async () => {
        const returned = vi.fn(); const { result } = renderHook(() => usePaymentHandoff(returned));
        let reject; let payment;
        await act(async () => { payment = result.current({ merchantUid: 'popup-error' }, () => new Promise((_, fail) => { reject = fail; })); });
        act(() => vi.advanceTimersByTime(20000));
        const failure = new Error('synthetic SDK rejection');
        await act(async () => { reject(failure); await expect(payment).rejects.toBe(failure); });
        expect(returned).not.toHaveBeenCalled();
    });
    it('SDK가 이동으로 넘긴 뒤의 실제 중단은 같은 주문 확인으로 복구해요', async () => {
        const returned = vi.fn(); const { result } = renderHook(() => usePaymentHandoff(returned));
        let payment;
        await act(async () => { payment = result.current({ merchantUid: 'redirect-order' }, () => Promise.resolve(undefined)); });
        expect(await payment).toBeUndefined();
        act(() => result.current({ merchantUid: 'redirect-order' }));
        act(() => vi.advanceTimersByTime(10000));
        expect(returned).toHaveBeenCalledOnce();
    });
    it('팝업 대기 중 계정을 바꾸면 늦은 성공이 이전 주문으로 이동시키지 않아요', async () => {
        const returned = vi.fn(); const { result } = renderHook(() => usePaymentHandoff(returned));
        let complete; let payment;
        await act(async () => { payment = result.current({ merchantUid: 'old-popup' }, () => new Promise(resolve => { complete = resolve; })); });
        act(() => useAuthStore.setState({ sessionRevision: 2 }));
        expect(await payment).toBe(PAYMENT_HANDOFF);
        await act(async () => { complete({ paymentId: 'old-popup' }); });
        act(() => vi.advanceTimersByTime(20000));
        expect(returned).not.toHaveBeenCalled();
    });
    it('계정 전환과 화면 종료 뒤에는 이전 주문으로 이동하지 않아요', () => {
        const returned = vi.fn(); const { result, unmount } = renderHook(() => usePaymentHandoff(returned));
        act(() => result.current({ merchantUid: 'old-order' }));
        act(() => useAuthStore.setState({ sessionRevision: 2 }));
        act(() => vi.advanceTimersByTime(20000)); expect(returned).not.toHaveBeenCalled();
        act(() => result.current({ merchantUid: 'unmounted-order' }));
        unmount(); act(() => vi.advanceTimersByTime(20000)); expect(returned).not.toHaveBeenCalled();
    });
});
