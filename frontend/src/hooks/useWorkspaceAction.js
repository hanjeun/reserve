import { useCallback, useContext } from 'react';
import { WorkspaceNavigationContext } from '../components/layout/workspaceNavigation';

/** URL 필터·하위 메뉴처럼 컴포넌트를 바꾸는 사용자 동작도 같은 입력 보호를 사용한다. */
export default function useWorkspaceAction() {
    const guard = useContext(WorkspaceNavigationContext);
    return useCallback((action, options) => guard ? guard.requestLeave(action, undefined, options) : Promise.resolve(action()).then(() => true), [guard]);
}
