import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { interactionKeys, useFeedInteractions } from './feedInteractionQueries';
import service from '../services/feedInteractionService';
import useAuthStore from '../store/useAuthStore';
import useMessage from './useMessage';
import { assertCurrentSession, currentSession, isCurrentSession } from '../api/sessionScope';
import { saveRedirect } from '../utils/redirect';

/** 글·소식·댓글은 같은 멱등 요청과 계정 경계를 사용한다. */
export default function useContentLike(type, targetId, initialStatus) {
    const user = useAuthStore(state => state.user);
    const client = useQueryClient();
    const { message } = useMessage();
    const navigate = useNavigate();
    const location = useLocation();
    const config = useFeedInteractions();
    const lock = useRef(false);
    const capability = type === 'NEWS' ? config.data?.newsEnabled : type === 'COMMENT' ? config.data?.commentLikesEnabled : config.data?.enabled;
    const enabled = capability === true && Number.isSafeInteger(targetId) && targetId > 0;
    const key = interactionKeys.status(type, targetId);
    const status = useQuery({ queryKey: key, queryFn: ({ signal }) => service.status(type, targetId, signal), enabled,
        initialData: initialStatus, staleTime: 30_000, retry: false });
    const like = useMutation({ mutationFn: async ({ liked, session, targetType, id }) => {
        assertCurrentSession(session);
        const saved = await service.setLike(targetType, id, liked);
        assertCurrentSession(session); return saved;
    }, onMutate: async ({ liked, session, targetType, id }) => {
        const mutationKey = interactionKeys.status(targetType, id);
        await client.cancelQueries({ queryKey: mutationKey });
        assertCurrentSession(session);
        const previous = client.getQueryData(mutationKey);
        if (previous) client.setQueryData(mutationKey, { ...previous, liked, likeCount: Math.max(0, previous.likeCount + (liked ? 1 : -1)) });
        return { previous, session, key: mutationKey };
    }, onSuccess: (saved, _, context) => {
        if (!context || !isCurrentSession(context.session)) return;
        client.setQueryData(context.key, saved);
        void client.invalidateQueries({ queryKey: ['feed', 'interactions', 'mine'] });
    }, onError: (error, _, context) => {
        if (error.isStaleSession || !context || !isCurrentSession(context.session)) return;
        client.setQueryData(context.key, context.previous); message.error(error.message);
    }, onSettled: () => { lock.current = false; } });
    const click = () => {
        if (lock.current || status.isPending || !enabled) return;
        if (status.isError) { void status.refetch(); return; }
        if (!user) {
            const from = { pathname: location.pathname, search: location.search, hash: location.hash };
            saveRedirect(`${from.pathname}${from.search}${from.hash}`);
            navigate('/login', { state: { from } }); return;
        }
        lock.current = true; like.mutate({ liked: !status.data.liked, session: currentSession().epoch, targetType: type, id: targetId });
    };
    const label = status.isError ? '좋아요를 다시 불러오기' : status.isPending ? '좋아요를 불러오는 중' : status.data?.liked ? '좋아요 취소' : '좋아요';
    return { enabled, status, busy: status.isPending || like.isPending, label, click };
}
