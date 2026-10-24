import { useCallback } from 'react';
import useWorkspaceNavigate from './useWorkspaceNavigate';

/**
 * 앱 히스토리가 있으면 뒤로 이동하고 직접 진입했거나 위치를 모르면 fallback으로 이동한다.
 * fallback은 replace로 처리해 같은 상세 화면으로 되돌아오는 고리를 만들지 않는다.
 * @param {string} fallback 앱 안에서 되돌아갈 화면이 없을 때의 경로
 */
const useGoBack = (fallback = '/') => {
    const navigate = useWorkspaceNavigate();

    return useCallback(() => {
        const idx = window.history.state?.idx;
        if (typeof idx === 'number' && idx > 0) {
            navigate(-1);
            return;
        }
        // 히스토리가 없는 직접 진입에서는 fallback도 "뒤로"의 의미를 유지한다.
        navigate(fallback, { replace: true, state: { reserveRouteMotion: 'from-left' } });
    }, [navigate, fallback]);
};

export default useGoBack;
