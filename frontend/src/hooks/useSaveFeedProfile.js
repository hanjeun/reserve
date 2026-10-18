import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys, invalidateFeed } from './feedQueries';
import useMessage from './useMessage';
import feedService from '../services/feedService';
import { assertCurrentSession } from '../api/sessionScope';

/** Onboarding and account settings share the same public-profile save boundary. */
export default function useSaveFeedProfile(onSaved) {
    const client = useQueryClient();
    const { message } = useMessage();
    return useMutation({
        mutationFn: async values => {
            assertCurrentSession(values.session);
            const upload = values.avatarSource === 'CUSTOM' && values.avatarFile;
            const source = upload ? values.previousAvatarSource || 'NONE' : values.avatarSource;
            const data = await feedService.saveProfile({ nickname: values.nickname.trim(), bio: values.bio?.trim() || '',
                ...(source ? { avatarSource: source } : { useAccountAvatar: values.useAccountAvatar === true }) });
            assertCurrentSession(values.session);
            if (!upload) return data;
            try {
                return await feedService.uploadProfileAvatar(values.avatarFile);
            } catch (error) {
                assertCurrentSession(values.session);
                // The text save committed; retain its real server state and the selected local file for retry.
                client.setQueryData(feedKeys.profile(), data);
                await invalidateFeed(client);
                assertCurrentSession(values.session);
                throw new Error(`프로필 내용은 저장했지만 사진을 올리지 못했어요. 선택한 사진으로 다시 저장해주세요. ${error.message || ''}`.trim(), { cause: error });
            }
        },
        onSuccess: async (data, values) => {
            assertCurrentSession(values.session);
            client.setQueryData(feedKeys.profile(), data);
            await invalidateFeed(client);
            assertCurrentSession(values.session);
            message.success('공개 프로필을 저장했어요.');
            onSaved?.(data);
        },
        onError: error => { if (!error.isStaleSession) message.error(error.message); },
    });
}
