import useAuthStore from '../store/useAuthStore';
import { currentSession, isCurrentSession } from '../api/sessionScope';

// Keep one composer in this tab's memory while its author visits account settings.
// Files stay in memory; the comment component owns and revokes its preview URLs.
let draft = null;

export const rememberFeedCommentForProfile = ({ postId, content, images, target, nonce }) => {
    const memberId = useAuthStore.getState().user?.id;
    if (!memberId || !Number.isSafeInteger(postId) || postId <= 0) return null;
    draft = {
        key: crypto.randomUUID(), memberId, session: currentSession().epoch, postId, content, target, nonce,
        images: images.map(({ url, ...image }) => image.file ? image : { ...image, url }),
    };
    return draft.key;
};

export const readFeedCommentForProfile = (postId) => {
    if (!draft || !isCurrentSession(draft.session) || draft.memberId !== useAuthStore.getState().user?.id) return null;
    return postId == null || draft.postId === postId ? draft : null;
};

export const forgetFeedCommentForProfile = key => { if (draft?.key === key) draft = null; };

const unsubscribe = useAuthStore.subscribe((current, previous) => {
    if (current.user?.id !== previous.user?.id || current.user?.role !== previous.user?.role
        || current.sessionRevision !== previous.sessionRevision) draft = null;
});
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); draft = null; });
