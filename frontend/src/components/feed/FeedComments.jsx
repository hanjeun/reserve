import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Bone, Button, DataState } from '../common';
import IconTool from '../common/IconTool';
import { CloseOutlined, CommentOutlined } from '../common/icons';
import FeedItemMenu from './FeedItemMenu';
import ChatComposer from '../chat/ChatComposer';
import ChatImagePicker from '../chat/ChatImagePicker';
import CommentAttachments from './CommentAttachments';
import FeedMediaStrip from './FeedMediaStrip';
import ContentLikeButton from './ContentLikeButton';
import { interactionKeys, invalidateInteractions, useFeedInteractions } from '../../hooks/feedInteractionQueries';
import { useFeedProfile } from '../../hooks/feedQueries';
import service from '../../services/feedInteractionService';
import feedService from '../../services/feedService';
import useAuthStore from '../../store/useAuthStore';
import useMessage from '../../hooks/useMessage';
import { authorPath, feedDate, feedMediaUrl, feedRelativeDate, feedTotal } from '../../utils/feed';
import { prepareFeedPhoto, reorderFeedPhotos } from '../../utils/feedPhoto';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';
import { saveRedirect } from '../../utils/redirect';
import { forgetFeedCommentForProfile, readFeedCommentForProfile, rememberFeedCommentForProfile } from '../../utils/feedCommentProfileNavigation';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import { httpStatusOf, isMissingRequestError } from '../../utils/listErrorMessage';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';

const FeedReportModal = lazy(() => import('./FeedReportModal'));
const nextPage = (last, pages) => pages.reduce((count, page) => count + (page.content?.length || 0), 0) < feedTotal(last) ? pages.length : undefined;
const requestPage = { size: 20 };

function CommentReplies({ parent, focusedReply, onReply, onEdit, onDelete, onReport }) {
    const [expanded, setExpanded] = useState(Boolean(focusedReply));
    const [previousFocusedId, setPreviousFocusedId] = useState(focusedReply?.id);
    if (previousFocusedId !== focusedReply?.id) {
        setPreviousFocusedId(focusedReply?.id);
        if (focusedReply?.id) setExpanded(true);
    }
    const listRef = useRef(null);
    const reduced = useReducedMotion();
    const { shouldRender, isClosing } = useExitAnimation(expanded, reduced ? 0 : 200);
    const replies = useInfiniteQuery({ queryKey: interactionKeys.replies(parent.id), initialPageParam: 0,
        queryFn: ({ pageParam, signal }) => service.replies(parent.id, { ...requestPage, page: pageParam }, signal), enabled: expanded, getNextPageParam: nextPage });
    const unavailable = [401, 403].includes(httpStatusOf(replies.error)) || isMissingRequestError(replies.error);
    const items = [...new Map((replies.data?.pages.flatMap(page => page.content || []) || []).map(item => [item.id, item])).values()];
    useListRefreshAnchor(listRef, `replies:${parent.id}`, replies.isFetching && !replies.isFetchingNextPage, unavailable ? null : replies.data);
    if (!parent.replyCount && !focusedReply) return null;
    return <div className="reserve-feed-replies">
        <Button variant="ghost-sm" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
            {expanded ? '답글 접기' : `답글 ${parent.replyCount}개 보기`}</Button>
        {shouldRender && <div className={`reserve-feed-replies-body${isClosing ? ' is-closing' : ''}`} inert={isClosing ? true : undefined} aria-hidden={isClosing || undefined}><div ref={listRef} className="reserve-feed-replies-inner" aria-busy={replies.isFetching}>
            {replies.isError && replies.data && !unavailable && <DataState compact state="error" title="답글을 갱신하지 못했어요." error={replies.error} onRetry={replies.refetch} retrying={replies.isFetching} />}
            {replies.isPending && !replies.data ? <Bone width="85%" height={42} /> : replies.isError && (!replies.data || unavailable) ? <DataState compact state="error" title="답글을 불러오지 못했어요." error={replies.error} onRetry={replies.refetch} retrying={replies.isFetching} />
                : items.filter(item => item.id !== focusedReply?.id).map(item => <CommentItem key={item.id} item={item} onReply={onReply} onEdit={onEdit} onDelete={onDelete} onReport={onReport} />)}
            {!unavailable && focusedReply && <CommentItem item={focusedReply} onReply={onReply} onEdit={onEdit} onDelete={onDelete} onReport={onReport} />}
            {!unavailable && replies.hasNextPage && <Button size="sm" variant="ghost-sm" loading={replies.isFetchingNextPage} onClick={() => replies.fetchNextPage({ cancelRefetch: false })}>답글 더 보기</Button>}
        </div></div>}
    </div>;
}
CommentReplies.propTypes = { parent: PropTypes.object.isRequired, focusedReply: PropTypes.object, onReply: PropTypes.func, onEdit: PropTypes.func, onDelete: PropTypes.func, onReport: PropTypes.func };

