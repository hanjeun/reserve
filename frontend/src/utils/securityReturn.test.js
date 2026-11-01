import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveSecurityReturn, takeSecurityReturn, revealSecurityPanel } from './securityReturn';

beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(1000); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });

it('같은 탭·계정의 폼 종류만 한 번 복원해요', () => {
    saveSecurityReturn(7, 'setup-password');
    expect(takeSecurityReturn(7)).toEqual({ memberId: '7', target: 'setup-password', createdAt: 1000 });
    expect(takeSecurityReturn(7)).toBeNull();
});

it('다른 계정·만료·미래 시각의 요청과 임의 경로는 복원하지 않아요', () => {
    saveSecurityReturn(7, 'mfa'); expect(takeSecurityReturn(8)).toBeNull();
    saveSecurityReturn(7, 'mfa'); vi.setSystemTime(301001); expect(takeSecurityReturn(7)).toBeNull();
    saveSecurityReturn(7, 'mfa'); vi.setSystemTime(300000); expect(takeSecurityReturn(7)).toBeNull();
    saveSecurityReturn(7, 'https://example.test'); expect(takeSecurityReturn(7)).toBeNull();
});

it('저장이 막혀도 인증을 방해하지 않아요', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => saveSecurityReturn(7, 'mfa')).not.toThrow();
    expect(takeSecurityReturn(7)).toBeNull();
});

it.each([false, true])('폼이 배치된 뒤 위치와 포커스를 복원하고 모션 줄이기를 지켜요 (%s)', async reduced => {
    const element = document.createElement('section');
    element.tabIndex = -1; element.scrollIntoView = vi.fn(); document.body.append(element);
    revealSecurityPanel(() => element, reduced);
    await vi.runAllTimersAsync();
    expect(element.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    expect(document.activeElement).toBe(element);
});

it('화면을 떠나면 늦은 자동 스크롤을 취소해요', async () => {
    const element = document.createElement('section'); element.scrollIntoView = vi.fn(); document.body.append(element);
    const cancel = revealSecurityPanel(element, false); cancel();
    await vi.runAllTimersAsync(); expect(element.scrollIntoView).not.toHaveBeenCalled();
});
