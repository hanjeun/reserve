import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Typography, Divider, Flex } from 'antd';
import { PageContainer, Button, FormInput } from '../../components/common';
import { useMessage } from '../../hooks';
import { API_ENDPOINTS, API_BASE_URL } from '../../constants';
import { VALIDATION_RULES } from '../../utils/validation';
import { colors, radius, heights, fontWeight, fontSize } from '../../styles/tokens';

const { Title, Text } = Typography;

const GoogleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
        <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z" />
        <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z" />
        <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
);

const NaverIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24">
        <path fill="currentColor" d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" />
    </svg>
);

const KakaoIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24">
        <path fill="#191919" d="M12 3C5.925 3 1 6.925 1 11.5c0 2.925 1.875 5.5 4.75 7.05l-.975 3.625c-.075.275.225.5.475.35l4.35-2.875c.775.125 1.575.2 2.4.2 6.075 0 11-3.925 11-8.75S18.075 3 12 3z" />
    </svg>
);

const Login = () => {
    const { login, isLoggedIn } = useAuthStore();
    const navigate = useNavigate();
    const location = useLocation();
    const { message } = useMessage();
    const from = location.state?.from?.pathname || "/";
    const hasHandledRef = useRef(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (hasHandledRef.current) return;
        if (isLoggedIn) { navigate('/', { replace: true }); return; }

        if (location.state?.signupSuccess) {
            hasHandledRef.current = true;
            message.success('회원가입이 완료되었습니다! 로그인해주세요.');
            navigate('/login', { replace: true, state: {} });
            return;
        }

        if (location.state?.prevented) {
            hasHandledRef.current = true;
            message.warning('로그인이 필요한 서비스입니다.');
            navigate('/login', { replace: true, state: {} });
            return;
        }

        // OAuth2 에러 메시지 처리 (URL 파라미터)
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error');
        const oauthMessage = params.get('message');
        if (oauthError === 'oauth2' && oauthMessage) {
            hasHandledRef.current = true;
            message.error(decodeURIComponent(oauthMessage));
            window.history.replaceState({}, '', '/login');
        }
    }, [isLoggedIn, location.state, navigate, message]); // eslint-disable-line react-hooks/exhaustive-deps

    const onLoginSubmit = async (values) => {
        setLoading(true);
        try {
            const res = await api.post(API_ENDPOINTS.AUTH.LOGIN, values, { withCredentials: true });
            if (res) {
                login(res);
                message.success(`${res.name}님, 로그인되었습니다!`);
                navigate(from, { replace: true });
            }
        } catch (err) {
            const msg = typeof err === 'string' ? err : err?.message;
            if (err?.isSessionExpired) return;
            message.error(msg || '이메일 또는 비밀번호를 확인해주세요.');
        } finally {
            setLoading(false);
        }
    };

    const handleSocialLogin = (provider) => {
        window.location.href = `${API_BASE_URL}/oauth2/authorization/${provider}`;
    };

    return (
        <PageContainer size="sm" paddingTop="80px" center>
            <div className="fade-in-up">
                <Title level={2} style={styles.title}>로그인</Title>
                <Text type="secondary" style={styles.subtitle}>특별한 날을 위한 완벽한 예약</Text>

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
                    <div onClick={() => handleSocialLogin('kakao')} style={{ ...styles.socialCircle, backgroundColor: '#FEE500' }}>
                        <KakaoIcon />
                    </div>
                    <div onClick={() => handleSocialLogin('naver')} style={{ ...styles.socialCircle, backgroundColor: '#03C75A', color: '#fff' }}>
                        <NaverIcon />
                    </div>
                    <div onClick={() => handleSocialLogin('google')} style={{ ...styles.socialCircle, backgroundColor: colors.background.default, border: `1px solid ${colors.border.light}` }}>
                        <GoogleIcon />
                    </div>
                </Flex>

                <Flex align="center" justify="center" gap={2} style={{ marginTop: '48px' }}>
                    <Text type="secondary" style={{ fontSize: fontSize.base }}>계정이 없으신가요?</Text>
                    <Button variant="link" onClick={() => navigate('/signup')}>회원가입</Button>
                </Flex>
            </div>
        </PageContainer>
    );
};

const styles = {
    title: {
        marginBottom: '12px',
        fontWeight: fontWeight.extrabold,
        letterSpacing: '-1.2px',
        color: colors.text.primary
    },
    subtitle: {
        display: 'block',
        marginBottom: '48px',
        color: colors.text.tertiary,
        fontSize: fontSize.lg
    },
    socialCircle: {
        width: heights.socialBtn,
        height: heights.socialBtn,
        borderRadius: radius.full,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        border: 'none'
    },
};

export default Login;