function CommentItem({ item, focusedReply, onReply, onEdit, onDelete, onReport }) {
    const removed = item.state !== 'PUBLISHED';
    const actions = item.mine ? [
        { key: 'edit', label: '댓글 수정', icon: 'edit', onClick: () => onEdit(item) },
        { key: 'delete', label: '댓글 삭제', icon: 'delete', danger: true, onClick: () => onDelete(item) },
    ] : [{ key: 'report', label: '댓글 신고', icon: 'report', onClick: () => onReport(item) }];
    return <div id={`comment-${item.id}`} tabIndex={-1} className="reserve-feed-comment-block"><article className="reserve-feed-comment is-thread-comment" data-list-item-id={`comment:${item.id}`} aria-label={removed ? '삭제된 댓글' : `${item.author?.nickname}의 댓글`}>
        <div className="reserve-feed-post-avatar">{!removed && <Link to={authorPath(item.author.publicId)} aria-label={`${item.author.nickname}의 공개 프로필`}>
            <Avatar src={item.author.avatarUrl} size={32} referrerPolicy="no-referrer" /></Link>}</div>
        <div className="reserve-feed-comment-content">
        {!removed && <header className="reserve-feed-post-header"><div className="reserve-feed-post-byline">
            <Link className="reserve-feed-post-name" to={authorPath(item.author.publicId)}><strong>{item.author.nickname}</strong></Link>
            <time dateTime={item.createdAt} title={feedDate(item.createdAt)}>{feedRelativeDate(item.createdAt)}</time>
        </div><FeedItemMenu label="댓글 메뉴" actions={actions} /></header>}
        <p className={removed ? 'reserve-feed-note' : 'reserve-feed-post-text'}>{removed ? '삭제되거나 숨겨진 댓글이에요.' : item.content}</p>
        {!removed && <FeedMediaStrip label="댓글" images={(item.images || []).map(image => ({ ...image, src: feedMediaUrl(image.url) })).filter(image => image.src)} />}
        {!removed && <div className="reserve-feed-comment-actions">
            <ContentLikeButton type="COMMENT" targetId={item.id} initialStatus={{ liked: Boolean(item.liked), likeCount: item.likeCount || 0, commentCount: 0 }} />
            {!item.parentId && <IconTool label="답글" icon={<CommentOutlined aria-hidden="true" />} onClick={() => onReply(item)} />}
        </div>}
        </div>
        </article>
        {!item.parentId && <CommentReplies parent={item} focusedReply={focusedReply} onReply={onReply} onEdit={onEdit} onDelete={onDelete} onReport={onReport} />}
    </div>;
}
CommentItem.propTypes = { item: PropTypes.object.isRequired, focusedReply: PropTypes.object, onReply: PropTypes.func, onEdit: PropTypes.func, onDelete: PropTypes.func, onReport: PropTypes.func };

export default function FeedComments({ postId }) {
    const memberId = useAuthStore(state => state.user?.id);
    const role = useAuthStore(state => state.user?.role);
    const revision = useAuthStore(state => state.sessionRevision);
    return <FeedCommentsSession key={`${postId}:${memberId}:${role}:${revision}`} postId={postId} />;
}

