import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPaymentReturns, consumePaymentReturn, rememberPaymentReturn } from './paymentReturnContext';

beforeEach(() => { vi.restoreAllMocks(); clearPaymentReturns(); });

describe('결제 안내의 원래 화면 복귀', () => {
    it('같은 탭의 모바일 재진입에서도 목록 조건만 복구하고 한 번 소비해요', async () => {
        rememberPaymentReturn('ORDfixture', 7, { pathname: '/my-reservations', search: '?page=3&status=PENDING&view=list&search=private-text', hash: '#private' });
        expect(sessionStorage.getItem('reserve:payment-return')).not.toContain('private');
        vi.resetModules();
        const reloaded = await import('./paymentReturnContext');
        expect(reloaded.consumePaymentReturn('ORDfixture', 7, 12)).toBe('/my-reservations?status=PENDING&page=3&view=list');
        expect(reloaded.consumePaymentReturn('ORDfixture', 7, 12)).toBe('/my-reservations');
    });
    it('같은 주문·회원·가게가 일치하는 상세 화면으로만 돌아가요', () => {
        rememberPaymentReturn('ORDfixture', 7, { pathname: '/store/12' });
        expect(consumePaymentReturn('ORDfixture', 7, 12)).toBe('/store/12');
        rememberPaymentReturn('ORDfixture', 7, { pathname: '/store/13' });
        expect(consumePaymentReturn('ORDfixture', 7, 12)).toBe('/my-reservations');
        rememberPaymentReturn('ORDfixture', 7, { pathname: '/store/12' });
        expect(consumePaymentReturn('ORDfixture', 8, 12)).toBe('/my-reservations');
    });
    it.each(['https://outside.invalid', '//outside.invalid', '/store/12/../../other', '/my-reservations/other', '/store/12#other'])('외부·변형 경로를 복귀 위치로 저장하지 않아요 (%s)', pathname => {
        rememberPaymentReturn('ORDfixture', 7, { pathname });
        expect(consumePaymentReturn('ORDfixture', 7, 12)).toBe('/my-reservations');
    });
    it('만료·미래 시각·손상된 저장값으로 이동하지 않아요', () => {
        for (const at of [Date.now() - 30 * 60 * 1000, Date.now() + 60000, 'invalid']) {
            sessionStorage.setItem('reserve:payment-return', JSON.stringify([{ merchantUid: 'ORDfixture', memberId: 7, path: '/store/12', at }]));
            expect(consumePaymentReturn('ORDfixture', 7, 12)).toBe('/my-reservations');
        }
        sessionStorage.setItem('reserve:payment-return', '{broken');
        expect(consumePaymentReturn('ORDfixture', 7, 12)).toBe('/my-reservations');
    });
    it('변조된 경로와 다른 주문은 내 예약으로 안전하게 복귀해요', () => {
        sessionStorage.setItem('reserve:payment-return', JSON.stringify([{ merchantUid: 'ORDfixture', memberId: 7, path: '//outside.invalid', at: Date.now() }]));
        expect(consumePaymentReturn('ORDfixture', 7, 12)).toBe('/my-reservations');
        rememberPaymentReturn('ORDother', 7, { pathname: '/store/12' });
        expect(consumePaymentReturn('ORDfixture', 7, 12)).toBe('/my-reservations');
        expect(consumePaymentReturn('ORDother', 7, 12)).toBe('/store/12');
    });
    it('저장소가 차단돼도 현재 탭의 복귀 위치를 유지해요', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
        rememberPaymentReturn('ORDfixture', 7, { pathname: '/store/12' });
        expect(consumePaymentReturn('ORDfixture', 7, 12)).toBe('/store/12');
    });
    it('오래된 주문을 무제한 쌓지 않고 계정 전환 시 전부 비워요', () => {
        for (let index = 0; index < 9; index++) rememberPaymentReturn('ORD' + index, 7, { pathname: '/store/12' });
        expect(JSON.parse(sessionStorage.getItem('reserve:payment-return'))).toHaveLength(5);
        clearPaymentReturns();
        expect(consumePaymentReturn('ORD8', 7, 12)).toBe('/my-reservations');
    });
});
