import { PageTitle, PageDescription } from '../../components/common/PageTypography';
import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Typography, Divider, Flex, Modal } from 'antd';
import { ExclamationCircleFilled } from '../../components/common/icons';
import { PageContainer, Button, FormInput } from '../../components/common';
import SocialLoginButton from '../../components/common/SocialLoginButton';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { API_ENDPOINTS } from '../../constants';
import { VALIDATION_RULES } from '../../utils/validation';
import { saveRedirect, safeRedirectPath, consumeLoginRedirect } from '../../utils/redirect';
import { oauthAuthorizationUrl } from '../../utils/oauthAuthorization';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

const suspensionInfo = (status, until, reason) => ({
    title: status === 'BANNED' ? '영구 정지된 계정이에요' : '이용이 제한된 계정이에요',
    isBanned: status === 'BANNED', until, reason,
});

const Login = () => {
    const { login, isLoggedIn } = useAuthStore();
    useDocumentTitle('로그인');
    const navigate = useNavigate();
    const location = useLocation();
    const { message } = useMessage();
    // 로그인 성공 후 돌아갈 경로.
    // 1순위: PrivateRoute가 넘겨준 router state (이메일 로그인 경로)
    // 2순위: sessionStorage (소셜 로그인은 전체 페이지 리다이렉트라 router state가 날아간다)
    // 참고: 아래 useEffect가 안내 메시지를 띄우며 state를 비우기 때문에, 여기서 렌더 시점에
    //       미리 값을 잡아둬야 유실되지 않는다.
    const fromState = location.state?.from
        ? safeRedirectPath(`${location.state.from.pathname || ''}${location.state.from.search || ''}${location.state.from.hash || ''}`)
        : null;
    const fromRef = useRef(fromState);
    // 로그인 필요 페이지에서 넘어왔는지 — 성공 후 전환 방향을 정한다. 아래 effect 가 state 를 비우므로 렌더 시점에 잡는다.
    const preventedRef = useRef(Boolean(location.state?.prevented));
    const hasHandledRef = useRef(false);
    const [loading, setLoading] = useState(false);
    // 정지/영구정지 안내 모달 상태 — 앱 전반 모달 스타일(큰색 제목 + 텍스트 본문 + 단일 버튼)과 통일하기 위해
    // antd 기본 modal.error() 대신 직접 제어하는 Modal 사용 (빨간 X 아이콘 없이 다른 안내 모달과 동일한 톤)
    const [suspendInfo, setSuspendInfo] = useState(() => {
        if (isLoggedIn || location.state?.signupSuccess || location.state?.prevented) return null;
        const params = new URLSearchParams(window.location.search);
        return params.get('suspended') === 'true' && params.get('status')
            ? suspensionInfo(params.get('status'), params.get('until'), null) : null;
    });

    // 정지/영구정지 안내 모달 — 소셜·이메일 로그인 공통 포맷 (배너 차별 없이 동일한 UX)
    const showSuspendModal = (status, until, reason) => {
        setSuspendInfo(suspensionInfo(status, until, reason));
    };

    useEffect(() => {
        if (hasHandledRef.current) return;
        const params = new URLSearchParams(location.search);
        // 연결·재인증을 취소해도 기존 로그인은 유효하다. 오류를 먼저 알리고 보안 설정으로 돌려보낸다.
        if (isLoggedIn && params.get('error') === 'oauth2') {
            hasHandledRef.current = true;
            message.error(params.get('message') || '소셜 로그인하지 못했어요. 다시 시도해주세요.');
            navigate('/my-page', { replace: true });
            return;
        }
        // 계정 경계에서 재마운트돼도 원래 요청한 경로로 돌아간다.
        if (isLoggedIn) { navigate(consumeLoginRedirect(fromRef.current), { replace: true }); return; }

        if (location.state?.signupSuccess) {
            hasHandledRef.current = true;
            message.success('회원가입이 완료됐어요! 로그인해주세요.');
            navigate('/login', { replace: true, state: {} });
            return;
        }

        if (location.state?.prevented) {
            hasHandledRef.current = true;
            message.warning('로그인이 필요한 서비스예요.');
            // 2026-07 버그 수정: 예전엔 여기서 state를 통째로 비웠다({}).
            // 그런데 그 state 안엔 PrivateRoute가 넣어준 from(원래 가려던 페이지)도 같이 들어 있어서,
            // 안내 메시지를 띄우는 순간 복귀 경로가 사라지고 로그인 성공 후 항상 '/'로 가버렸다.
            // (아래 onLoginSubmit에 navigate(from) 복귀 코드가 이미 있었는데도 이 한 줄 때문에 무력화)
            // -> 메시지를 한 번만 띄우기 위해 prevented 플래그만 지우고 from은 그대로 남긴다.
            navigate('/login', { replace: true, state: { from: location.state.from } });
            return;
        }

        // OAuth2 소셜 로그인 시 정지 처리 (URL 파라미터)
        // 소셜 로그인은 브라우저가 따라가는 리다이렉트 흐름이라 URL 파라미터로 정보 전달
        // 구조: ?suspended=true&status=SUSPENDED&until=2026-08-15
        const isSuspended = params.get('suspended') === 'true';
        const suspendStatus = params.get('status');    // 'SUSPENDED' | 'BANNED'

        if (isSuspended && suspendStatus) {
            hasHandledRef.current = true;
            window.history.replaceState({}, '', '/login');
        }

        // 구 오류 파라미터 하위 호환 (oauthError='oauth2', message=...)
        const oauthError = params.get('error');
        const oauthMessage = params.get('message');
        if (oauthError === 'oauth2' && oauthMessage) {
            hasHandledRef.current = true;
            message.error(oauthMessage);
            window.history.replaceState({}, '', '/login');
        }
    }, [isLoggedIn, location.state, location.search, navigate, message]);

    const onLoginSubmit = async (values) => {
        setLoading(true);
        try {
            const res = await api.post(API_ENDPOINTS.AUTH.LOGIN, values, { withCredentials: true });
            if (res) {
                login(res);
                message.success(`${res.name}님, 로그인됐어요!`);
                // router state → sessionStorage → '/' 순으로 복귀 경로 결정
                const target = consumeLoginRedirect(fromRef.current);
                // 로그인 필요로 막혔던 곳이면 가려던 길을 계속 간다(오른쪽에서). 스스로 로그인했으면 있던 곳으로 돌아간다(왼쪽에서).
                const direction = preventedRef.current && target !== '/' ? 'from-right' : 'from-left';
                navigate(target, { replace: true, state: { reserveRouteMotion: direction } });
            }
        } catch (err) {
            if (err?.isSessionExpired) return;
            // err.data에 구조화된 정지 정보(status/until/reason)가 있으면 모달로 처리
            // 이메일 로그인은 URL이 아닌 JSON 응답이므로 사유 길이 제한 없이 전달됨
            const suspendData = err?.data;
            if (suspendData?.status) {
                showSuspendModal(suspendData.status, suspendData.until, suspendData.reason);
                return;
            }
            const msg = typeof err === 'string' ? err : err?.message;
            message.error(msg || '이메일 또는 비밀번호를 확인해주세요.');
        } finally {
            setLoading(false);
        }
    };

    const handleSocialLogin = (provider) => {
        // 소셜 로그인은 백엔드로 전체 페이지 리다이렉트를 하기 때문에 React Router의 state가
        // 살아남지 못한다 — 떠나기 직전에 복귀 경로를 sessionStorage에 남긴다.
        // (같은 탭 안의 왕복이라 sessionStorage는 유지된다. OAuthCallback/SocialAgreement가 소비)
        if (fromRef.current) saveRedirect(fromRef.current);
        window.location.href = oauthAuthorizationUrl(provider);
    };

    return (
        <PageContainer size="sm" paddingTop="80px" center>
            <div className="fade-in-up">
                <PageTitle style={styles.title}>로그인</PageTitle>
                <PageDescription style={styles.subtitle}>특별한 날을 위한 완벽한 예약</PageDescription>

                <Form onFinish={onLoginSubmit} layout="vertical" size="large" requiredMark={false}>
                    <Form.Item name="email" rules={VALIDATION_RULES.loginEmail}>
                        <FormInput placeholder="이메일 주소" />
                    </Form.Item>
                    <Form.Item name="password" rules={VALIDATION_RULES.loginPassword}>
                        <FormInput type="password" placeholder="비밀번호" />
                    </Form.Item>

                    {/* 비밀번호 찾기 */}
                    <Flex justify="flex-end" style={{ marginTop: -8, marginBottom: 16 }}>
                        <Button variant="link" onClick={() => navigate('/forgot-password')} style={{ padding: 0, fontSize: fontSize.sm }}>
                            비밀번호를 잊으셨나요?
                        </Button>
                    </Flex>

                    <Button variant="primary" htmlType="submit" loading={loading} block>
                        로그인
                    </Button>
                </Form>

                <Divider plain style={{ margin: '32px 0' }}>
                    <Text type="secondary" style={{ fontSize: fontSize.xs }}>또는 소셜 로그인</Text>
                </Divider>

                <Flex justify="center" gap={20}>
                    <SocialLoginButton provider="kakao" label="카카오로 로그인" onClick={() => handleSocialLogin('kakao')} />
                    <SocialLoginButton provider="naver" label="네이버로 로그인" onClick={() => handleSocialLogin('naver')} />
                    <SocialLoginButton provider="google" label="Google로 로그인" onClick={() => handleSocialLogin('google')} />
                </Flex>

                <Flex vertical gap={20} style={{ width: '100%', marginTop: '32px' }} align="center">
                    {/* 회원가입 라인 */}
                    <Flex align="center" justify="center" gap={4}>
                        <Text type="secondary" style={{ fontSize: fontSize.base }}>계정이 없으신가요?</Text>
                        <Button variant="link" onClick={() => navigate('/signup')} style={{ padding: 0 }}>회원가입</Button>
                    </Flex>

                    {/* 법적 고지 라인 */}
                    <Text type="secondary" style={{ fontSize: fontSize.xs, color: colors.text.tertiary, textAlign: 'center' }}>
                        로그인 시{' '}
                        <button type="button" className="reserve-text-link" style={styles.linkBtn} onClick={() => navigate('/terms')}>이용약관</button>
                        {' · '}
                        <button type="button" className="reserve-text-link" style={styles.linkBtn} onClick={() => navigate('/privacy')}>개인정보처리방침</button>에 동의해요.
                    </Text>
                </Flex>
            </div>

            {/* 정지/영구정지 안내 — 앱 전반 모달과 동일한 톤(아이콘 + 플레인 제목 + 본문 + 단일 버튼) */}
            <Modal
                title={
                    <Flex align="center" gap={8}>
                        <ExclamationCircleFilled style={{ color: suspendInfo?.isBanned ? colors.error.main : colors.warning.main, fontSize: 18 }} />
                        <span>{suspendInfo?.title}</span>
                    </Flex>
                }
                open={!!suspendInfo}
                onOk={() => setSuspendInfo(null)}
                onCancel={() => setSuspendInfo(null)}
                okText="확인"
                cancelButtonProps={{ style: { display: 'none' } }}
                centered
            >
                {suspendInfo && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                        {!suspendInfo.isBanned && suspendInfo.until && (
                            <Text>정지 기간: <Text strong>{suspendInfo.until}까지</Text></Text>
                        )}
                        {suspendInfo.reason && (
                            <Text>사유: {suspendInfo.reason}</Text>
                        )}
                        <Text type="secondary" style={{ marginTop: 4 }}>
                            문의사항은 관리자에게 문의해주세요.
                        </Text>
                    </div>
                )}
            </Modal>
        </PageContainer>
    );
};

const styles = {
    title: {
        marginBottom: '12px',
    },
    subtitle: {
        display: 'block',
        marginBottom: '48px',
    },
    linkBtn: {
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        fontSize: 'inherit',
        fontFamily: 'inherit',
    },
};

export default Login;