function FeedCommentsSession({ postId }) {
    const user = useAuthStore(state => state.user);
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const [returningDraft] = useState(() => readFeedCommentForProfile(postId));
    const config = useFeedInteractions();
    const enabled = config.data?.enabled === true;
    const profile = useFeedProfile(enabled && Boolean(user));
    const client = useQueryClient();
    const { message, confirm } = useMessage();
    const navigate = useNavigate();
    const location = useLocation();
    const [content, setContent] = useState(returningDraft?.content || '');
    const [images, setImages] = useState([]);
    const [preparing, setPreparing] = useState(false);
    const [target, setTarget] = useState(returningDraft?.target || null);
    const [error, setError] = useState('');
    const [reportId, setReportId] = useState(null);
    const [reportMounted, setReportMounted] = useState(false);
    const nonce = useRef(returningDraft?.nonce || null);
    const input = useRef(null);
    const listRef = useRef(null);
    const lock = useRef(false);
    const confirmOpen = useRef(false);
    const generation = useRef(0);
    const objectUrls = useRef(new Set());
    const scrolledAnchor = useRef(null);
    const maxImages = config.data?.maxImages || 6;
    const maxBytes = config.data?.maxImageBytes || 7 * 1024 * 1024;
    const photosEnabled = config.data?.commentPhotosEnabled === true;
    const revokePhotos = () => { objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current.clear(); };
    useEffect(() => () => { generation.current += 1; objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current.clear(); }, []);
    useEffect(() => {
        if (!returningDraft || !isCurrentSession(returningDraft.session)) return;
        // The keyed session clears local state; recreate file previews only after its DOM has mounted.
        const frame = requestAnimationFrame(() => {
            if (!isCurrentSession(returningDraft.session)) return;
            setImages(returningDraft.images.map(image => {
                if (!image.file) return image;
                const url = URL.createObjectURL(image.file); objectUrls.current.add(url); return { ...image, url };
            }));
            forgetFeedCommentForProfile(returningDraft.key);
            input.current?.focus({ preventScroll: true });
            document.getElementById('feed-comment-composer')?.scrollIntoView({ block: 'nearest' });
        });
        return () => cancelAnimationFrame(frame);
    }, [returningDraft]);
    const focusedId = /^#comment-[1-9]\d*$/.test(location.hash) ? Number(location.hash.slice(9)) : null;
    const focused = useQuery({ queryKey: interactionKeys.comment(focusedId), queryFn: ({ signal }) => service.comment(focusedId, signal),
        enabled: enabled && Number.isSafeInteger(focusedId) && focusedId > 0, retry: false });
    const focusedUnavailable = [401, 403].includes(httpStatusOf(focused.error)) || isMissingRequestError(focused.error);
    const focusedComment = !focusedUnavailable && focused.data?.postId === postId ? focused.data : null;
    const focusedParent = useQuery({ queryKey: interactionKeys.comment(focusedComment?.parentId),
        queryFn: ({ signal }) => service.comment(focusedComment.parentId, signal), enabled: enabled && Boolean(focusedComment?.parentId), retry: false });
    const focusedParentUnavailable = [401, 403].includes(httpStatusOf(focusedParent.error)) || isMissingRequestError(focusedParent.error);
    const focusedRoot = focusedComment?.parentId ? (focusedParentUnavailable ? null : focusedParent.data) : focusedComment;
    useEffect(() => {
        if (!focusedComment || !focusedRoot) return;
        const key = `${postId}:${focusedId}:${location.key}`;
        if (scrolledAnchor.current === key) return;
        let frame;
        const scroll = attempts => {
            const node = document.getElementById(`comment-${focusedComment.id}`);
            if (!node) { if (attempts > 0) frame = requestAnimationFrame(() => scroll(attempts - 1)); return; }
            scrolledAnchor.current = key;
            node?.focus({ preventScroll: true }); node?.scrollIntoView({ block: 'center', behavior: 'auto' });
        };
        frame = requestAnimationFrame(() => scroll(4));
        return () => cancelAnimationFrame(frame);
    }, [focusedComment, focusedRoot, focusedId, postId, location.key]);
    const comments = useInfiniteQuery({ queryKey: interactionKeys.comments(postId), initialPageParam: 0,
        queryFn: ({ pageParam, signal }) => service.comments(postId, { ...requestPage, page: pageParam }, signal), enabled, getNextPageParam: nextPage });
    const unavailable = [config, comments].some(query => [401, 403].includes(httpStatusOf(query.error))) || isMissingRequestError(comments.error);
    const failure = config.isError && [401, 403].includes(httpStatusOf(config.error)) ? config : comments;
    const profileUnavailable = [401, 403].includes(httpStatusOf(profile.error));
    const items = [...new Map((comments.data?.pages.flatMap(page => page.content || []) || []).map(item => [item.id, item])).values()];
    const blockingError = isBlockingListReadError(comments.error, items);
    const backgroundFailure = [config, ...(!blockingError ? [comments] : [])].find(query => query.isError && query.data !== undefined);
    useListRefreshAnchor(listRef, `comments:${postId}:${sessionRevision}`, comments.isFetching && !comments.isFetchingNextPage, unavailable ? null : comments.data);
    const save = useMutation({ mutationFn: async variables => {
        assertCurrentSession(variables.session);
        const mediaIds = [];
        for (const image of variables.images) {
            if (!image.id) {
                const uploaded = await feedService.upload(image.file);
                assertCurrentSession(variables.session);
                if (generation.current !== variables.generation) throw new Error('작성 화면이 바뀌었어요. 댓글을 다시 작성해주세요.');
                image.id = uploaded.id; // Retain completed uploads when a later request fails.
                setImages(current => current.map(item => item.uid === image.uid ? { ...item, id: uploaded.id } : item));
            }
            mediaIds.push(image.id);
        }
        variables.mediaIds = mediaIds;
        const saved = variables.edit ? await service.editComment(variables.edit.id, { content: variables.content, mediaIds, revision: variables.edit.revision })
            : await service.createComment(variables.postId, { content: variables.content, mediaIds, parentId: variables.parentId, clientRequestId: variables.nonce });
        assertCurrentSession(variables.session); return saved;
    }, onSuccess: async (saved, variables) => {
        if (!isCurrentSession(variables.session) || generation.current !== variables.generation) return;
        if (saved.content !== variables.content || saved.state !== 'PUBLISHED' || (saved.images || []).map(image => image.id).join(',') !== variables.mediaIds.join(',')) {
            if (saved.state === 'PUBLISHED') setTarget({ edit: saved });
            nonce.current = null; message.warning('이전 댓글 저장은 완료됐어요. 작성 중인 내용은 남겨뒀어요. 다시 확인하고 저장해주세요.');
        } else { revokePhotos(); setContent(''); setImages([]); setTarget(null); nonce.current = null; setError(''); generation.current += 1; }
        await invalidateInteractions(client);
    }, onError: (failure, variables) => { if (!failure.isStaleSession && isCurrentSession(variables.session) && generation.current === variables.generation) setError(failure.message); }, onSettled: () => { lock.current = false; } });
    const remove = useMutation({ mutationFn: async ({ id, session }) => {
        assertCurrentSession(session); await service.deleteComment(id); assertCurrentSession(session);
    },
        onSuccess: (_, variables) => { if (isCurrentSession(variables.session)) { void invalidateInteractions(client); message.success('댓글을 삭제했어요.'); } },
        onError: failure => { if (!failure.isStaleSession) message.error(failure.message); } });
    const login = () => {
        const path = `${location.pathname}${location.search}#comments`; saveRedirect(path);
        navigate('/login', { state: { from: { pathname: location.pathname, search: location.search, hash: '#comments' } } });
    };
    const focusComposer = () => requestAnimationFrame(() => { input.current?.focus({ preventScroll: true }); document.getElementById('feed-comment-composer')?.scrollIntoView({ block: 'nearest' }); });
    const choose = next => {
        if (save.isPending || lock.current || preparing) return;
        if (!user) { login(); return; }
        const apply = () => { generation.current += 1; revokePhotos(); setTarget(next); setContent(next?.edit?.content || '');
            setImages((next?.edit?.images || []).map(image => ({ ...image, uid: `saved-${image.id}` }))); nonce.current = null; setError(''); focusComposer(); };
        if (confirmOpen.current) return;
        if (content.trim() || images.length) {
            confirmOpen.current = true;
            confirm({ title: '작성 대상을 바꿀까요?', content: '아직 저장하지 않은 댓글 내용은 사라져요.',
                onOk: () => { confirmOpen.current = false; apply(); }, onCancel: () => { confirmOpen.current = false; } });
        } else apply();
    };
    const selectPhotos = async files => {
        if (preparing || lock.current || !photosEnabled) return;
        if (!user) { login(); return; }
        if (images.length + files.length > maxImages) { setError(`사진은 ${maxImages}장까지 등록할 수 있어요.`); return; }
        const stamp = generation.current; const session = currentSession().epoch; const additions = [];
        setPreparing(true); setError('');
        try {
            for (const original of files) {
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(original.type) || !original.size || original.size > maxBytes) throw new Error('JPG·PNG·WebP 사진을 한 장당 7MB 이하로 선택해주세요.');
                const file = await prepareFeedPhoto(original, maxBytes);
                assertCurrentSession(session);
                if (generation.current !== stamp) return;
                const url = URL.createObjectURL(file); objectUrls.current.add(url);
                additions.push({ uid: crypto.randomUUID(), file, url });
            }
            setImages(current => [...current, ...additions]);
        } catch (failure) {
            additions.forEach(image => { URL.revokeObjectURL(image.url); objectUrls.current.delete(image.url); });
            if (!failure.isStaleSession && generation.current === stamp) setError(failure.message);
        } finally { setPreparing(false); }
    };
    const submit = event => {
        event?.preventDefault();
        if (lock.current || save.isPending || preparing || unavailable || profileUnavailable || user && profile.isPending && !profile.data) return;
        if (!user) { login(); return; }
        if (profile.isError && profile.data === undefined) { setError('공개 프로필을 다시 불러와주세요.'); return; }
        if (!profile.data) {
            rememberFeedCommentForProfile({ postId, content, images, target, nonce: nonce.current });
            navigate('/my-page?tab=public-profile'); return;
        }
        const text = content.trim();
        if ((!text && !images.length) || text.length > 1000) { setError('댓글 내용이나 사진을 추가해주세요. 글은 1,000자까지 쓸 수 있어요.'); return; }
        if (!nonce.current) nonce.current = crypto.randomUUID();
        lock.current = true; setError('');
        save.mutate({ edit: target?.edit, parentId: target?.parent?.id || null, content: text, images: images.map(image => ({ ...image })), nonce: nonce.current,
            postId, generation: generation.current, session: currentSession().epoch });
    };
    const actions = { onReply: item => choose({ parent: item }), onEdit: item => choose({ edit: item }), onDelete: item => {
        if (remove.isPending || confirmOpen.current) return;
        const session = currentSession().epoch;
        confirmOpen.current = true;
        confirm({ title: '댓글을 삭제할까요?', content: '댓글과 첨부 사진이 공개 화면에서 삭제돼요. 삭제한 댓글은 복원할 수 없어요.',
            onOk: () => { confirmOpen.current = false; remove.mutate({ id: item.id, session }); }, onCancel: () => { confirmOpen.current = false; } });
    }, onReport: item => { if (!user) login(); else { setReportMounted(true); setReportId(item.id); } } };
    if (!enabled) return null;
    return <section ref={listRef} id="comments" className="reserve-feed-comments" aria-labelledby="feed-comments-title" data-discovery-swipe-ignore="true" aria-busy={comments.isFetching}>
        <h2 id="feed-comments-title">댓글</h2>
        {focusedId && (focused.isError && (!focused.data || focusedUnavailable) || focusedParentUnavailable) && <p className="reserve-feed-note">해당 댓글이 삭제되었거나 현재 볼 수 없어요.</p>}
        {!unavailable && focusedRoot?.postId === postId && <CommentItem key={`focused-${focusedRoot.id}`} item={focusedRoot} focusedReply={focusedComment?.parentId ? focusedComment : undefined} {...actions} />}
        {!unavailable && backgroundFailure && <DataState compact state="error" title="댓글을 갱신하지 못했어요." error={backgroundFailure.error} onRetry={backgroundFailure.refetch} retrying={backgroundFailure.isFetching} />}
        {unavailable ? <DataState state="error" compact title="댓글을 불러오지 못했어요." error={failure.error} onRetry={failure.refetch} retrying={failure.isFetching} />
            : comments.isPending && !comments.data ? <Bone width="85%" height={44} /> : blockingError ? <DataState state="error" compact title="댓글을 불러오지 못했어요." error={comments.error} onRetry={comments.refetch} retrying={comments.isFetching} />
            : comments.data && !items.length && focusedRoot?.postId !== postId
                ? <DataState state="empty" kind="comment" title="아직 댓글이 없어요." style={{ minHeight: 0, padding: '16px 0' }} />
            : items.filter(item => item.id !== focusedRoot?.id).map(item => <CommentItem key={item.id} item={item} {...actions} />)}
        {!unavailable && comments.hasNextPage && <Button variant="ghost-sm" size="sm" loading={comments.isFetchingNextPage} onClick={() => comments.fetchNextPage({ cancelRefetch: false })}>댓글 더 보기</Button>}
        <form id="feed-comment-composer" onSubmit={submit} className="reserve-feed-comment-composer">
            {target && <div className="reserve-feed-comment-target"><span>{target.edit ? '댓글 수정' : `${target.parent.author.nickname}님에게 답글`}</span>
                <IconTool label={target.edit ? '댓글 수정 취소' : '답글 작성 취소'} icon={<CloseOutlined aria-hidden="true" />} onClick={() => choose(null)} disabled={save.isPending} /></div>}
            <ChatComposer value={content} onChange={setContent} onSend={submit} inputRef={input} maxLength={1000}
                inputLabel={target?.edit ? '댓글 수정 내용' : target?.parent ? '답글 내용' : '댓글 내용'} placeholder="댓글을 남겨보세요."
                sending={save.isPending || preparing} disabled={save.isPending || preparing || unavailable || profileUnavailable || Boolean(user) && profile.isPending && !profile.data}
                hasAttachments={images.length > 0}
                sendText={!user ? '로그인하고 댓글 쓰기' : profile.isSuccess && !profile.data ? '닉네임 설정하고 댓글 쓰기' : target?.edit ? '수정 저장' : target?.parent ? '답글 남기기' : '댓글 남기기'}
                attachmentControl={<ChatImagePicker enabled={photosEnabled} disabled={save.isPending || preparing || images.length >= maxImages}
                    accept="image/jpeg,image/png,image/webp" maxBytes={maxBytes} onChange={file => file && selectPhotos([file])} onFilesChange={selectPhotos} />}
                attachments={<CommentAttachments images={images} busy={save.isPending || preparing}
                    onReorder={order => setImages(current => reorderFeedPhotos(current, order))}
                    onRemove={uid => setImages(current => current.filter(image => { if (image.uid !== uid) return true;
                        if (objectUrls.current.has(image.url)) { URL.revokeObjectURL(image.url); objectUrls.current.delete(image.url); } return false; }))} />} />
            {error && <p className="reserve-field-error" role="alert">{error}</p>}
            {profile.isError && <Button variant="ghost-sm" onClick={() => profile.refetch()}>공개 프로필 다시 불러오기</Button>}
        </form>
        <Suspense fallback={null}>{reportMounted && <FeedReportModal commentId={reportId} onClose={() => setReportId(null)} />}</Suspense>
    </section>;
}
FeedComments.propTypes = { postId: PropTypes.number.isRequired };
