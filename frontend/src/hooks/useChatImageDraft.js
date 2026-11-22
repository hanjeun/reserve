import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { arrayMove } from '@dnd-kit/sortable';
import useAuthStore from '../store/useAuthStore';
import chatService from '../services/chatService';
import { chatAttachmentError, chatAttachmentKind, CHAT_DOCUMENT_MAX_BYTES, CHAT_PHOTO_MAX_BYTES } from '../utils/chatAttachments';

const EMPTY_FILES = [];

const emptyDraft = scope => ({ scope, files: EMPTY_FILES, selectionError: '' });

/* 초안 파일은 방과 로그인 세션의 메모리에서만 유지한다. */
export default function useChatImageDraft(threadKey) {
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const isLoggedIn = useAuthStore(state => state.isLoggedIn);
    const scope = useMemo(() => ({ sessionRevision, threadKey }), [sessionRevision, threadKey]);
    const [draft, setDraft] = useState(() => emptyDraft(scope));
    if (draft.scope !== scope) setDraft(emptyDraft(scope));
    const { data, isLoading, error, isFetching, refetch } = useQuery({
        queryKey: ['chat', 'image-config', sessionRevision],
        queryFn: () => chatService.getImageConfig(),
        enabled: isLoggedIn && threadKey != null,
        staleTime: 60_000,
        retry: false,
    });
    const enabled = Boolean(data?.enabled);
    const documentsEnabled = enabled && data?.documentsEnabled === true;
    const photoMax = data?.maxBytes ?? CHAT_PHOTO_MAX_BYTES;
    const documentMax = data?.maxDocumentBytes ?? CHAT_DOCUMENT_MAX_BYTES;
    const edit = update => {
        if (useAuthStore.getState().sessionRevision !== sessionRevision) return;
        setDraft(current => current.scope === scope ? update(current) : current);
    };
    return {
        files: draft.scope === scope ? draft.files : EMPTY_FILES,
        selectionError: draft.scope === scope ? draft.selectionError : '',
        scopeKey: `${sessionRevision}:${threadKey}`,
        enabled,
        documentsEnabled,
        loading: isLoading,
        error,
        refetching: isFetching,
        refetch,
        choose: selected => {
            if (!enabled || error || threadKey == null || !selected.length) return;
            edit(current => {
                const additions = [...new Set(selected)].filter(file => !current.files.includes(file));
                const selectionError = chatAttachmentError(additions, current.files.length, { documentsEnabled, photoMax, documentMax });
                if (selectionError) return { ...current, selectionError };
                return { scope, selectionError: '', files: [...current.files, ...additions] };
            });
        },
        remove: selected => edit(current => ({ scope, selectionError: '', files: current.files.filter(file => file !== selected) })),
        movePhoto: (source, target) => {
            if (!enabled || error || threadKey == null || source === target
                || chatAttachmentKind(source) !== 'photo' || chatAttachmentKind(target) !== 'photo') return;
            edit(current => {
                const from = current.files.indexOf(source);
                const to = current.files.indexOf(target);
                if (from < 0 || to < 0) return current;
                return { ...current, files: arrayMove(current.files, from, to) };
            });
        },
        clear: () => edit(() => emptyDraft(scope)),
        restore: selected => edit(current => current.files.length ? current : { scope, selectionError: '', files: selected }),
    };
}
