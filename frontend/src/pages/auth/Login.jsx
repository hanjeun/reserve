import { PageTitle, PageDescription } from '../../components/common/PageTypography';
import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Typography, Divider, Flex, Modal, Checkbox } from 'antd';
import { ExclamationCircleFilled, LockOutlined, MailOutlined, SafetyCertificateOutlined, InfoCircleOutlined } from '../../components/common/icons';
import IconTool from '../../components/common/IconTool';
import { PageContainer, Button, FormInput } from '../../components/common';
import MfaFlow from '../../components/member/MfaFlow';
import { authenticateWithPasskey, finishMfaSession } from '../../utils/mfaAuthentication';
import SocialLoginButton from '../../components/common/SocialLoginButton';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { API_ENDPOINTS } from '../../constants';
import { VALIDATION_RULES } from '../../utils/validation';
import { saveRedirect, safeRedirectPath, consumeLoginRedirect } from '../../utils/redirect';
import { oauthAuthorizationUrl } from '../../utils/oauthAuthorization';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;
const PASSKEY_SETTINGS = '/my-page?tab=name#account-security';
const lifetimeLabel = seconds => seconds % 86400 === 0 ? seconds / 86400 + '일'
    : seconds % 3600 === 0 ? seconds / 3600 + '시간' : Math.ceil(seconds / 60) + '분';

const suspensionInfo = (status, until, reason) => ({
    title: status === 'BANNED' ? '영구 정지된 계정이에요' : '이용이 제한된 계정이에요',
    isBanned: status === 'BANNED', until, reason,
});

