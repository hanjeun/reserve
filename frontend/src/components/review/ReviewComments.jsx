import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bone, Button, DataState } from '../common';
import AnimatedContent from '../common/AnimatedContent';
import LoadingStatus from '../common/LoadingStatus';
import Pagination from '../common/Pagination';
import ChatComposer from '../chat/ChatComposer';
import FeedCommentRow from '../feed/FeedCommentRow';
import reviewService from '../../services/reviewService';
import { handleApiError } from '../../utils/errorHandler';
import { useMessage } from '../../hooks';
import useReducedMotion from '../../hooks/useReducedMotion';
import { currentSession, isCurrentSession } from '../../api/sessionScope';

export default function ReviewComments({ id, queryKey, open, signedIn, onLogin, onInteractions }) {
    const [draft, setDraft] = useState('');
    const [page, setPage] = useState(0);
    const [posted, setPosted] = useState(null);
    const requestId = useRef(null);
    const submitLock = useRef(false);
    const list = useRef(null);
    const heading = useRef(null);
    const revealed = useRef(null);
    const reducedMotion = useReducedMotion();
    const client = useQueryClient();
    const { message, confirm } = useMessage();
    const { data, error, isError, isFetching, isPending, isPlaceholderData, refetch } = useQuery({
        queryKey: [...queryKey, page], queryFn: ({ signal }) => reviewService.listComments(id, page, signal),
        placeholderData: keepPreviousData, retry: false,
    });
    const ready = !isPending && !isPlaceholderData && !isError;
    const commentSelector = page === 0 && posted?.id != null ? '[data-list-item-id="comment:' + posted.id + '"]' : undefined;
    useEffect(() => {
        if (!open || page !== 0 || !ready || isFetching || !posted || revealed.current === posted) return undefined;
        const frame = requestAnimationFrame(() => {
            if (!isCurrentSession(posted.epoch)) return;
            const row = commentSelector && list.current?.querySelector(commentSelector);
            const target = row?.parentElement ?? heading.current;
            revealed.current = posted;
            target?.focus({ preventScroll: true });
            target?.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
        });
        return () => cancelAnimationFrame(frame);
    }, [commentSelector, isFetching, open, page, posted, ready, reducedMotion]);
    const onSuccess = async (saved, { epoch, commentId, payload }) => {
        if (!isCurrentSession(epoch)) return;
        if (commentId == null) {
            requestId.current = null;
            setDraft('');
            setPage(0);
        } else if (page > 0 && data && saved.commentCount <= page * data.size) setPage(page - 1);
        await onInteractions(id, { commentCount: saved.commentCount });
        if (!isCurrentSession(epoch)) return;
        await client.invalidateQueries({ queryKey });
        if (!isCurrentSession(epoch)) return;
        if (commentId == null) setPosted({ id: Number.isSafeInteger(saved.commentId) ? saved.commentId : null, key: payload.clientRequestId, epoch });
        message.success(commentId == null ? '댓글을 등록했어요.' : '댓글을 삭제했어요.');
    };
    const onError = (failure, { epoch }) => { if (isCurrentSession(epoch)) handleApiError(failure, message); };
    const add = useMutation({ mutationFn: ({ payload }) => reviewService.addComment(id, payload), onSuccess, onError,
        onSettled: () => { submitLock.current = false; } });
    const remove = useMutation({ mutationFn: ({ commentId }) => reviewService.deleteComment(id, commentId), onSuccess, onError });
    const submit = event => {
        event?.preventDefault();
        const content = draft.trim();
        if (!content || !open || add.isPending || submitLock.current || !signedIn) return;
        submitLock.current = true;
        requestId.current ??= crypto.randomUUID();
        add.mutate({ payload: { content, clientRequestId: requestId.current }, epoch: currentSession().epoch });
    };
    const removeComment = commentId => {
        const { epoch } = currentSession();
        confirm({ title: '댓글을 삭제할까요?', okText: '삭제하기', okButtonProps: { danger: true },
            onOk: () => { if (isCurrentSession(epoch)) return remove.mutateAsync({ commentId, epoch }); } });
    };
    return <section className="reserve-review-comments" aria-label="리뷰 댓글" data-discovery-swipe-ignore="true">
        <h3 ref={heading} tabIndex={-1} className="reserve-feed-comment-title">댓글</h3>
        {isPending && <LoadingStatus aria-label="댓글을 불러오는 중" aria-busy="true"><Bone width="85%" height={44} pageLoading={false} /></LoadingStatus>}
        {isError && <DataState state="error" subject="댓글" error={error} onRetry={refetch} retrying={isFetching} compact />}
        <div ref={list} aria-busy={isFetching}>
            <AnimatedContent motionKey={page + ':' + (posted?.key ?? '')} motionTarget={commentSelector} ready={ready && open && !isFetching}>
                {!isError && data?.content.length === 0 && <DataState state="empty" kind="comment" title="아직 댓글이 없어요."
                    style={{ minHeight: 0, padding: '16px 0' }} />}
                {!isError && data?.content.map(comment => <FeedCommentRow key={comment.id}
                    item={{ ...comment, state: 'PUBLISHED', author: {
                        nickname: comment.authorName, publicId: comment.authorPublicId, avatarUrl: comment.authorAvatarUrl,
                    } }}
                    actions={comment.mine ? [{ key: 'delete', icon: 'delete', label: '댓글 삭제', danger: true, onClick: () => removeComment(comment.id) }] : []} />)}
            </AnimatedContent>
        </div>
        {!isError && data?.totalPages > 1 && <div className="reserve-feed-pagination"><Pagination current={page + 1} total={data.totalElements}
            pageSize={data.size} showSizeChanger={false} onChange={next => setPage(next - 1)} /></div>}
        {signedIn ? <form className="reserve-feed-comment-composer" onSubmit={submit}>
            <ChatComposer value={draft} onChange={value => { setDraft(value); requestId.current = null; }} onSend={submit}
                inputLabel="리뷰 댓글 작성" placeholder="댓글을 남겨보세요." maxLength={500} sendText="댓글 남기기"
                sending={add.isPending} disabled={!open || add.isPending} />
        </form> : <Button variant="secondary" size="sm" onClick={onLogin}>로그인하고 댓글 쓰기</Button>}
    </section>;
}
ReviewComments.propTypes = {
    id: PropTypes.number.isRequired, queryKey: PropTypes.array.isRequired, open: PropTypes.bool.isRequired, signedIn: PropTypes.bool,
    onLogin: PropTypes.func.isRequired, onInteractions: PropTypes.func.isRequired,
};
