import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedKeys, invalidateFeed } from './feedQueries';
import useMessage from './useMessage';
import feedService from '../services/feedService';
import { assertCurrentSession } from '../api/sessionScope';
import useAuthStore from '../store/useAuthStore';
import { reviewKeys } from './queryKeys';

/* 첫 글쓰기와 마이페이지에서 같은 프로필을 편집한다. */
export default function useSaveFeedProfile(onSaved) {
    const client = useQueryClient();
    const { message } = useMessage();
    return useMutation({
        mutationFn: async values => {
            assertCurrentSession(values.session);
            return feedService.saveProfile({ nickname: values.nickname.trim(), bio: values.bio?.trim() || '',
                visibility: values.visibility, resetPhoto: values.resetPhoto === true }, values.avatarFile)
                .finally(() => assertCurrentSession(values.session));
        },
        onSuccess: async (data, values) => {
            assertCurrentSession(values.session);
            client.setQueryData(feedKeys.profile(), data);
            await Promise.all([
                invalidateFeed(client),
                client.invalidateQueries({ queryKey: reviewKeys.all() }),
                useAuthStore.getState().checkAuth(true),
            ]);
            assertCurrentSession(values.session);
            message.success('프로필을 저장했어요.');
            onSaved?.(data);
        },
        onError: error => { if (!error.isStaleSession) message.error(error.message); },
    });
}
