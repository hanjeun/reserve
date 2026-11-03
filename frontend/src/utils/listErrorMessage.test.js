import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpStatusOf, listRequestErrorDescription, listRequestErrorKind, listRequestErrorMessage } from './listErrorMessage';

afterEach(() => vi.unstubAllGlobals());

describe('listRequestErrorMessage', () => {
    it('uses neutral list failure copy and separates authorization, throttling, and server failure', () => {
        expect(listRequestErrorMessage({ status: 404 }, '가게 목록')).toBe('요청한 가게 목록을 불러올 수 없어요. 잠시 후 다시 시도해주세요.');
        expect(listRequestErrorMessage({ status: 403 }, '가게 목록')).toContain('권한');
        expect(listRequestErrorMessage({ status: 429 }, '가게 목록')).toContain('제한');
        expect(listRequestErrorMessage({ status: 500, message: 'private stack' }, '가게 목록')).not.toContain('private');
    });

    it('describes missing detail records without claiming the server feature is absent', () => {
        expect(listRequestErrorMessage({ status: 404 }, '가게 정보', 'detail')).toBe('요청하신 가게 정보를 찾을 수 없어요.');
        expect(listRequestErrorMessage({ response: { status: 410 } }, '가게 정보', 'detail')).toBe('요청하신 가게 정보를 더 이상 볼 수 없어요.');
        expect(listRequestErrorMessage({ status: 401 }, '가게 정보', 'detail')).toContain('로그인');
        expect(listRequestErrorMessage({ status: 429 }, '가게 정보', 'detail')).toContain('제한');
    });

    it('uses the correct Korean object particle for the subject', () => {
        expect(listRequestErrorMessage(new Error('offline'), '통계')).toContain('통계를 불러오지 못했어요');
        expect(listRequestErrorMessage(new Error('offline'), '가게 목록')).toContain('가게 목록을 불러오지 못했어요');
    });

    it('keeps request icon meanings separate from display copy', () => {
        expect(listRequestErrorKind({ status: 403 })).toBe('forbidden');
        expect(listRequestErrorKind({ status: 410 })).toBe('missing');
        expect(listRequestErrorKind({ status: 429 })).toBe('rateLimited');
        expect(listRequestErrorKind({ status: 500 })).toBe('unavailable');
        expect(listRequestErrorKind(new Error('서버에 연결할 수 없어요.'))).toBe('unavailable');
    });

    it.each([
        [{ code: 'ERR_NETWORK' }, '서버에 연결할 수 없어요'],
        ['서버에 연결할 수 없어요.', '서버에 연결할 수 없어요'],
        [new Error('Network Error'), '서버에 연결할 수 없어요'],
        [{ code: 'ECONNABORTED' }, '서버 응답이 늦어지고 있어요'],
        [{ response: { status: '401' } }, '다시 로그인'],
        [{ status: 403 }, '조회 권한'],
        [{ status: 404 }, '요청한 정보를 불러올 수 없어요'],
        [{ status: 408 }, '서버 응답'],
        [{ status: 409 }, '상태가 바뀌었어요'],
        [{ status: 422 }, '요청을 처리할 수 없어요'],
        [{ status: 429 }, '잠시 제한'],
        [{ status: 503 }, '서버에서 요청을 처리하지 못했어요'],
    ])('keeps a safe cause available beside a custom page title (%j)', (error, expected) => {
        expect(listRequestErrorDescription(error)).toContain(expected);
    });

    it('prefers a received HTTP response over the current offline flag', () => {
        vi.stubGlobal('navigator', { onLine: false });
        expect(listRequestErrorKind({ response: { status: '403' } })).toBe('forbidden');
        expect(listRequestErrorDescription({ status: 503 })).toContain('서버에서 요청');
        expect(listRequestErrorKind({ code: 'ERR_NETWORK' })).toBe('offline');
        expect(listRequestErrorDescription({ code: 'ERR_NETWORK' })).toContain('인터넷 연결이 끊겼어요');
    });

    it('never reflects arbitrary response text or treats an invalid status as HTTP', () => {
        expect(listRequestErrorDescription({ message: 'private response trace', response: { data: 'private payload' } })).toBeUndefined();
        expect(httpStatusOf({ status: '' })).toBeUndefined();
        expect(httpStatusOf({ status: '403' })).toBe(403);
        expect(listRequestErrorDescription({ status: 410 }, 'detail')).toContain('더 이상 확인');
    });

    it('keeps malformed error messages from breaking the error view', () => {
        const failure = { message: { internal: 'private payload' } };
        expect(listRequestErrorMessage(failure, '게시물')).toBe('게시물을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
        expect(listRequestErrorDescription(failure)).toBeUndefined();
        expect(listRequestErrorKind(failure)).toBe('unknown');
    });
});
