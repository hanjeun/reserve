import { PageTitle, PageDescription } from '../../components/common/PageTypography';
import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Typography, Divider, Flex, Modal, Checkbox } from 'antd';
import { ExclamationCircleFilled, LockOutlined, MailOutlined, SafetyCertificateOutlined, InfoCircleOutlined } from '../../components/common/icons';
import IconTool from '../../components/common/IconTool';
import { PageContainer, Button, DataState, FormInput } from '../../components/common';
import MfaFlow from '../../components/member/MfaFlow';
import { authenticateWithPasskey, finishMfaSession } from '../../utils/mfaAuthentication';
import SocialLoginButton from '../../components/common/SocialLoginButton';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { API_ENDPOINTS } from '../../constants';
import { VALIDATION_RULES } from '../../utils/validation';
import { saveRedirect, safeRedirectPath, consumeLoginRedirect } from '../../utils/redirect';
import { oauthAuthorizationUrl, socialLoginLabel } from '../../utils/oauthAuthorization';
import { oauthOutcomeMessage } from '../../utils/oauthOutcome';
import { peekSecurityReturn } from '../../utils/securityReturn';
import { clearPendingLoginMethodNotice, loginMethodRecoveryText, pendingLoginMethodNotice } from '../../utils/loginMethodRecovery';
import TextLink from '../../components/common/TextLink';
import { APP_ORIGIN, isLegacyAppOrigin } from '../../config/siteUrls';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;
const PASSKEY_SETTINGS = '/my-page?tab=name#account-security';
const PASSKEY_RETURN = { pathname: '/my-page', search: '?tab=name', hash: '#account-security' };
const lifetimeLabel = seconds => seconds % 86400 === 0 ? seconds / 86400 + '일'
    : seconds % 3600 === 0 ? seconds / 3600 + '시간' : Math.ceil(seconds / 60) + '분';

const suspensionInfo = (status, until, reason) => ({
    title: status === 'BANNED' ? '영구 정지된 계정이에요' : '이용이 제한된 계정이에요',
    isBanned: status === 'BANNED', until, reason,
});

