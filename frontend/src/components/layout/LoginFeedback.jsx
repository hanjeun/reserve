import { useEffect } from 'react';
import { App } from 'antd';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { consumeLoginFeedback } from '../../utils/loginFeedback';

export default function LoginFeedback() {
    const { message } = App.useApp();
    const { pathname } = useLocation();
    const user = useAuthStore(state => state.user);
    useEffect(() => {
        // 다음 문서에서만 로그인 결과를 소비하도록 이동 중 상태를 남긴다.
        if (/^\/oauth2\/callback\/?$/.test(pathname)) return;
        if (consumeLoginFeedback(user)) {
            message.success(user.name ? `${user.name}님, 로그인됐어요!` : '로그인됐어요.');
        }
    }, [message, pathname, user]);
    return null;
}
