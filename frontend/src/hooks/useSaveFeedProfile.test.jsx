import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useSaveFeedProfile from './useSaveFeedProfile';
import { feedKeys, invalidateFeed } from './feedQueries';
import feedService from '../services/feedService';
import { advanceSession, currentSession } from '../api/sessionScope';

const notices = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('./useMessage', () => ({ default: () => ({ message: notices }) }));
vi.mock('./feedQueries', () => ({
    feedKeys: { profile: () => ['feed', 'me', 'profile'] },
    invalidateFeed: vi.fn(),
}));
vi.mock('../services/feedService', () => ({ default: { saveProfile: vi.fn(), uploadProfileAvatar: vi.fn() } }));

const ACCOUNT = { publicId: 'author-7', nickname: '공개 이름', bio: '소개', avatarSource: 'ACCOUNT', useAccountAvatar: true, avatarUrl: '/account.png' };
const NONE = { ...ACCOUNT, avatarSource: 'NONE', useAccountAvatar: false, avatarUrl: null };
const CUSTOM = { ...ACCOUNT, avatarSource: 'CUSTOM', useAccountAvatar: false, avatarUrl: '/custom.png' };
const NEXT_ACCOUNT = { ...ACCOUNT, publicId: 'author-9', nickname: '다른 계정', avatarUrl: '/other-account.png' };
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const photo = () => new File(['photo fixture'], 'profile.png', { type: 'image/png' });
const values = extra => ({ nickname: '  공개 이름  ', bio: '  소개  ', session: currentSession().epoch, ...extra });

