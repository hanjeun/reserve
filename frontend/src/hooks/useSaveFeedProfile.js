import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys, invalidateFeed } from './feedQueries';
import useMessage from './useMessage';
import feedService from '../services/feedService';
import { assertCurrentSession } from '../api/sessionScope';

/* 가입 안내와 계정 설정은 같은 공개 프로필 저장 관문을 사용한다. */
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
                // 텍스트 저장이 완료되면 서버 상태와 재시도할 로컬 사진을 유지한다.
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
