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

        const finalizeLogin = async () => {
            try {
                const user = await checkAuth(true);
                if (user && user.email) {
                    const greeting = user.name ? `${user.name}님, 반갑습니다!` : '로그인되었습니다.';
                    message.success(greeting);
                    navigate('/', { replace: true });
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
    }, [checkAuth, navigate]);

    return <Loading fullPage />;
};

export default OAuthCallback;
