import { useCallback, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorkspaceNavigationContext } from '../components/layout/workspaceNavigation';

export default function useWorkspaceNavigate() {
    const navigate = useNavigate();
    const guard = useContext(WorkspaceNavigationContext);
    return useCallback((to, options) => {
        // 숫자 이동은 POP에서 확인한다. 버튼과 POP 양쪽에서 묻지 않는다.
        if (typeof to === 'number' || !guard) { navigate(to, options); return Promise.resolve(true); }
        return guard.requestLeave(() => navigate(to, options));
    }, [guard, navigate]);
}
