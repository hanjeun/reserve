import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import useAuthStore from '../../store/useAuthStore';
import Loading from '../../components/common/Loading';

const OAuthCallback = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { checkAuth } = useAuthStore();
    const hasCalled = useRef(false);

    useEffect(() => {
        if (hasCalled.current) return;
        hasCalled.current = true;

        // OAuth2 실패 콜백 체크 (FailureHandler가 ?error=oauth2&message=... 형식으로 보냄)
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error');
        const oauthMessage = params.get('message');
        if (oauthError === 'oauth2' && oauthMessage) {
            message.error(decodeURIComponent(oauthMessage));
            navigate('/login', { replace: true });
            return;
        }

        const finalizeLogin = async () => {
            try {
                const user = await checkAuth(true);
                if (user && user.email) {
                    const isNewUser = params.get('newUser') === 'true';
                    if (isNewUser) {
                        navigate('/signup/social', { replace: true });
                    } else {
                        const greeting = user.name ? `${user.name}님, 반갑습니다!` : '로그인되었습니다.';
                        message.success(greeting);
                        navigate('/', { replace: true });
                    }
                } else {
                    throw new Error('유저 정보가 올바르지 않습니다.');
                }
            } catch (err) {
                console.error('OAuth 인증 실패:', err);
                message.error('로그인 정보를 가져오는데 실패했습니다.');
                navigate('/login', { replace: true });
            }
        };
        finalizeLogin();
    }, [checkAuth, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

    return <Loading fullPage />;
};

export default OAuthCallback;
