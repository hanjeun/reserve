import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../store/useAuthStore';
import chatService from '../services/chatService';

const EMPTY_FILES = [];

/** 파일은 영속 초안에 넣지 않는다. 방/로그인 세대가 바뀌면 즉시 숨기고 실패 복원도 격리한다. */
export default function useChatImageDraft(threadKey) {
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const isLoggedIn = useAuthStore(state => state.isLoggedIn);
    const scope = `${sessionRevision}:${threadKey}`;
    const [draft, setDraft] = useState(null);
    const { data, isLoading } = useQuery({
        queryKey: ['chat', 'image-config', sessionRevision],
        queryFn: () => chatService.getImageConfig(),
        enabled: isLoggedIn && threadKey != null,
        staleTime: 60_000,
        retry: false,
    });
    const files = draft?.scope === scope ? draft.files : EMPTY_FILES;
    return {
        files,
        enabled: Boolean(data?.enabled),
        loading: isLoading,
        choose: selected => setDraft(current => {
            const next = [...(current?.scope === scope ? current.files : EMPTY_FILES), ...selected];
            return next.length <= 3 ? { scope, files: next } : current;
        }),
        remove: selected => setDraft(current => current?.scope === scope
            ? { scope, files: current.files.filter(file => file !== selected) } : current),
        clear: () => setDraft({ scope, files: EMPTY_FILES }),
        restore: selected => {
            if (useAuthStore.getState().sessionRevision !== sessionRevision) return;
            setDraft(current => current?.scope !== scope || current.files.length ? current : { scope, files: selected });
        },
    };
}
