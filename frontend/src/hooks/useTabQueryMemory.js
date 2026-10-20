import { useCallback, useContext, useLayoutEffect, useRef } from 'react';
import useAuthStore from '../store/useAuthStore';
import { WorkspaceActivityContext } from '../components/layout/workspaceActivity';

/** 탭별 목록 조건은 메모리에만 보관하고 계정·로그인 세션이 바뀌면 버린다. */
export default function useTabQueryMemory(scope, tab, search, keysByTab) {
    const revision = useAuthStore(state => state.sessionRevision);
    const member = useAuthStore(state => state.user?.id ?? state.user?.email ?? 'anonymous');
    const role = useAuthStore(state => state.user?.role ?? 'anonymous');
    const active = useContext(WorkspaceActivityContext);
    const owner = `${scope}:${revision}:${member}:${role}`;
    const memory = useRef({ owner, tabs: new Map() });
    if (memory.current.owner !== owner) memory.current = { owner, tabs: new Map() };
    const query = String(search);

    useLayoutEffect(() => {
        if (!active || memory.current.owner !== owner) return;
        const current = new URLSearchParams(query);
        const stored = new URLSearchParams();
        (keysByTab[tab] || []).forEach(key => {
            if (current.has(key)) stored.set(key, current.get(key));
        });
        memory.current.tabs.set(tab, stored.toString());
    }, [active, keysByTab, owner, query, tab]);

    return useCallback(nextTab => memory.current.owner === owner
        ? memory.current.tabs.get(nextTab) : undefined, [owner]);
}
