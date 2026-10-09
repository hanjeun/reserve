import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import useAuthStore from '../../store/useAuthStore';
import RouteLoadingSkeleton from '../../components/layout/RouteLoadingSkeleton';
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
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;
        const cleanup = () => { mounted.current = false; };
        if (hasCalled.current) return cleanup;
        hasCalled.current = true;

        // OAuth2 실패 콜백 체크 (FailureHandler가 ?error=oauth2&message=... 형식으로 보냄)
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
                        const greeting = user.name ? `${user.name}님, 반가워요!` : '로그인됐어요.';
                        message.success(greeting);
                        // OAuth 문서를 교체해 모바일 주소창과 접수 화면의 주소를 함께 갱신한다.
                        // 검증된 내부 경로만 사용하고 QR의 fragment를 그대로 보존한다.
                        window.location.replace(consumeRedirect() || '/');
                    }
                } else {
                    throw new Error('사용자 정보가 올바르지 않아요.');
                }
            } catch (err) {
                if (!mounted.current) return;
                console.error('OAuth 인증 실패:', err);
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
