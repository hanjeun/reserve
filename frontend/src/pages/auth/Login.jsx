import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Typography, Divider, Flex, Modal } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { PageContainer, Button, FormInput } from '../../components/common';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
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
    useDocumentTitle('로그인');
    const navigate = useNavigate();
    const location = useLocation();
    const { message } = useMessage();
    const from = location.state?.from?.pathname || "/";
    const hasHandledRef = useRef(false);
    const [loading, setLoading] = useState(false);
    // 정지/영구정지 안내 모달 상태 — 앱 전반 모달 스타일(큰색 제목 + 텍스트 본문 + 단일 버튼)과 통일하기 위해
    // antd 기본 modal.error() 대신 직접 제어하는 Modal 사용 (빨간 X 아이콘 없이 다른 안내 모달과 동일한 톤)
    const [suspendInfo, setSuspendInfo] = useState(null); // { title, until, reason }

    // 정지/영구정지 안내 모달 — 소셜·이메일 로그인 공통 포맷 (배너 차별 없이 동일한 UX)
    const showSuspendModal = (status, until, reason) => {
        const isBanned = status === 'BANNED';
        setSuspendInfo({
            title: isBanned ? '영구 정지된 계정입니다' : '이용이 제한된 계정입니다',
            isBanned, until, reason,
        });
    };

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

        // OAuth2 소셜 로그인 시 정지 처리 (URL 파라미터)
        // 소셜 로그인은 브라우저가 따라가는 리다이렉트 흐름이라 URL 파라미터로 정보 전달
        // 구조: ?suspended=true&status=SUSPENDED&until=2026-08-15
        const params = new URLSearchParams(window.location.search);
        const isSuspended = params.get('suspended') === 'true';
        const suspendStatus = params.get('status');    // 'SUSPENDED' | 'BANNED'
        const suspendUntil  = params.get('until');      // '2026-08-15' | null

        if (isSuspended && suspendStatus) {
            hasHandledRef.current = true;
            showSuspendModal(suspendStatus, suspendUntil, null);
            window.history.replaceState({}, '', '/login');
        }

        // 구 오류 파라미터 하위 호환 (oauthError='oauth2', message=...)
        const oauthError = params.get('error');
        const oauthMessage = params.get('message');
        if (oauthError === 'oauth2' && oauthMessage) {
            hasHandledRef.current = true;
            message.error(decodeURIComponent(oauthMessage));
            window.history.replaceState({}, '', '/login');
        }
    }, [isLoggedIn, location.state, navigate, message]);

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
                    <button type="button" onClick={() => handleSocialLogin('kakao')} style={{ ...styles.socialCircle, backgroundColor: '#FEE500' }}>
                        <KakaoIcon />
                    </button>
                    <button type="button" onClick={() => handleSocialLogin('naver')} style={{ ...styles.socialCircle, backgroundColor: '#03C75A', color: '#fff' }}>
                        <NaverIcon />
                    </button>
                    <button type="button" onClick={() => handleSocialLogin('google')} style={{ ...styles.socialCircle, backgroundColor: colors.background.default, border: `1px solid ${colors.border.light}` }}>
                        <GoogleIcon />
                    </button>
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
                        <button type="button" style={styles.linkBtn} onClick={() => navigate('/terms')}>이용약관</button>
                        {' · '}
                        <button type="button" style={styles.linkBtn} onClick={() => navigate('/privacy')}>개인정보처리방침</button>
                        에 동의합니다.
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
        border: 'none',
        padding: 0,
    },
    linkBtn: {
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        textDecoration: 'underline',
        fontSize: 'inherit',
        color: 'inherit',
        fontFamily: 'inherit',
    },
};

export default Login;
