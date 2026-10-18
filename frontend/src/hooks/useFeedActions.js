import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import useMessage from './useMessage';
import { invalidateFeed } from './feedQueries';
import feedService from '../services/feedService';
import { postPath } from '../utils/feed';
import { saveRedirect } from '../utils/redirect';
import { appUrl } from '../config/siteUrls';

export default function useFeedActions({ onDeleted } = {}) {
    const client = useQueryClient();
    const navigate = useNavigate();
    const user = useAuthStore(state => state.user);
    const { message, confirm } = useMessage();
    const remove = useMutation({ mutationFn: post => feedService.remove(post.id),
        onSuccess: async () => { await invalidateFeed(client); message.success('게시물을 삭제했어요.'); onDeleted?.(); },
    });
    const onDelete = post => confirm({ title: '게시물을 삭제할까요?',
        content: '글과 첨부 사진이 공개 화면에서 삭제돼요. 삭제한 글은 복원할 수 없어요.',
        okText: '삭제', okButtonProps: { danger: true },
        onOk: () => remove.mutateAsync(post).catch(error => { if (!error.isStaleSession) message.error(error.message); throw error; }),
    });
    const requestReport = (post, open) => {
        if (!user) {
            const pathname = postPath(post.id);
            saveRedirect(pathname);
            navigate('/login', { state: { from: { pathname } } });
            return;
        }
        open(post.id);
    };
    const onShare = async post => {
        const url = appUrl(postPath(post.id));
        try {
            if (typeof navigator.share === 'function') {
                await navigator.share({ title: `${post.author?.nickname || '회원'}의 RESERVE 게시물`, url });
            } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
                message.success('게시물 주소를 복사했어요.');
            } else message.info(url);
        } catch (error) { if (error.name !== 'AbortError') message.info(`게시물 주소: ${url}`); }
    };
    return { onDelete, requestReport, onShare };
}
