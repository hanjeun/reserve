import { beforeEach, describe, expect, it, vi } from 'vitest';
import feedService from './feedService';
import api from '../api/axios';

vi.mock('../api/axios', () => ({ default: { put: vi.fn(), delete: vi.fn() } }));

describe('public profile avatar transport', () => {
    beforeEach(() => vi.resetAllMocks());

    it('sends the chosen source with the profile JSON to the authenticated personal endpoint', async () => {
        const values = { nickname: '공개 이름', bio: '소개', avatarSource: 'ACCOUNT' };
        const saved = { ...values, publicId: 'author-7' };
        api.put.mockResolvedValue(saved);

        await expect(feedService.saveProfile(values)).resolves.toEqual(saved);

        expect(api.put).toHaveBeenCalledWith('/api/feed/me/profile', values);
    });

    it('uploads multipart image to the profile-avatar endpoint without overriding its boundary', async () => {
        const file = new File(['photo fixture'], 'profile.png', { type: 'image/png' });
        api.put.mockResolvedValue({ avatarSource: 'CUSTOM' });

        await expect(feedService.uploadProfileAvatar(file)).resolves.toEqual({ avatarSource: 'CUSTOM' });

        const [path, form, options] = api.put.mock.calls[0];
        expect(path).toBe('/api/feed/me/profile/avatar');
        expect(form).toBeInstanceOf(FormData);
        expect([...form.keys()]).toEqual(['image']);
        expect(form.get('image')).toBe(file);
        expect(options).toBeUndefined();
    });

    it('clears only the feed avatar through its authenticated DELETE endpoint', async () => {
        api.delete.mockResolvedValue({ avatarSource: 'NONE', avatarUrl: null });

        await expect(feedService.deleteProfileAvatar()).resolves.toEqual({ avatarSource: 'NONE', avatarUrl: null });

        expect(api.delete).toHaveBeenCalledWith('/api/feed/me/profile/avatar');
        expect(api.put).not.toHaveBeenCalled();
    });
});
