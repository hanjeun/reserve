import { useCallback, useContext, useId, useLayoutEffect, useRef } from 'react';
import { WorkspaceNavigationContext } from '../components/layout/workspaceNavigation';

/** 실제 미저장·처리 중 상태만 공통 이동 관문에 등록한다. */
export default function useWorkspaceDraftGuard({ dirty = false, busy = false, allowUnload = false, onDiscard }) {
    const guard = useContext(WorkspaceNavigationContext);
    const id = useId();
    const state = useRef({ dirty: false, busy: false, onDiscard });
    useLayoutEffect(() => {
        state.current = { get dirty() { return typeof dirty === 'function' ? dirty() : dirty; },
            get busy() { return typeof busy === 'function' ? busy() : busy; },
            get allowUnload() { return typeof allowUnload === 'function' ? allowUnload() : allowUnload; }, onDiscard };
    }, [dirty, busy, allowUnload, onDiscard]);
    useLayoutEffect(() => guard?.register(id, () => state.current), [guard, id]);
    return useCallback((action, options) => guard ? guard.requestLeave(action, () => state.current, options) : Promise.resolve(action()).then(() => true), [guard]);
}