const LoginForm = () => {
    const { login, isLoggedIn, sessionRevision, browserRegistrationReference, user } = useAuthStore();
    useDocumentTitle('로그인');
    const navigate = useNavigate();
    const location = useLocation();
    const [removedEmailLoginProvider] = useState(() => socialLoginLabel(location.state?.emailLoginRemoved));
    const [unconfirmedMethod] = useState(() => !isLoggedIn
        && (location.state?.loginMethodUnconfirmed || pendingLoginMethodNotice(sessionRevision)));
    useEffect(() => {
        if (unconfirmedMethod) clearPendingLoginMethodNotice(sessionRevision);
    }, [unconfirmedMethod, sessionRevision]);
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
    const oauthOutcomeRef = useRef(null);
    const enrollmentNoticeRef = useRef(null);
    const [pendingLogin, setPendingLogin] = useState(null);
    const loading = pendingLogin !== null;
    const [rememberMe, setRememberMe] = useState(false);
    const loginAttempt = useRef(false);
    const socialNavigation = useRef(false);
    const nativeController = useRef(null);
    const mounted = useRef(true);
    const [rememberNotice, setRememberNotice] = useState(false);
    const [loginPolicy, setLoginPolicy] = useState(null);
    const [policyError, setPolicyError] = useState(null);
    const [policyAttempt, setPolicyAttempt] = useState(0);
    const [policyRetrying, setPolicyRetrying] = useState(false);
    useEffect(() => {
        mounted.current = true;
        const restore = event => {
            if (!event.persisted || !socialNavigation.current) return;
            socialNavigation.current = false;
            loginAttempt.current = false;
            setPendingLogin(null);
        };
        window.addEventListener('pageshow', restore);
        return () => { mounted.current = false; nativeController.current?.abort(); window.removeEventListener('pageshow', restore); };
    }, []);
    useEffect(() => {
        if (!rememberNotice) return;
        const controller = new AbortController();
        api.get('/api/auth/login-policy', { skipAuthRefresh: true, signal: controller.signal })
            .then(policy => {
                if (!controller.signal.aborted) { setLoginPolicy(policy); setPolicyError(null); }
            })
            .catch(error => { if (!controller.signal.aborted) setPolicyError(error); })
            .finally(() => { if (!controller.signal.aborted) setPolicyRetrying(false); });
        return () => controller.abort();
    }, [rememberNotice, policyAttempt]);
    const [mfa, setMfa] = useState(() => new URLSearchParams(location.search).get('mfa') === '1' ? {} : null);
    const showingMfa = Boolean(mfa || browserRegistrationReference);
    useEffect(() => {
        if (!registrationRequested || isLoggedIn || showingMfa || enrollmentNoticeRef.current === location.key) return;
        enrollmentNoticeRef.current = location.key;
        fromRef.current = PASSKEY_SETTINGS;
        saveRedirect(PASSKEY_SETTINGS);
        message.info('패스키를 등록하려면 먼저 로그인해주세요.');
        const params = new URLSearchParams(location.search);
        params.delete('enroll');
        const { prevented: _prevented, ...state } = location.state || {};
        navigate({ pathname: location.pathname, search: params.size ? `?${params}` : '', hash: location.hash },
            { replace: true, state: { ...state, from: PASSKEY_RETURN } });
    }, [registrationRequested, isLoggedIn, showingMfa, location.key, location.pathname, location.search, location.hash, location.state, navigate, message]);
    const [suspendInfo, setSuspendInfo] = useState(null);

    const showSuspendModal = (status, until, reason) => {
        setSuspendInfo(suspensionInfo(status, until, reason));
    };

    useEffect(() => {
        if (registrationRequested && !isLoggedIn && !showingMfa) return;
        if (hasHandledRef.current) return;
        const params = new URLSearchParams(location.search);
        if (params.get('error') === 'oauth2' || params.get('suspended') === 'true') {
            const reference = params.get('result');
            const validReference = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(reference ?? '');
            if (validReference && oauthOutcomeRef.current?.reference !== reference) {
                // StrictMode에서 같은 브라우저의 일회용 결과를 두 번 요청하지 않는다.
                const request = api.post('/api/auth/oauth-outcome', { reference }, { skipAuthRefresh: true, timeout: 5000 })
                    .catch(() => null);
                oauthOutcomeRef.current = { reference, sessionRevision, request };
            }
            const pending = oauthOutcomeRef.current;
            const request = validReference && pending?.reference === reference && pending.sessionRevision === sessionRevision
                ? pending.request : Promise.resolve(null);
            let active = true;
            void request.then(outcome => {
                if (!active) return;
                hasHandledRef.current = true;
                if (outcome?.code === 'account_restricted' && ['SUSPENDED', 'BANNED'].includes(outcome.status)) {
                    setSuspendInfo(suspensionInfo(outcome.status, outcome.until, null));
                } else {
                    message.error(oauthOutcomeMessage(outcome?.code));
                }
                if (isLoggedIn) {
                    const deviceRetry = params.get('error') === 'oauth2' && peekSecurityReturn(user?.id)?.target === 'devices';
                    navigate(outcome || deviceRetry ? '/my-page?security=retry' : consumeLoginRedirect(fromRef.current), { replace: true });
                } else {
                    for (const key of ['error', 'result', 'message', 'suspended', 'status', 'until']) params.delete(key);
                    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash },
                        { replace: true, state: location.state });
                }
            });
            return () => { active = false; };
        }
        // 계정 경계에서 재마운트돼도 원래 요청한 경로로 돌아간다.
        if (isLoggedIn && !showingMfa) { navigate(consumeLoginRedirect(registrationRequested ? PASSKEY_SETTINGS : fromRef.current), { replace: true }); return; }

        if (location.state?.emailLoginRemoved || location.state?.loginMethodUnconfirmed
            || (unconfirmedMethod && location.state?.prevented)) {
            const { emailLoginRemoved: _removed, loginMethodUnconfirmed: _unconfirmed, prevented: _prevented, ...state } = location.state;
            navigate({ pathname: location.pathname, search: location.search, hash: location.hash },
                { replace: true, state });
            return;
        }

        if (location.state?.signupSuccess) {
            hasHandledRef.current = true;
            message.success('회원가입이 완료됐어요! 로그인해주세요.');
            navigate('/login', { replace: true, state: { from: location.state.from } });
            return;
        }

        if (location.state?.prevented) {
            hasHandledRef.current = true;
            message.warning('로그인이 필요한 서비스예요.');
            // 로그인 화면 상태에서 복귀 경로를 보존한다.

            navigate('/login', { replace: true, state: { from: location.state.from } });
            return;
        }

    }, [isLoggedIn, user?.id, sessionRevision, showingMfa, registrationRequested, unconfirmedMethod, location.state, location.pathname, location.search, location.hash, navigate, message]);

    const notifyLoginSuccess = member => {
        if (member?.id == null) return;
        message.success(member.name ? `${member.name}님, 로그인됐어요!` : '로그인됐어요.');
    };
    const continueToRememberLogin = (path, passkey = false) => {
        if (path) saveRedirect(path);
        navigate('/oauth2/callback?remember=1', { replace: true,
            ...(passkey ? { state: { passkeyReturn: { path, prevented: preventedRef.current } } } : {}) });
    };
    const completeLogin = (member, offerRemember = false) => {
        login(member);
        if (offerRemember) { continueToRememberLogin(fromRef.current, true); return; }
        notifyLoginSuccess(member);
        const target = consumeLoginRedirect(fromRef.current);
        const direction = preventedRef.current && target !== '/' ? 'from-right' : 'from-left';
        navigate(target, { replace: true, state: { reserveRouteMotion: direction } });
    };
    const openMfa = view => {
        setMfa(view);
        if (view.purpose !== 'RISK_LOGIN') return;
        const params = new URLSearchParams(location.search);
        if (params.get('mfa') === '1') return;
        params.set('mfa', '1');
        navigate({ pathname: location.pathname, search: `?${params}`, hash: location.hash }, { replace: true, state: location.state });
    };
    const nativePasskeyLogin = async (view, offerRemember) => {
        if (!mounted.current) return;
        const controller = new AbortController();
        nativeController.current = controller;
        const completionState = { reference: view?.completionId };
        let verified;
        try {
            verified = await authenticateWithPasskey(false, controller.signal, completionState);
            if (!mounted.current || controller.signal.aborted) return;
            completionState.reference ??= verified?.completionId;
            if (verified?.purpose === 'RISK_LOGIN') {
                openMfa({ ...verified, mfaRequired: true, completionState, offerRemember });
                return;
            }
            const member = await finishMfaSession(controller.signal, false, completionState);
            if (mounted.current && !controller.signal.aborted) completeLogin(member, offerRemember);
        } catch (failure) {
            if (mounted.current && !controller.signal.aborted && !failure.isStaleSession && !failure.isSessionExpired
                && !['NotAllowedError', 'AbortError'].includes(failure.name)) {
                openMfa({ ...(verified || view), mfaRequired: true, completionState, offerRemember, initialError: failure.message });
                return;
            }
            throw failure;
        }
    };
    const onLoginSubmit = async (values) => {
        if (loginAttempt.current) return;
        loginAttempt.current = true;
        setPendingLogin('password');
        try {
            const res = await api.post(API_ENDPOINTS.AUTH.LOGIN, { ...values, rememberMe }, { withCredentials: true });
            if (!mounted.current) return;
            if (res?.mfaRequired) {
                openMfa(res);
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
            if (err?.status === 401) {
                message.error('이메일 또는 비밀번호가 올바르지 않아요. 소셜 로그인만 사용한다면 연결한 서비스로 로그인해주세요.');
                return;
            }
            const msg = typeof err === 'string' ? err : err?.message;
            message.error(msg || '이메일 또는 비밀번호를 확인해주세요.');
        } finally {
            loginAttempt.current = false;
            if (mounted.current) setPendingLogin(null);
        }
    };

    const handlePasskeyLogin = async () => {
        if (loginAttempt.current) return;
        loginAttempt.current = true;
        setPendingLogin('passkey');
        try {
            const view = await api.post('/api/auth/mfa/passkey/login', { rememberMe }, { skipAuthRefresh: true });
            if (!mounted.current) return;
            await nativePasskeyLogin(view, !rememberMe);
        } catch (failure) {
            if (!mounted.current || failure.isSessionExpired || failure.isStaleSession || nativeController.current?.signal.aborted) return;
            await api.post('/api/auth/mfa/cancel', undefined, { skipAuthRefresh: true }).catch(() => {});
            if (['NotAllowedError', 'AbortError'].includes(failure.name)) message.info('패스키 인증을 취소했어요.');
            else message.error(failure.message || '패스키 인증을 다시 시도해주세요.');
        }
        finally { loginAttempt.current = false; if (mounted.current) setPendingLogin(null); }
    };

    const handleSocialLogin = (provider) => {
        if (loginAttempt.current) return;
        loginAttempt.current = true;
        setPendingLogin('social');
        try {
            if (fromRef.current) saveRedirect(fromRef.current);
            socialNavigation.current = true;
            window.location.href = oauthAuthorizationUrl(provider, undefined, rememberMe);
        } catch (error) {
            socialNavigation.current = false;
            loginAttempt.current = false;
            setPendingLogin(null);
            message.error(error.message || '소셜 로그인을 시작하지 못했어요. 다시 시도해주세요.');
        }
    };

    return (
        <PageContainer size="sm" paddingTop="80px" center>
            <div className="fade-in-up">
                {!showingMfa && <><PageTitle aria-label="로그인" className="reserve-auth-title" style={styles.title}><LockOutlined aria-hidden="true" /></PageTitle>
                <PageDescription style={styles.subtitle} role={removedEmailLoginProvider || unconfirmedMethod ? 'status' : undefined}>
                    {removedEmailLoginProvider
                        ? '이메일 로그인을 해제했어요. ' + removedEmailLoginProvider + '로 다시 로그인해주세요.'
                        : unconfirmedMethod ? loginMethodRecoveryText(unconfirmedMethod) : '예약이 필요한 순간, RESERVE'}
                </PageDescription></>}

                {showingMfa ? <MfaFlow page initialView={mfa?.mfaRequired ? mfa : undefined}
                    onAuthenticated={() => {
                        const params = new URLSearchParams(location.search);
                        if (!params.has('mfa')) return;
                        params.delete('mfa');
                        const state = params.get('security') === '1'
                            ? { ...location.state, from: { pathname: '/my-page', search: '?security=verified' } }
                            : location.state;
                        navigate({ pathname: location.pathname, search: params.size ? `?${params}` : '', hash: location.hash },
                            { replace: true, state });
                    }}
                    onDone={(member, { home = false, deviceRegistration = false } = {}) => {
                        const params = new URLSearchParams(location.search);
                        const securityAction = params.get('security') === '1';
                        if (!securityAction && (params.get('remember') === '1' || mfa?.offerRemember)) {
                            continueToRememberLogin(home ? '/' : fromRef.current, Boolean(mfa?.offerRemember));
                            return;
                        }
                        if ((!securityAction || home) && !deviceRegistration) notifyLoginSuccess(member);
                        const target = securityAction && !home ? '/my-page?security=verified' : consumeLoginRedirect(fromRef.current);
                        navigate(home ? '/' : target, { replace: true });
                    }}
                    onCancel={() => { setMfa(null); navigate('/login', { replace: true }); }} /> : <>
                <Form onFinish={onLoginSubmit} layout="vertical" size="large" requiredMark={false}>
                    <Form.Item name="email" rules={VALIDATION_RULES.loginEmail}>
                        <FormInput type="email" placeholder="이메일 주소" autoComplete="username webauthn" />
                    </Form.Item>
                    <Form.Item name="password" rules={VALIDATION_RULES.loginPassword}>
                        <FormInput type="password" placeholder="비밀번호" autoComplete="current-password" />
                    </Form.Item>

                    <Flex justify="space-between" align="center" className="reserve-login-tools">
                        <Checkbox checked={rememberMe} disabled={loading}
                            onChange={event => { if (event.target.checked) setRememberNotice(true); else setRememberMe(false); }}>
                            로그인 유지
                        </Checkbox>
                        <Flex align="center">
                            <IconTool label="패스키 등록" icon={<SafetyCertificateOutlined />} disabled={loading}
                                onClick={() => {
                                    fromRef.current = PASSKEY_SETTINGS;
                                    saveRedirect(PASSKEY_SETTINGS);
                                    message.info('패스키를 등록하려면 먼저 로그인해주세요.');
                                    navigate('/login', { replace: true, state: { from: PASSKEY_RETURN } });
                                }} />
                            <IconTool label="비밀번호 찾기" icon={<MailOutlined />} disabled={loading}
                                onClick={() => navigate('/forgot-password')} />
                        </Flex>
                    </Flex>
                    <div className="reserve-login-actions">
                        <Button variant="primary" htmlType="submit" loading={pendingLogin === 'password'} disabled={loading && pendingLogin !== 'password'} block icon={<LockOutlined />}>로그인</Button>
                        <Button variant="secondary" htmlType="button" loading={pendingLogin === 'passkey'} disabled={loading && pendingLogin !== 'passkey'} icon={<LockOutlined />}
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

                <Flex vertical gap={12} className="reserve-login-help" style={{ marginTop: 32 }} align="center">
                    <Text type="secondary" style={{ fontSize: fontSize.base }}>
                        계정이 없으신가요? <TextLink to="/signup" className="reserve-auth-accent-link">회원가입</TextLink>
                    </Text>
                    <Text type="secondary" style={{ fontSize: fontSize.base }}>
                        계정이 <TextLink to="/account-recovery" className="reserve-auth-accent-link">잠기거나</TextLink>{' 혹은 '}
                        <TextLink to="/account-recovery?type=withdrawn" className="reserve-auth-accent-link">복구</TextLink>가 필요하신가요?
                    </Text>
                </Flex>
                </>}
            </div>

            <Modal title={<Flex align="center" gap={8}><InfoCircleOutlined aria-hidden="true" />로그인 유지</Flex>}
                open={rememberNotice} centered okText="로그인 유지하기" cancelText="취소"
                onOk={() => { setRememberMe(true); setRememberNotice(false); }} onCancel={() => setRememberNotice(false)}>
                <Typography.Paragraph>개인 기기에서만 사용해주세요. 공용 PC에서는 사용 후 꼭 로그아웃해주세요.</Typography.Paragraph>
                {policyError && <DataState compact state="error" title="로그인 유지 안내를 불러오지 못했어요."
                    error={policyError} retrying={policyRetrying} onRetry={() => { setPolicyRetrying(true); setPolicyAttempt(value => value + 1); }} />}
                <Typography.Paragraph type="secondary">{loginPolicy?.idleSeconds && loginPolicy?.absoluteSeconds
                    ? '일반 회원은 ' + lifetimeLabel(loginPolicy.idleSeconds) + ' 동안 사용하지 않거나 로그인한 지 '
                        + lifetimeLabel(loginPolicy.absoluteSeconds) + '이 지나면 다시 로그인해요.'
                    : '일정 기간 접속하지 않거나 로그인 유지 기간이 끝나면 다시 로그인해야 해요.'}</Typography.Paragraph>
                {loginPolicy?.browserIdleSeconds > 0 && <Typography.Paragraph type="secondary">
                    로그인 유지 없이 사용하면 {lifetimeLabel(loginPolicy.browserIdleSeconds)} 동안 세션이 갱신되지 않을 때 로그인이 만료돼요.
                </Typography.Paragraph>}
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

function LegacyLogin() {
    useDocumentTitle('로그인');
    return <PageContainer size="sm" paddingTop="80px" center>
        <PageTitle>새 앱에서 로그인해주세요</PageTitle>
        <PageDescription>패스키도 새 주소에서 사용할 수 있어요.</PageDescription>
        <TextLink href={APP_ORIGIN + '/login'}>새 앱에서 로그인</TextLink>
    </PageContainer>;
}

export default function Login() {
    return isLegacyAppOrigin() ? <LegacyLogin /> : <LoginForm />;
}