const Login = () => {
    const { login, isLoggedIn } = useAuthStore();
    useDocumentTitle('로그인');
    const navigate = useNavigate();
    const location = useLocation();
    const registrationRequested = new URLSearchParams(location.search).get('enroll') === 'passkey';
    const { message } = useMessage();
    // 안내가 라우터 상태를 비우기 전에 복귀 경로를 보존한다.
    const fromState = location.state?.from
        ? safeRedirectPath(`${location.state.from.pathname || ''}${location.state.from.search || ''}${location.state.from.hash || ''}`)
        : null;
    const fromRef = useRef(registrationRequested ? PASSKEY_SETTINGS : fromState);
    // 안내 후에도 로그인 전환 방향을 유지한다.
    const preventedRef = useRef(Boolean(location.state?.prevented));
    const hasHandledRef = useRef(false);
    const [loading, setLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const loginAttempt = useRef(false);
    const nativeController = useRef(null);
    const mounted = useRef(true);
    const [rememberNotice, setRememberNotice] = useState(false);
    const [loginPolicy, setLoginPolicy] = useState(null);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; nativeController.current?.abort(); }; }, []);
    useEffect(() => {
        if (!rememberNotice) return;
        const controller = new AbortController();
        api.get('/api/auth/login-policy', { skipAuthRefresh: true, signal: controller.signal })
            .then(policy => { if (!controller.signal.aborted) setLoginPolicy(policy); }).catch(() => {});
        return () => controller.abort();
    }, [rememberNotice]);
    const [mfa, setMfa] = useState(() => new URLSearchParams(location.search).get('mfa') === '1' ? {} : null);
    // 정지 사유는 소셜·이메일 로그인에 같은 모달로 표시한다.
    const [suspendInfo, setSuspendInfo] = useState(() => {
        if (isLoggedIn || location.state?.signupSuccess || location.state?.prevented) return null;
        const params = new URLSearchParams(window.location.search);
        return params.get('suspended') === 'true' && params.get('status')
            ? suspensionInfo(params.get('status'), params.get('until'), null) : null;
    });

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
        if (isLoggedIn && !mfa) { navigate(consumeLoginRedirect(registrationRequested ? PASSKEY_SETTINGS : fromRef.current), { replace: true }); return; }

        if (location.state?.signupSuccess) {
            hasHandledRef.current = true;
            message.success('회원가입이 완료됐어요! 로그인해주세요.');
            navigate('/login', { replace: true, state: {} });
            return;
        }

        if (location.state?.prevented) {
            hasHandledRef.current = true;
            message.warning('로그인이 필요한 서비스예요.');
            // 로그인 화면 상태에서 복귀 경로를 보존한다.

            navigate('/login', { replace: true, state: { from: location.state.from } });
            return;
        }

        // 정지 정보는 suspended·status·until 쿼리로 전달된다.
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
    }, [isLoggedIn, mfa, registrationRequested, location.state, location.search, navigate, message]);

    const completeLogin = member => {
        login(member);
        message.success(member.name + '님, 로그인됐어요!');
        const target = consumeLoginRedirect(fromRef.current);
        const direction = preventedRef.current && target !== '/' ? 'from-right' : 'from-left';
        navigate(target, { replace: true, state: { reserveRouteMotion: direction } });
    };
    const nativePasskeyLogin = async () => {
        if (!mounted.current) return;
        const controller = new AbortController();
        nativeController.current = controller;
        await authenticateWithPasskey(false, controller.signal);
        const member = await finishMfaSession(controller.signal);
        if (mounted.current && !controller.signal.aborted) completeLogin(member);
    };
    const onLoginSubmit = async (values) => {
        if (loginAttempt.current) return;
        loginAttempt.current = true;
        setLoading(true);
        try {
            const res = await api.post(API_ENDPOINTS.AUTH.LOGIN, { ...values, rememberMe }, { withCredentials: true });
            if (!mounted.current) return;
            if (res?.mfaRequired) {
                if (res.passkeyAvailable && !res.enrollmentRequired) {
                    try { await nativePasskeyLogin(); return; }
                    catch (failure) {
                        if (failure.isSessionExpired || failure.isStaleSession || nativeController.current?.signal.aborted) return;
                        setMfa({ ...res, preferredFactor: res.totpAvailable ? 'TOTP' : 'PASSKEY',
                            initialError: ['NotAllowedError', 'AbortError'].includes(failure.name)
                                ? '다른 인증 수단을 사용하거나 패스키를 다시 선택해주세요.' : failure.message });
                    }
                } else setMfa(res);
                return;
            }
            if (res) completeLogin(res);
        } catch (err) {
            if (!mounted.current || err?.isSessionExpired) return;
            // 서버가 확인한 정지 상태와 사유만 표시한다.
            const suspendData = err?.data;
            if (suspendData?.status) {
                showSuspendModal(suspendData.status, suspendData.until, suspendData.reason);
                return;
            }
            const msg = typeof err === 'string' ? err : err?.message;
            message.error(msg || '이메일 또는 비밀번호를 확인해주세요.');
        } finally {
            loginAttempt.current = false;
            if (mounted.current) setLoading(false);
        }
    };

    const handlePasskeyLogin = async () => {
        if (loginAttempt.current) return;
        loginAttempt.current = true;
        setLoading(true);
        try {
            await api.post('/api/auth/mfa/passkey/login', { rememberMe }, { skipAuthRefresh: true });
            if (!mounted.current) return;
            await nativePasskeyLogin();
        } catch (failure) {
            if (!mounted.current || failure.isSessionExpired || failure.isStaleSession || nativeController.current?.signal.aborted) return;
            await api.post('/api/auth/mfa/cancel', undefined, { skipAuthRefresh: true }).catch(() => {});
            if (['NotAllowedError', 'AbortError'].includes(failure.name)) message.info('패스키 인증을 취소했어요.');
            else message.error(failure.message || '패스키 인증을 다시 시도해주세요.');
        }
        finally { loginAttempt.current = false; if (mounted.current) setLoading(false); }
    };

    const handleSocialLogin = (provider) => {
        if (loginAttempt.current) return;
        loginAttempt.current = true;
        setLoading(true);
        // 전체 페이지 이동에서도 복귀 경로를 유지한다.
        if (fromRef.current) saveRedirect(fromRef.current);
        window.location.href = oauthAuthorizationUrl(provider, undefined, rememberMe);
    };

    return (
        <PageContainer size="sm" paddingTop="80px" center>
            <div className="fade-in-up">
                {!mfa && <><PageTitle aria-label="로그인" className="reserve-auth-title" style={styles.title}><LockOutlined aria-hidden="true" /></PageTitle>
                <PageDescription style={styles.subtitle}>예약이 필요한 순간, RESERVE</PageDescription></>}

                {mfa ? <MfaFlow page initialView={mfa.mfaRequired ? mfa : undefined}
                    onDone={() => navigate(new URLSearchParams(location.search).get('security') === '1' ? '/my-page' : consumeLoginRedirect(fromRef.current), { replace: true })}
                    onCancel={() => { setMfa(null); navigate('/login', { replace: true }); }} /> : <>
                {registrationRequested && <Text role="status">패스키를 등록하려면 먼저 로그인해주세요.</Text>}
                <Form onFinish={onLoginSubmit} layout="vertical" size="large" requiredMark={false}>
                    <Form.Item name="email" rules={VALIDATION_RULES.loginEmail}>
                        <FormInput type="email" placeholder="이메일 주소" autoComplete="username webauthn" />
                    </Form.Item>
                    <Form.Item name="password" rules={VALIDATION_RULES.loginPassword}>
                        <FormInput type="password" placeholder="비밀번호" autoComplete="current-password" />
                    </Form.Item>

                    <Flex justify="space-between" align="center" className="reserve-login-tools">
                        <Checkbox checked={rememberMe} disabled={loading} onChange={event => { if (event.target.checked) setRememberNotice(true); else setRememberMe(false); }}>로그인 유지</Checkbox>
                        <Flex align="center">
                        <IconTool label="패스키 등록" icon={<SafetyCertificateOutlined />} disabled={loading}
                            onClick={() => {
                                fromRef.current = PASSKEY_SETTINGS;
                                saveRedirect(PASSKEY_SETTINGS);
                                navigate('/login?enroll=passkey', { replace: true });
                            }} />
                        <IconTool label="비밀번호 찾기" icon={<MailOutlined />} disabled={loading}
                            onClick={() => navigate('/forgot-password')} />
                        </Flex>
                    </Flex>
                    <div className="reserve-login-actions">
                        <Button variant="primary" htmlType="submit" loading={loading} block icon={<LockOutlined />}>로그인</Button>
                        <Button variant="secondary" htmlType="button" disabled={loading} icon={<LockOutlined />}
                            onClick={handlePasskeyLogin} block>패스키로 로그인</Button>
                    </div>
                </Form>

                <Divider plain style={{ margin: '32px 0' }}>
                    <Text type="secondary" style={{ fontSize: fontSize.xs }}>또는 소셜 로그인</Text>
                </Divider>

                <Flex justify="center" gap={20}>
                    <SocialLoginButton provider="kakao" label="카카오로 로그인" disabled={loading} onClick={() => handleSocialLogin('kakao')} />
                    <SocialLoginButton provider="naver" label="네이버로 로그인" disabled={loading} onClick={() => handleSocialLogin('naver')} />
                    <SocialLoginButton provider="google" label="Google로 로그인" disabled={loading} onClick={() => handleSocialLogin('google')} />
                </Flex>

                <Flex vertical gap={20} style={{ width: '100%', marginTop: '32px' }} align="center">
                    <Flex align="center" justify="center" gap={4}>
                        <Text type="secondary" style={{ fontSize: fontSize.base }}>계정이 없으신가요?</Text>
                        <Button variant="link" onClick={() => navigate('/signup')} style={{ padding: 0 }}>회원가입</Button>
                    </Flex>

                </Flex>
                </>}
            </div>

            <Modal title={<Flex align="center" gap={8}><InfoCircleOutlined aria-hidden="true" />로그인 유지</Flex>}
                open={rememberNotice} centered okText="로그인 유지하기" cancelText="취소"
                onOk={() => { setRememberMe(true); setRememberNotice(false); }} onCancel={() => setRememberNotice(false)}>
                <Typography.Paragraph>개인 기기에서만 사용해주세요. 공용 PC에서는 사용 후 꼭 로그아웃해주세요.</Typography.Paragraph>
                <Typography.Paragraph type="secondary">{loginPolicy?.idleSeconds && loginPolicy?.absoluteSeconds
                    ? lifetimeLabel(loginPolicy.idleSeconds) + ' 동안 사용하지 않거나 로그인한 지 ' + lifetimeLabel(loginPolicy.absoluteSeconds) + '이 지나면 다시 로그인해요.'
                    : '일정 기간 접속하지 않거나 로그인 유지 기간이 끝나면 다시 로그인해야 해요.'}</Typography.Paragraph>
            </Modal>
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
};

export default Login;