describe('public profile save and avatar account boundaries', () => {
    let client;
    let onSaved;

    beforeEach(() => {
        vi.resetAllMocks();
        advanceSession();
        client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
        onSaved = vi.fn();
        invalidateFeed.mockResolvedValue([]);
    });
    afterEach(() => client.clear());

    const hook = () => renderHook(() => useSaveFeedProfile(onSaved), {
        wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    const mutate = async (result, input) => {
        let outcome;
        await act(async () => {
            outcome = await result.current.mutateAsync(input).then(data => ({ data }), error => ({ error }));
        });
        return outcome;
    };
    const begin = (result, input) => {
        let pending;
        act(() => { pending = result.current.mutateAsync(input).then(data => ({ data }), error => ({ error })); });
        return pending;
    };
    const expectNoSuccess = () => {
        expect(notices.success).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
    };
    const switchAccount = () => {
        advanceSession();
        client.setQueryData(feedKeys.profile(), NEXT_ACCOUNT);
    };

    it('creates the nickname with NONE before uploading a first custom photo', async () => {
        feedService.saveProfile.mockResolvedValue(NONE);
        feedService.uploadProfileAvatar.mockResolvedValue(CUSTOM);
        const file = photo();
        const { result } = hook();

        const outcome = await mutate(result, values({ avatarSource: 'CUSTOM', avatarFile: file }));

        expect(feedService.saveProfile).toHaveBeenCalledWith({ nickname: '공개 이름', bio: '소개', avatarSource: 'NONE' });
        expect(feedService.uploadProfileAvatar).toHaveBeenCalledWith(file);
        expect(feedService.saveProfile.mock.invocationCallOrder[0]).toBeLessThan(feedService.uploadProfileAvatar.mock.invocationCallOrder[0]);
        expect(outcome.data).toEqual(CUSTOM);
        expect(client.getQueryData(feedKeys.profile())).toEqual(CUSTOM);
        expect(invalidateFeed).toHaveBeenCalledWith(client);
        expect(notices.success).toHaveBeenCalledOnce();
        expect(onSaved).toHaveBeenCalledWith(CUSTOM);
    });

    it.each(['ACCOUNT', 'CUSTOM', 'NONE'])('keeps existing %s until replacement upload succeeds', async previousAvatarSource => {
        const previous = { ACCOUNT, CUSTOM, NONE }[previousAvatarSource];
        const upload = deferred();
        client.setQueryData(feedKeys.profile(), previous);
        feedService.saveProfile.mockResolvedValue(previous);
        feedService.uploadProfileAvatar.mockReturnValue(upload.promise);
        const file = photo();
        const { result } = hook();
        const pending = begin(result, values({ avatarSource: 'CUSTOM', previousAvatarSource, avatarFile: file }));
        await waitFor(() => expect(feedService.uploadProfileAvatar).toHaveBeenCalledOnce());

        expect(feedService.saveProfile).toHaveBeenCalledWith({ nickname: '공개 이름', bio: '소개', avatarSource: previousAvatarSource });
        expect(client.getQueryData(feedKeys.profile())).toEqual(previous);
        expectNoSuccess();
        await act(async () => { upload.resolve(CUSTOM); await pending; });
        expect(client.getQueryData(feedKeys.profile())).toEqual(CUSTOM);
        expect(onSaved).toHaveBeenCalledWith(CUSTOM);
    });

    it('caches the committed text profile on photo failure and retries the same selected file', async () => {
        const saved = { ...ACCOUNT, bio: '저장된 소개' };
        feedService.saveProfile.mockResolvedValue(saved);
        feedService.uploadProfileAvatar.mockRejectedValueOnce(new Error('사진 업로드 실패')).mockResolvedValueOnce(CUSTOM);
        const file = photo();
        const input = values({ bio: '저장된 소개', avatarSource: 'CUSTOM', previousAvatarSource: 'ACCOUNT', avatarFile: file });
        const { result } = hook();

        const failed = await mutate(result, input);

        expect(failed.error.message).toContain('프로필 내용은 저장했지만 사진을 올리지 못했어요.');
        expect(client.getQueryData(feedKeys.profile())).toEqual(saved);
        expect(invalidateFeed).toHaveBeenCalledOnce();
        expect(notices.error).toHaveBeenCalledOnce();
        expectNoSuccess();

        const retried = await mutate(result, input);

        expect(retried.data).toEqual(CUSTOM);
        expect(feedService.uploadProfileAvatar.mock.calls).toEqual([[file], [file]]);
        expect(client.getQueryData(feedKeys.profile())).toEqual(CUSTOM);
        expect(notices.success).toHaveBeenCalledOnce();
        expect(onSaved).toHaveBeenCalledOnce();
    });

    it.each(['ACCOUNT', 'NONE'])('saves %s directly without uploading a discarded pending file', async avatarSource => {
        const saved = { ACCOUNT, NONE }[avatarSource];
        feedService.saveProfile.mockResolvedValue(saved);
        const { result } = hook();

        await mutate(result, values({ avatarSource, avatarFile: photo(), bio: undefined }));

        expect(feedService.saveProfile).toHaveBeenCalledWith({ nickname: '공개 이름', bio: '', avatarSource });
        expect(feedService.uploadProfileAvatar).not.toHaveBeenCalled();
        expect(client.getQueryData(feedKeys.profile())).toEqual(saved);
        expect(onSaved).toHaveBeenCalledWith(saved);
    });

    it.each([true, false])('keeps legacy Boolean useAccountAvatar=%s when no source is provided', async useAccountAvatar => {
        feedService.saveProfile.mockResolvedValue(useAccountAvatar ? ACCOUNT : NONE);
        const { result } = hook();

        await mutate(result, values({ useAccountAvatar }));

        expect(feedService.saveProfile).toHaveBeenCalledWith({ nickname: '공개 이름', bio: '소개', useAccountAvatar });
        expect(feedService.uploadProfileAvatar).not.toHaveBeenCalled();
    });

    it('does not upload or change cache after the text save fails', async () => {
        client.setQueryData(feedKeys.profile(), ACCOUNT);
        feedService.saveProfile.mockRejectedValue(new Error('저장할 수 없어요.'));
        const { result } = hook();

        const outcome = await mutate(result, values({ avatarSource: 'CUSTOM', avatarFile: photo() }));

        expect(outcome.error.message).toBe('저장할 수 없어요.');
        expect(feedService.uploadProfileAvatar).not.toHaveBeenCalled();
        expect(invalidateFeed).not.toHaveBeenCalled();
        expect(client.getQueryData(feedKeys.profile())).toEqual(ACCOUNT);
        expectNoSuccess();
    });

    it('rejects a stale editor before any save request', async () => {
        const input = values({ avatarSource: 'CUSTOM', avatarFile: photo() });
        switchAccount();
        const { result } = hook();

        const outcome = await mutate(result, input);

        expect(outcome.error.isStaleSession).toBe(true);
        expect(feedService.saveProfile).not.toHaveBeenCalled();
        expect(feedService.uploadProfileAvatar).not.toHaveBeenCalled();
        expect(client.getQueryData(feedKeys.profile())).toEqual(NEXT_ACCOUNT);
        expect(notices.error).not.toHaveBeenCalled();
        expectNoSuccess();
    });

    it('blocks the next upload when account changes during the text save', async () => {
        const save = deferred();
        feedService.saveProfile.mockReturnValue(save.promise);
        const { result } = hook();
        const pending = begin(result, values({ avatarSource: 'CUSTOM', avatarFile: photo() }));
        await waitFor(() => expect(feedService.saveProfile).toHaveBeenCalledOnce());
        switchAccount();
        let outcome;

        await act(async () => { save.resolve(NONE); outcome = await pending; });

        expect(outcome.error.isStaleSession).toBe(true);
        expect(feedService.uploadProfileAvatar).not.toHaveBeenCalled();
        expect(invalidateFeed).not.toHaveBeenCalled();
        expect(client.getQueryData(feedKeys.profile())).toEqual(NEXT_ACCOUNT);
        expectNoSuccess();
    });

    it.each(['resolve', 'reject'])('discards upload %s after an account change', async completion => {
        const upload = deferred();
        feedService.saveProfile.mockResolvedValue(ACCOUNT);
        feedService.uploadProfileAvatar.mockReturnValue(upload.promise);
        const { result } = hook();
        const pending = begin(result, values({ avatarSource: 'CUSTOM', previousAvatarSource: 'ACCOUNT', avatarFile: photo() }));
        await waitFor(() => expect(feedService.uploadProfileAvatar).toHaveBeenCalledOnce());
        switchAccount();
        let outcome;

        await act(async () => {
            if (completion === 'resolve') upload.resolve(CUSTOM);
            else upload.reject(new Error('이전 요청 실패'));
            outcome = await pending;
        });

        expect(outcome.error.isStaleSession).toBe(true);
        expect(client.getQueryData(feedKeys.profile())).toEqual(NEXT_ACCOUNT);
        expect(invalidateFeed).not.toHaveBeenCalled();
        expect(notices.error).not.toHaveBeenCalled();
        expectNoSuccess();
    });

    it('does not notify or restore old cache when account changes while successful invalidation is pending', async () => {
        const invalidation = deferred();
        feedService.saveProfile.mockResolvedValue(ACCOUNT);
        invalidateFeed.mockReturnValue(invalidation.promise);
        const { result } = hook();
        const pending = begin(result, values({ avatarSource: 'ACCOUNT' }));
        await waitFor(() => expect(invalidateFeed).toHaveBeenCalledOnce());
        switchAccount();
        let outcome;

        await act(async () => { invalidation.resolve([]); outcome = await pending; });

        expect(outcome.error.isStaleSession).toBe(true);
        expect(client.getQueryData(feedKeys.profile())).toEqual(NEXT_ACCOUNT);
        expect(notices.error).not.toHaveBeenCalled();
        expectNoSuccess();
    });

    it('keeps new account cache when photo-failure invalidation completes after a switch', async () => {
        const invalidation = deferred();
        feedService.saveProfile.mockResolvedValue(ACCOUNT);
        feedService.uploadProfileAvatar.mockRejectedValue(new Error('사진 업로드 실패'));
        invalidateFeed.mockReturnValue(invalidation.promise);
        const { result } = hook();
        const pending = begin(result, values({ avatarSource: 'CUSTOM', previousAvatarSource: 'ACCOUNT', avatarFile: photo() }));
        await waitFor(() => expect(invalidateFeed).toHaveBeenCalledOnce());
        expect(client.getQueryData(feedKeys.profile())).toEqual(ACCOUNT);
        switchAccount();
        let outcome;

        await act(async () => { invalidation.resolve([]); outcome = await pending; });

        expect(outcome.error.isStaleSession).toBe(true);
        expect(client.getQueryData(feedKeys.profile())).toEqual(NEXT_ACCOUNT);
        expect(notices.error).not.toHaveBeenCalled();
        expectNoSuccess();
    });
});
