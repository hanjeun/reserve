import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceSession, currentSession } from '../api/sessionScope';

const auth = vi.hoisted(() => {
    let state = { user: null, sessionRevision: 0 };
    const listeners = new Set();
    return {
        store: { getState: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
        change: next => { const previous = state; state = next; listeners.forEach(listener => listener(next, previous)); },
    };
});
vi.mock('../store/useAuthStore', () => ({ default: auth.store }));

import { forgetFeedCommentForProfile, readFeedCommentForProfile, rememberFeedCommentForProfile } from './feedCommentProfileNavigation';

const composer = () => ({ postId: 12, content: '작성 중인 댓글', images: [], target: { parent: { id: 7 } }, nonce: 'request-1' });
const signIn = (id = 1) => { advanceSession(); auth.change({ user: { id, role: 'USER' }, sessionRevision: currentSession().epoch }); };

beforeEach(() => signIn());

describe('comment continuity across public profile settings', () => {
    it('keeps files and the reply target without retaining component-owned preview URLs', () => {
        const file = new File(['photo'], 'photo.webp', { type: 'image/webp' });
        const draft = composer(); draft.images = [{ uid: 'photo', file, url: 'blob:old-preview', id: 23 }];
        rememberFeedCommentForProfile(draft);
        const restored = readFeedCommentForProfile(12);
        expect(restored.content).toBe(draft.content);
        expect(restored.target).toEqual(draft.target);
        expect(restored.images[0]).toMatchObject({ file, uid: 'photo', id: 23 });
        expect(restored.images[0].url).toBeUndefined();
        expect(readFeedCommentForProfile(13)).toBeNull();
    });

    it('discards the draft across logout, another account and signing in again', () => {
        rememberFeedCommentForProfile(composer());
        advanceSession(); auth.change({ user: null, sessionRevision: currentSession().epoch });
        expect(readFeedCommentForProfile()).toBeNull();
        expect(rememberFeedCommentForProfile(composer())).toBeNull();
        signIn(2); expect(readFeedCommentForProfile()).toBeNull();
        signIn(1); expect(readFeedCommentForProfile()).toBeNull();
    });

    it('rejects the previous session even when the member ID is unchanged', () => {
        rememberFeedCommentForProfile(composer());
        advanceSession();
        expect(readFeedCommentForProfile()).toBeNull();
        signIn(1); expect(readFeedCommentForProfile()).toBeNull();
    });

    it('a late return from an older composer cannot consume a newer one', () => {
        const oldKey = rememberFeedCommentForProfile(composer());
        const newKey = rememberFeedCommentForProfile({ ...composer(), postId: 13 });
        forgetFeedCommentForProfile(oldKey);
        expect(readFeedCommentForProfile(13)?.key).toBe(newKey);
        forgetFeedCommentForProfile(newKey);
        expect(readFeedCommentForProfile()).toBeNull();
    });
});
