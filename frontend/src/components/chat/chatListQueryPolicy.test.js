import { describe, expect, it } from 'vitest';
import {
    chatListErrorMessage,
    chatListQueryPolicy,
    shouldRetryChatList,
} from './chatListQueryPolicy';

const queryWith = error => ({ state: { error } });

describe('chat list automatic refetch policy', () => {
    it('retries only one recoverable failure and never repeats permanent 4xx failures', () => {
        expect(chatListQueryPolicy.retry).toBe(shouldRetryChatList);
        expect(shouldRetryChatList(0, { status: 500 })).toBe(true);
        expect(shouldRetryChatList(1, { status: 500 })).toBe(false);
        expect(shouldRetryChatList(0, { status: 404 })).toBe(false);
    });

    it.each([400, 401, 403, 404, 409, 410, 422])('stops automatic requests after HTTP %i without changing the error', status => {
        const error = Object.assign(new Error('실제 조회 오류'), { status });
        const query = queryWith(error);
        expect(chatListQueryPolicy.refetchInterval(query)).toBe(false);
        expect(chatListQueryPolicy.refetchOnWindowFocus(query)).toBe(false);
        expect(chatListQueryPolicy.refetchOnReconnect(query)).toBe(false);
        expect(query.state.error).toBe(error);
    });

    it.each([null, new Error('offline'), { status: 429 }, { status: 500 }, { status: 503 }])('retains scheduled recovery for transient errors: %s', error => {
        const query = queryWith(error);
        expect(chatListQueryPolicy.refetchInterval(query)).toBe(30000);
        expect(chatListQueryPolicy.refetchOnWindowFocus(query)).toBe(true);
        expect(chatListQueryPolicy.refetchOnReconnect(query)).toBe(true);
    });

    it('also recognizes an unnormalized Axios status and resumes after manual success clears the error', () => {
        const query = queryWith({ response: { status: 404 } });
        expect(chatListQueryPolicy.refetchInterval(query)).toBe(false);
        query.state.error = null;
        expect(chatListQueryPolicy.refetchInterval(query)).toBe(30000);
    });

    it('separates permission, route, throttling, server, and connection failures without exposing raw server text', () => {
        expect(chatListErrorMessage({ status: 403 })).toContain('권한');
        expect(chatListErrorMessage({ status: 404 })).toContain('비어 있는 상태가 아닙니다');
        expect(chatListErrorMessage({ status: 429 })).toContain('제한');
        expect(chatListErrorMessage({ status: 500, message: 'private stack trace' })).toContain('서버에서');
        expect(chatListErrorMessage(new Error('서버에 연결할 수 없어요.'))).toContain('서버에 연결할 수 없어');
        expect(chatListErrorMessage({ status: 500, message: 'private stack trace' })).not.toContain('private');
    });
});
