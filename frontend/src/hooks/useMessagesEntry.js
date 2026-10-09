import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import useMessengerStore from '../store/useMessengerStore';
import { breakpoints } from '../styles/tokens';

// 일반 링크는 로그인·약관 관문과 새 탭 동작을 유지한다. PC에서 이미 이용 가능한
// 메시지는 현재 페이지의 패널로 열어 /messages → 이전 페이지 왕복을 만들지 않는다.
export default function useMessagesEntry() {
    const navigate = useNavigate();
    const canOpenPanel = useAuthStore(state => state.isLoggedIn && !state.isLoggingOut && state.user?.termsAgreed !== false);
    const openPanel = useMessengerStore(state => state.openPanel);
    const togglePanel = useMessengerStore(state => state.togglePanel);
    const showHome = useMessengerStore(state => state.showHome);

    const openMessages = useCallback(({ toggle = false } = {}) => {
        if (!canOpenPanel || window.innerWidth < breakpoints.tablet) {
            showHome();
            navigate('/messages', { state: { messengerEntry: true } });
        } else if (toggle) togglePanel();
        else openPanel();
    }, [canOpenPanel, navigate, openPanel, showHome, togglePanel]);

    const onMessagesLinkClick = useCallback(event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
            || (event.currentTarget.target && event.currentTarget.target !== '_self')) return;
        if (!canOpenPanel || window.innerWidth < breakpoints.tablet) return;
        event.preventDefault();
        openPanel();
    }, [canOpenPanel, openPanel]);

    return { openMessages, onMessagesLinkClick };
}
