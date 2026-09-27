import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../store/useAuthStore';
import chatService from '../services/chatService';

/** 파일은 영속 초안에 넣지 않는다. 방/로그인 세대가 바뀌면 즉시 숨기고 실패 복원도 격리한다. */
export default function useChatImageDraft(threadKey) {
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const isLoggedIn = useAuthStore(state => state.isLoggedIn);
    const scope = `${sessionRevision}:${threadKey}`;
    const [draft, setDraft] = useState(null);
    const { data } = useQuery({
        queryKey: ['chat', 'image-config', sessionRevision],
        queryFn: () => chatService.getImageConfig(),
        enabled: isLoggedIn && threadKey != null,
        staleTime: 60_000,
        retry: false,
    });
    const file = draft?.scope === scope ? draft.file : null;
    return {
        file,
        enabled: Boolean(data?.enabled),
        choose: selected => setDraft({ scope, file: selected }),
        clear: () => setDraft({ scope, file: null }),
        restore: selected => {
            if (useAuthStore.getState().sessionRevision !== sessionRevision) return;
            setDraft(current => current?.scope !== scope || current.file ? current : { scope, file: selected });
        },
    };
}
