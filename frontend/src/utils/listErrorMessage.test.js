import { describe, expect, it } from 'vitest';
import { listRequestErrorKind, listRequestErrorMessage } from './listErrorMessage';

describe('listRequestErrorMessage', () => {
    it('uses neutral list failure copy and separates authorization, throttling, and server failure', () => {
        expect(listRequestErrorMessage({ status: 404 }, '가게 목록')).toBe('요청한 가게 목록을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.');
        expect(listRequestErrorMessage({ status: 403 }, '가게 목록')).toContain('권한');
        expect(listRequestErrorMessage({ status: 429 }, '가게 목록')).toContain('제한');
        expect(listRequestErrorMessage({ status: 500, message: 'private stack' }, '가게 목록')).not.toContain('private');
    });

    it('describes missing detail records without claiming the server feature is absent', () => {
        expect(listRequestErrorMessage({ status: 404 }, '가게 정보', 'detail')).toBe('요청하신 가게 정보를 찾을 수 없습니다.');
        expect(listRequestErrorMessage({ response: { status: 410 } }, '가게 정보', 'detail')).toBe('요청하신 가게 정보를 더 이상 볼 수 없습니다.');
        expect(listRequestErrorMessage({ status: 401 }, '가게 정보', 'detail')).toContain('로그인');
        expect(listRequestErrorMessage({ status: 429 }, '가게 정보', 'detail')).toContain('제한');
    });

    it('uses the correct Korean object particle for the subject', () => {
        expect(listRequestErrorMessage(new Error('offline'), '통계')).toContain('통계를 불러오지 못했습니다');
        expect(listRequestErrorMessage(new Error('offline'), '가게 목록')).toContain('가게 목록을 불러오지 못했습니다');
    });

    it('keeps request icon meanings separate from display copy', () => {
        expect(listRequestErrorKind({ status: 403 })).toBe('forbidden');
        expect(listRequestErrorKind({ status: 410 })).toBe('missing');
        expect(listRequestErrorKind({ status: 429 })).toBe('rateLimited');
        expect(listRequestErrorKind({ status: 500 })).toBe('unavailable');
        expect(listRequestErrorKind(new Error('서버에 연결할 수 없어요.'))).toBe('unavailable');
    });
});
