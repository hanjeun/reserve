import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import useAuthStore from '../../store/useAuthStore';
import RouteLoadingSkeleton from '../../components/layout/RouteLoadingSkeleton';
import { consumeRedirect } from '../../utils/redirect';
import { rememberLoginFeedback } from '../../utils/loginFeedback';

/*
 * 전체 페이지 리다이렉트 후 저장된 복귀 경로를 사용한다. 신규 가입자는 약관 동의를 마친 뒤 경로를 소비한다.
 */
const OAuthCallback = () => {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { checkAuth } = useAuthStore();
    const hasCalled = useRef(false);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;
        const cleanup = () => { mounted.current = false; };
        if (hasCalled.current) return cleanup;
        hasCalled.current = true;

        // OAuth 실패 콜백의 error·message 쿼리를 확인한다.
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error');
        const oauthMessage = params.get('message');
        if (oauthError === 'oauth2') {
            // URLSearchParams가 이미 디코딩했다. '%'가 포함된 안내를 다시 디코딩하면 콜백이 중단된다.
            message.error(oauthMessage || '소셜 로그인하지 못했어요. 다시 시도해주세요.');
            navigate('/login', { replace: true });
            return cleanup;
        }

        const finalizeLogin = async () => {
            try {
                const user = await checkAuth(true);
                if (!mounted.current) return;
                if (user?.email) {
                    const isNewUser = user.termsAgreed === false || params.get('newUser') === 'true';
                    if (isNewUser) {
                        // 약관 동의가 먼저 — 복귀 경로는 소비하지 않고 남겨둔다(SocialAgreement가 소비)
                        window.location.replace('/signup/social');
                    } else {
                        rememberLoginFeedback(user);
                        // OAuth 문서를 교체해 모바일 주소창과 접수 화면의 주소를 함께 갱신한다.
                        // 검증된 내부 경로만 사용하고 QR의 fragment를 그대로 보존한다.
                        window.location.replace(consumeRedirect() || '/');
                    }
                } else {
                    throw new Error('사용자 정보가 올바르지 않아요.');
                }
            } catch {
                if (!mounted.current) return;
                console.error('OAuth sign-in could not be completed');
                message.error('로그인 정보를 가져오지 못했어요.');
                navigate('/login', { replace: true });
            }
        };
        void finalizeLogin();
        return cleanup;
    }, [checkAuth, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

    return <RouteLoadingSkeleton />;
};

export default OAuthCallback;
