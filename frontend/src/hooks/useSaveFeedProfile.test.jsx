import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useSaveFeedProfile from './useSaveFeedProfile';
import { feedKeys, invalidateFeed } from './feedQueries';
import feedService from '../services/feedService';
import { advanceSession, currentSession } from '../api/sessionScope';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), checkAuth: vi.fn() }));
vi.mock('./useMessage', () => ({ default: () => ({ message: mocks }) }));
vi.mock('./feedQueries', () => ({
    feedKeys: { profile: () => ['feed', 'me', 'profile'] },
    invalidateFeed: vi.fn(),
}));
vi.mock('../services/feedService', () => ({ default: { saveProfile: vi.fn() } }));
vi.mock('../store/useAuthStore', () => ({ default: { getState: () => ({ checkAuth: mocks.checkAuth }) } }));

const PROFILE = { publicId: 'author-7', nickname: '공개 이름', bio: '소개', visibility: 'PRIVATE', avatarUrl: '/account.png' };
const NEXT = { ...PROFILE, visibility: 'MEMBERS', avatarUrl: '/updated.png' };
const OTHER = { ...PROFILE, publicId: 'author-9', nickname: '다른 계정', avatarUrl: '/other.png' };
const photo = () => new File(['photo fixture'], 'profile.png', { type: 'image/png' });
const values = extra => ({ nickname: '  공개 이름  ', bio: '  소개  ', visibility: 'MEMBERS', session: currentSession().epoch, ...extra });

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

describe('unified profile saves the selected audience and image for the current account', () => {
    let client;
    let onSaved;

    beforeEach(() => {
        vi.resetAllMocks();
        advanceSession();
        client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
        client.setQueryData(feedKeys.profile(), PROFILE);
        onSaved = vi.fn();
        invalidateFeed.mockResolvedValue([]);
        mocks.checkAuth.mockResolvedValue(null);
    });
    afterEach(() => client.clear());

    const hook = () => renderHook(() => useSaveFeedProfile(onSaved), {
        wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    const submit = (result, input) => result.current.mutateAsync(input).then(data => ({ data }), error => ({ error }));
    const noSuccess = () => {
        expect(mocks.success).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
    };
    const switchAccount = () => {
        advanceSession();
        client.setQueryData(feedKeys.profile(), OTHER);
    };

    it('sends one save and refreshes the common display photo', async () => {
        const file = photo();
        const { result } = hook();
        feedService.saveProfile.mockResolvedValue(NEXT);

        await act(async () => { expect(await submit(result, values({ avatarFile: file }))).toEqual({ data: NEXT }); });

        expect(feedService.saveProfile).toHaveBeenCalledExactlyOnceWith({
            nickname: '공개 이름', bio: '소개', visibility: 'MEMBERS', resetPhoto: false,
        }, file);
        expect(client.getQueryData(feedKeys.profile())).toEqual(NEXT);
        expect(invalidateFeed).toHaveBeenCalledWith(client);
        expect(mocks.checkAuth).toHaveBeenCalledExactlyOnceWith(true);
        expect(onSaved).toHaveBeenCalledWith(NEXT);
    });

    it('saves the reset directly with the selected audience and no file', async () => {
        feedService.saveProfile.mockResolvedValue({ ...PROFILE, avatarUrl: null });
        const { result } = hook();
        await act(async () => submit(result, values({ visibility: 'PRIVATE', resetPhoto: true, bio: null })));

        expect(feedService.saveProfile).toHaveBeenCalledExactlyOnceWith({
            nickname: '공개 이름', bio: '', visibility: 'PRIVATE', resetPhoto: true,
        }, undefined);
    });

    it('retains the saved profile after a failed photo save and retries the same file', async () => {
        const input = values({ avatarFile: photo() });
        const { result } = hook();
        feedService.saveProfile.mockRejectedValueOnce(new Error('사진 저장 실패')).mockResolvedValueOnce(NEXT);

        await act(async () => { expect((await submit(result, input)).error.message).toBe('사진 저장 실패'); });
        expect(client.getQueryData(feedKeys.profile())).toEqual(PROFILE);
        expect(invalidateFeed).not.toHaveBeenCalled();
        noSuccess();
        await act(async () => submit(result, input));

        expect(feedService.saveProfile.mock.calls.map(args => args[1])).toEqual([input.avatarFile, input.avatarFile]);
        expect(client.getQueryData(feedKeys.profile())).toEqual(NEXT);
        expect(onSaved).toHaveBeenCalledOnce();
    });

    it('rejects an editor from another account before saving', async () => {
        const oldInput = values({ avatarFile: photo() });
        switchAccount();
        const { result } = hook();
        await act(async () => { expect((await submit(result, oldInput)).error.isStaleSession).toBe(true); });
        expect(feedService.saveProfile).not.toHaveBeenCalled();
        expect(client.getQueryData(feedKeys.profile())).toEqual(OTHER);
        expect(mocks.error).not.toHaveBeenCalled();
    });

    it.each(['resolves', 'rejects'])('discards a request that %s after the account changes', async outcome => {
        const save = deferred();
        const { result } = hook();
        feedService.saveProfile.mockReturnValue(save.promise);
        let submitted;
        act(() => { submitted = submit(result, values({ avatarFile: photo() })); });
        await waitFor(() => expect(feedService.saveProfile).toHaveBeenCalledOnce());
        switchAccount();
        await act(async () => {
            if (outcome === 'resolves') save.resolve(NEXT);
            else save.reject(new Error('이전 요청 실패'));
            expect((await submitted).error.isStaleSession).toBe(true);
        });

        expect(client.getQueryData(feedKeys.profile())).toEqual(OTHER);
        expect(invalidateFeed).not.toHaveBeenCalled();
        expect(mocks.error).not.toHaveBeenCalled();
        noSuccess();
    });

    it('discards success feedback when the account changes during cache refresh', async () => {
        const refresh = deferred();
        invalidateFeed.mockReturnValue(refresh.promise);
        feedService.saveProfile.mockResolvedValue(NEXT);
        const { result } = hook();
        let submitted;
        act(() => { submitted = submit(result, values({})); });
        await waitFor(() => expect(invalidateFeed).toHaveBeenCalledOnce());
        switchAccount();
        await act(async () => {
            refresh.resolve([]);
            expect((await submitted).error.isStaleSession).toBe(true);
        });

        expect(client.getQueryData(feedKeys.profile())).toEqual(OTHER);
        expect(mocks.error).not.toHaveBeenCalled();
        noSuccess();
    });
});
