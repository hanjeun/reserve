import { describe, expect, it } from 'vitest';
import { listRequestErrorKind, listRequestErrorMessage } from './listErrorMessage';

describe('listRequestErrorMessage', () => {
    it('separates an absent route, authorization, throttling, and server failure', () => {
        expect(listRequestErrorMessage({ status: 404 }, '가게 목록')).toContain('비어 있는 상태가 아닙니다');
        expect(listRequestErrorMessage({ status: 403 }, '가게 목록')).toContain('권한');
        expect(listRequestErrorMessage({ status: 429 }, '가게 목록')).toContain('제한');
        expect(listRequestErrorMessage({ status: 500, message: 'private stack' }, '가게 목록')).not.toContain('private');
    });

    it('uses the correct Korean object particle for the subject', () => {
        expect(listRequestErrorMessage(new Error('offline'), '통계')).toContain('통계를 불러오지 못했습니다');
        expect(listRequestErrorMessage(new Error('offline'), '가게 목록')).toContain('가게 목록을 불러오지 못했습니다');
    });

    it('keeps request icon meanings separate from display copy', () => {
        expect(listRequestErrorKind({ status: 403 })).toBe('forbidden');
        expect(listRequestErrorKind({ status: 429 })).toBe('rateLimited');
        expect(listRequestErrorKind({ status: 500 })).toBe('unavailable');
        expect(listRequestErrorKind(new Error('서버에 연결할 수 없어요.'))).toBe('unavailable');
    });
});
