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
    it('계정 전환과 화면 종료 뒤에는 이전 주문으로 이동하지 않아요', () => {
        const returned = vi.fn(); const { result, unmount } = renderHook(() => usePaymentHandoff(returned));
        act(() => result.current({ merchantUid: 'old-order' }));
        act(() => useAuthStore.setState({ sessionRevision: 2 }));
        act(() => vi.advanceTimersByTime(20000)); expect(returned).not.toHaveBeenCalled();
        act(() => result.current({ merchantUid: 'unmounted-order' }));
        unmount(); act(() => vi.advanceTimersByTime(20000)); expect(returned).not.toHaveBeenCalled();
    });
});
