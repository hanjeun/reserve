import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useGeolocation from '../useGeolocation';
import { advanceSession } from '../../api/sessionScope';

const { warning } = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock('../useMessage', () => ({ default: () => ({ message: { warning } }) }));

describe('useGeolocation failure recovery', () => {
    const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    let getCurrentPosition;
    const installGeolocation = value => Object.defineProperty(navigator, 'geolocation', {
        configurable: true, value,
    });

    beforeEach(() => {
        warning.mockReset();
        getCurrentPosition = vi.fn();
        installGeolocation({ getCurrentPosition });
    });

    afterEach(() => {
        vi.useRealTimers();
        if (originalGeolocation) Object.defineProperty(navigator, 'geolocation', originalGeolocation);
        else delete navigator.geolocation;
    });

    it('bounds a missing permission response and ignores its late result after a new request', async () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useGeolocation());
        let first;
        act(() => { first = result.current.request(); });
        act(() => { expect(result.current.request()).toBe(first); });
        expect(getCurrentPosition).toHaveBeenCalledOnce();
        await act(async () => { await vi.advanceTimersByTimeAsync(8000); expect(await first).toBeNull(); });
        expect(result.current.requesting).toBe(false);
        expect(warning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('위치 확인 시간이 초과됐어요'));
        let second;
        act(() => { second = result.current.request({ showError: false }); });
        act(() => { getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 1, longitude: 2 } }); });
        expect(result.current.requesting).toBe(true);
        await act(async () => {
            getCurrentPosition.mock.calls[1][0]({ coords: { latitude: 3, longitude: 4 } });
            expect(await second).toEqual({ latitude: 3, longitude: 4 });
        });
        expect(result.current.requesting).toBe(false);
    });

    it('settles a closed screen silently without accepting a late permission result', async () => {
        const { result, unmount } = renderHook(() => useGeolocation());
        let pending;
        act(() => { pending = result.current.request(); });
        unmount();
        expect(await pending).toBeNull();
        getCurrentPosition.mock.calls[0][1]({ code: 1 });
        expect(warning).not.toHaveBeenCalled();
    });

    it('does not return a location from the previous account session', async () => {
        const { result } = renderHook(() => useGeolocation());
        let pending;
        act(() => { pending = result.current.request(); });
        advanceSession();
        await act(async () => {
            getCurrentPosition.mock.calls[0][0]({ coords: { latitude: 1, longitude: 2 } });
            expect(await pending).toBeNull();
        });
        expect(result.current.requesting).toBe(false);
        expect(warning).not.toHaveBeenCalled();
    });

    it('requests only on demand and retains the existing accuracy, timeout and browser cache options', async () => {
        const { result } = renderHook(() => useGeolocation());
        expect(getCurrentPosition).not.toHaveBeenCalled();
        let pending;
        act(() => { pending = result.current.request(); });
        expect(result.current.requesting).toBe(true);
        expect(getCurrentPosition.mock.calls[0][2]).toEqual({
            enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000,
        });

        const coordinates = { latitude: 12.345678, longitude: 67.891234 };
        await act(async () => {
            getCurrentPosition.mock.calls[0][0]({ coords: coordinates });
            expect(await pending).toEqual(coordinates);
        });
        expect(result.current.requesting).toBe(false);
        expect(warning).not.toHaveBeenCalled();
    });

    it.each([
        [1, '위치 정보 허용이 필요해요'],
        [2, '기기에서 현재 위치를 확인하지 못했어요'],
        [3, '위치 확인 시간이 초과됐어요'],
        [undefined, '현재 위치를 확인하지 못했어요'],
    ])('distinguishes browser failure code %s without starting automatic retries', async (code, reason) => {
        getCurrentPosition.mockImplementation((success, failure) => failure({ code }));
        const { result } = renderHook(() => useGeolocation());

        await act(async () => { expect(await result.current.request()).toBeNull(); });

        expect(result.current.requesting).toBe(false);
        expect(warning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(reason));
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, null, { getCurrentPosition: null }])('resolves unsupported browser implementations without leaving a request active', async implementation => {
        installGeolocation(implementation);
        const { result } = renderHook(() => useGeolocation());

        await act(async () => { expect(await result.current.request()).toBeNull(); });

        expect(result.current.requesting).toBe(false);
        expect(warning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('이 브라우저에서는 현재 위치 기능을 사용할 수 없어요'));
    });

    it('settles a synchronous permission exception and allows a later manual request', async () => {
        const coordinates = { latitude: 12.345678, longitude: 67.891234 };
        getCurrentPosition.mockImplementationOnce(() => { throw new DOMException('blocked', 'SecurityError'); })
            .mockImplementationOnce(success => success({ coords: coordinates }));
        const { result } = renderHook(() => useGeolocation());

        await act(async () => { expect(await result.current.request()).toBeNull(); });
        expect(result.current.requesting).toBe(false);
        expect(warning).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('위치 정보 허용이 필요해요'));

        await act(async () => { expect(await result.current.request()).toEqual(coordinates); });
        expect(result.current.requesting).toBe(false);
        expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    });

    it('lets a saved-address caller show its fallback message without a contradictory failure warning', async () => {
        getCurrentPosition.mockImplementation((success, failure) => failure({ code: 2 }));
        const { result } = renderHook(() => useGeolocation());

        await act(async () => { expect(await result.current.request({ showError: false })).toBeNull(); });

        expect(result.current.requesting).toBe(false);
        expect(warning).not.toHaveBeenCalled();
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    });
});
