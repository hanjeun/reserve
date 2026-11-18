import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { consumeLoginFeedback } from '../../utils/loginFeedback';
import useMessage from '../../hooks/useMessage';

export default function LoginFeedback() {
    const { message } = useMessage();
    const { pathname } = useLocation();
    const user = useAuthStore(state => state.user);
    useEffect(() => {
        // 로그인 결과는 목적지 화면에서 표시한다.
        if (/^\/oauth2\/callback\/?$/.test(pathname)) return;
        if (consumeLoginFeedback(user)) {
            message.success(user.name ? `${user.name}님, 로그인됐어요!` : '로그인됐어요.');
        }
    }, [message, pathname, user]);
    return null;
}
