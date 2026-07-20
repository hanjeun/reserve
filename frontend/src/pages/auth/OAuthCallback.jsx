import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import useAuthStore from '../../store/useAuthStore';
import Loading from '../../components/common/Loading';
import { consumeRedirect } from '../../utils/redirect';

/**
 * 소셜 로그인 콜백.
 *
 * 2026-07: 로그인 후 원래 보던 페이지로 복귀 추가.
 * 예전엔 기존 유저를 무조건 '/'로 보냈다 — 가게 상세(/store/12)에서 예약하려고
 * 소셜 로그인을 하면 로그인은 됐는데 홈으로 튀겨서 다시 그 가게를 찾아가야 했다.
 * 복귀 경로는 PrivateRoute / Login이 sessionStorage에 저장해둔 것을 꺼낸다
 * (소셜 로그인은 전체 페이지 리다이렉트라 React Router의 location.state가 살아남지 못한다).
 *
 * 신규 소셜 가입자는 약관 동의(/signup/social)가 우선이므로 여기서 소비하지 않고
 * 그대로 남겨둔다 — SocialAgreement가 동의 완료 후에 소비해서 복귀시킨다.
 */
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
                        // 약관 동의가 먼저 — 복귀 경로는 소비하지 않고 남겨둔다(SocialAgreement가 소비)
                        navigate('/signup/social', { replace: true });
                    } else {
                        const greeting = user.name ? `${user.name}님, 반갑습니다!` : '로그인되었습니다.';
                        message.success(greeting);
                        // 원래 보던 페이지로 복귀 (없으면 홈)
                        navigate(consumeRedirect() || '/', { replace: true });
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
