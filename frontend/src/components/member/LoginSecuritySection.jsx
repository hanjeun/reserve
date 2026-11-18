import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Divider, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bone, DataState } from '../common';
import IconTool from '../common/IconTool';
import { DisconnectOutlined, EditOutlined, PlusOutlined } from '../common/icons';
import SocialLoginButton from '../common/SocialLoginButton';
import Tooltip from '../common/Tooltip';
import { useMessage } from '../../hooks';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';
import AnimatedContent from '../common/AnimatedContent';
import CollapsibleContent from '../common/CollapsibleContent';
import { memberService } from '../../services';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { handleApiError, isResponseUnconfirmed } from '../../utils/errorHandler';
import { loginMethodRecoveryText, runLoginMethodMutation } from '../../utils/loginMethodRecovery';
import { oauthAuthorizationUrl, SOCIAL_LOGIN_LABELS, socialLoginLabel } from '../../utils/oauthAuthorization';
import { saveSecurityReturn, peekSecurityReturn, takeSecurityReturn, revealSecurityPanel } from '../../utils/securityReturn';
import MfaSecuritySection from './MfaSecuritySection';
import PasswordTab from './PasswordTab';
import RegisteredDevicesPanel from './RegisteredDevicesPanel';
import { LoginMethodPasswordProof, LoginMethodPasswordSetup, LoginMethodSocialProof } from './LoginMethodForms';
import styles from './myPageStyles';
import useSensitiveAccountAction from '../../hooks/useSensitiveAccountAction';
import UnderlinedTextButton from '../common/UnderlinedTextButton';

const PROVIDERS = Object.entries(SOCIAL_LOGIN_LABELS);
const PANEL_ACTION = { devices: 'DEVICES', 'setup-password': 'SET', unlink: 'UNLINK' };
const { Text } = Typography;
const rowStyle = { display: 'contents' };
const methodLabelStyle = styles.loginMethodLabel;
const methodActionsStyle = styles.loginMethodActions;
const hintStyle = styles.loginMethodHint;
const canManageDevices = status => status?.deviceSessionsAvailable || status?.browserTrust && status.browserTrust !== 'DISABLED';

export default function LoginSecuritySection({ user, initialPasswordOpen = false, children }) {
    const { message, confirm } = useMessage();
    const sensitive = useSensitiveAccountAction();
    const navigate = useNavigate();
    const location = useLocation();
    const confirmationNotice = useRef(null);
    const returnReveal = useRef(null);
    const methodPanelRef = useRef(null);
    const [mfaResume, setMfaResume] = useState(null);
    const [deviceFactors, setDeviceFactors] = useState(null);
    const reducedMotion = useReducedMotion();
    const revision = useAuthStore(state => state.sessionRevision);
    const onSettingsChange = useCallback(settings => {
        const kinds = settings?.credentials?.map(credential => credential.kind) ?? [];
        setDeviceFactors({ revision, passkey: kinds.includes('PASSKEY'), totp: kinds.includes('TOTP'), backup: settings?.recoveryCodes > 0 });
    }, [revision]);
    const [mfaOpenRevision, setMfaOpenRevision] = useState(() => location.hash === '#account-security' ? revision : null);
    const [load, setLoad] = useState(null);
    const [recovery, setRecovery] = useState(null);
    const [pendingState, setPendingState] = useState(null);
    const [panel, setPanel] = useState(null);
    const [proofPanel, setProofPanel] = useState(null);
    const proofPanelId = useId();
    const methodPanelId = useId();
    const sectionRef = useRef(null);
    const active = useRef(null);
    const mounted = useRef(false);
    const initialPassword = useRef(initialPasswordOpen);
    const scope = useCallback(() => ({ id: user?.id, revision }), [user?.id, revision]);
    const owns = useCallback(owner => mounted.current && useAuthStore.getState().user?.id === owner.id
        && useAuthStore.getState().sessionRevision === owner.revision, []);
    const [retry, setRetry] = useState(0);
    const loadKey = `${user?.id}:${revision}:${retry}`;
    const status = load?.key === loadKey ? load.status : null;
    const loadError = load?.key === loadKey ? load.error : null;
    const loading = load?.key !== loadKey;
    const pending = pendingState?.key === loadKey && pendingState.value;
    const setPending = useCallback(value => setPendingState({ key: loadKey, value }), [loadKey]);

    const perform = async (owner, action, onSuccess, onError) => {
        if (!owns(owner) || active.current) return undefined;
        const operation = Symbol();
        active.current = operation; setPending(true);
        let navigating = false;
        try {
            const result = await action();
            if (!owns(owner) || active.current !== operation) return undefined;
            navigating = onSuccess?.(result) === 'navigating';
            return result;
        } catch (error) {
            if (owns(owner) && active.current === operation) {
                if (onError) onError(error);
                else {
                    if (error.name !== 'AbortError') handleApiError(error, message, '로그인 방법을 변경하지 못했어요.');
                    if (error.status === 428) setRetry(value => value + 1);
                }
            }
            return undefined;
        } finally {
            if (active.current === operation && !navigating) { active.current = null; if (owns(owner)) setPending(false); }
        }
    };
    const changed = (text, feedback) => {
        if (text) message.success(text);
        useAuthStore.getState().logout();
        navigate('/login', { replace: true, state: { reserveRouteMotion: 'from-right', ...feedback } });
    };
    const returnToLoginAfterUnknown = attempt => {
        if (!owns(attempt.owner)) return;
        useAuthStore.getState().logout();
        navigate('/login', { replace: true, state: {
            reserveRouteMotion: 'from-right',
            loginMethodUnconfirmed: attempt.method,
            from: { pathname: '/my-page', hash: '#login-security' },
        } });
    };
    const checkUnconfirmedChange = async attempt => {
        if (!owns(attempt.owner)) return;
        setRecovery(attempt);
        // 저장이 끝났다면 기존 세션이 폐기돼 있을 수 있다. 이 조회는 세션을 갱신하지 않는다.
        const session = await api.get('/api/auth/session', { skipAuthRefresh: true, timeout: 4000 }).catch(() => null);
        if (session && !session.member && session.refreshPossible === false) returnToLoginAfterUnknown(attempt);
    };
    const performChange = (owner, { action, password, method, submit, onComplete }) => perform(owner,
        () => sensitive.run(action, password, () => runLoginMethodMutation(owner, method, submit, checkUnconfirmedChange)),
        completed => { if (completed) onComplete(); });
    const confirmPasswordRemoval = (owner, provider) => {
        if (!owns(owner) || active.current) return;
        const label = socialLoginLabel(provider);
        const nextLogin = label ? label + '로' : '연결된 소셜 계정으로';
        confirm({
            title: '이메일 로그인을 해제할까요?',
            content: '이메일·비밀번호 로그인이 꺼져요.\n' + nextLogin + ' 다시 로그인해주세요.\n회원 정보와 가게·예약 데이터는 유지돼요.',
            okText: '해제',
            onOk: () => performChange(owner, {
                action: 'REMOVE',
                method: provider,
                submit: () => memberService.removeLoginMethodPassword(owner.id),
                onComplete: () => label ? changed(null, { emailLoginRemoved: provider })
                    : changed('이메일 로그인을 해제했어요. 연결된 소셜 계정으로 다시 로그인해주세요.'),
            }),
        });
    };

    const focusPanelTrigger = id => {
        const trigger = sectionRef.current?.querySelector(`[aria-controls="${id}"][aria-expanded="true"]`);
        if (!trigger) return;
        const owner = scope();
        const focus = () => { if (owns(owner) && trigger.isConnected) trigger.focus({ preventScroll: true }); };
        if (trigger.disabled) requestAnimationFrame(focus);
        else focus();
    };
    const dismissMethodPanel = () => {
        returnReveal.current?.();
        focusPanelTrigger(methodPanelId);
        setPanel(current => current && { ...current, open: false });
    };
    const closePanel = () => { if (!active.current) dismissMethodPanel(); };
    const closeProofPanel = () => {
        if (active.current) return;
        returnReveal.current?.();
        focusPanelTrigger(proofPanelId);
        setProofPanel({ key: loadKey, open: false });
    };

    const updateDevicePanel = (owner, changes) => setPanel(current => current?.kind === 'devices' && current.open
        && current.owner.id === owner.id && current.owner.revision === owner.revision ? { ...current, ...changes } : current);
    const setDevices = (owner, devices) => updateDevicePanel(owner, { devices });
    const returnToDeviceChoices = (owner, changes) => {
        updateDevicePanel(owner, { passwordSelected: false, ...changes });
        methodPanelRef.current?.focus({ preventScroll: true });
    };
    const setBrowserTrust = (owner, browserTrust) => setLoad(current => current?.status?.memberId === owner.id
        ? { ...current, status: { ...current.status, browserTrust } } : current);
    const deviceError = (owner, error, changed = false) => {
        if (error.name === 'AbortError' || error.isStaleSession || error.isSessionExpired) return;
        if (changed && isResponseUnconfirmed(error)) {
            setDevices(owner, null);
            message.info('기기 변경 결과를 확인하지 못했어요. 본인 확인 후 로그인 기기에서 확인해주세요.');
            return;
        }
        if (error.status === 428) setDevices(owner, null);
        if (error.status === 503) message.error('기기 관리에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
        else handleApiError(error, message, '로그인 기기를 확인하지 못했어요.');
    };
    const confirmDeviceAccess = (owner, password, factor) => perform(owner,
        () => sensitive.run('DEVICES', password, () => memberService.getRegisteredDevices(owner.id), { factor }),
        devices => {
            setDevices(owner, devices);
            message.success('기기 관리 본인 확인을 완료했어요.');
        }, error => {
            returnToDeviceChoices(owner, {
                ...(error.codesRequirePrimary && { codesRequirePrimary: true }),
                ...(error.status === 400 && password == null && status?.deviceFactorAvailable && { primaryRequired: true }),
            });
            deviceError(owner, error);
        });
    const refreshDevices = owner => memberService.getRegisteredDevices(owner.id).catch(error => {
        if (owns(owner)) {
            setDevices(owner, null);
            deviceError(owner, error);
        }
        return undefined;
    });
    const registerDevice = owner => perform(owner, async () => {
        await memberService.registerCurrentDevice(owner.id);
        if (!owns(owner)) return undefined;
        setBrowserTrust(owner, 'REMEMBERED');
        message.success('이 기기 등록을 완료했어요.');
        return refreshDevices(owner);
    }, devices => { if (devices) setDevices(owner, devices); }, error => deviceError(owner, error, true));
    const confirmDeviceChange = (owner, device, forget) => {
        if (!owns(owner) || active.current) return;
        confirm({
            title: forget ? '이 기기 등록을 해제할까요?' : '이 기기를 로그아웃할까요?',
            content: forget ? '기기 등록이 해제돼요. 이 기기에서 다음에 로그인하면 접속 환경을 다시 확인해요.'
                : '이 기기에서 확인된 로그인 세션을 종료해요.',
            okText: forget ? '등록 해제' : '로그아웃',
            okButtonProps: { danger: true },
            onOk: () => perform(owner, async () => {
                if (forget) await memberService.forgetRegisteredDevice(owner.id, device.id);
                else await memberService.signOutRegisteredDevice(owner.id, device.id);
                if (!owns(owner)) return undefined;
                message.success(forget ? '기기 등록을 해제했어요.' : '선택한 기기의 로그인을 종료했어요.');
                if (forget && device.current) {
                    setBrowserTrust(owner, 'NOT_REMEMBERED');
                    dismissMethodPanel();
                    return undefined;
                }
                return refreshDevices(owner);
            }, devices => { if (devices) setDevices(owner, devices); }, error => deviceError(owner, error, true)),
        });
    };

    const receiveReturn = useEffectEvent((result, owner) => {
        const params = new URLSearchParams(location.search);
        const outcome = params.get('security');
        if (!['verified', 'retry'].includes(outcome) || outcome === 'verified' && !result.socialProofFresh
            || confirmationNotice.current === loadKey) return;
        confirmationNotice.current = loadKey;
        const intent = takeSecurityReturn(owner.id);
        const target = intent?.target || 'email';
        if (outcome === 'verified' && target !== 'devices') message.success('본인 확인을 완료했어요.');
        if (target === 'mfa') setMfaResume({ key: loadKey, target, memberId: owner.id, revision: owner.revision });
        else if (target === 'remove-password' && result.passwordEnabled && result.socialProvider
            && outcome === 'verified' && result.socialProofFresh) {
            returnReveal.current?.();
            confirmPasswordRemoval(owner, result.socialProvider);
        } else {
            if (target === 'remove-password' && result.passwordEnabled && result.socialProvider && !result.socialProofFresh) {
                setProofPanel({ key: loadKey, open: true });
            } else if (target === 'setup-password' && !result.passwordEnabled) {
                if (result.socialProofFresh) setPanel({ kind: target, owner, open: true });
                else if (result.socialProvider) setProofPanel({ key: loadKey, open: true });
            } else if (target === 'change-password' && result.passwordEnabled
                || target === 'unlink' && result.passwordEnabled && result.socialProvider) setPanel({ kind: target, owner, open: true });
            else if (target === 'devices' && canManageDevices(result)) {
                setPanel({ kind: target, owner, open: true });
                if (outcome === 'verified') void confirmDeviceAccess(owner);
            }
            returnReveal.current?.();
            returnReveal.current = revealSecurityPanel(() => methodPanelRef.current || sectionRef.current, reducedMotion);
        }
        params.delete('security');
        navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '', hash: location.hash }, { replace: true });
        return true;
    });

    useEffect(() => {
        mounted.current = true;
        const owner = scope();
        const controller = new AbortController();
        active.current = null;
        if (owner.id != null) {
            memberService.getLoginMethods(controller.signal).then(result => {
                if (controller.signal.aborted || !owns(owner)) return;
                if (result.memberId !== owner.id) throw new Error('로그인 상태가 변경됐어요. 새로고침 후 다시 시도해주세요.');
                setLoad({ key: loadKey, status: result, error: null });
                const restored = receiveReturn(result, owner);
                if (!restored && initialPassword.current && result.passwordEnabled) setPanel({ kind: 'change-password', owner, open: true });
                initialPassword.current = false;
            }).catch(error => { if (!controller.signal.aborted && owns(owner)) setLoad({ key: loadKey, status: null, error }); });
        }
        const restore = () => {
            if (!owns(owner)) return;
            active.current = null;
            setPending(false);
            if (peekSecurityReturn(owner.id)?.target === 'devices' && !new URLSearchParams(window.location.search).has('security')) takeSecurityReturn(owner.id);
            setPanel(current => current?.kind === 'devices' ? { kind: 'devices', owner, open: current.open } : current);
            setRetry(value => value + 1);
        };
        const pageshow = event => { if (event.persisted) restore(); };
        window.addEventListener('pageshow', pageshow);
        return () => { mounted.current = false; controller.abort(); returnReveal.current?.(); window.removeEventListener('pageshow', pageshow); };
    }, [scope, owns, retry, loadKey, setPending]);

    const passwordBusy = useCallback((value, operation) => {
        if (value) { active.current = operation; setPending(true); }
        else if (active.current === operation) { active.current = null; setPending(false); }
    }, [setPending]);

    const onMfaIntentChange = useCallback((target, open) => {
        if (target !== 'mfa') return;
        setMfaOpenRevision(open ? revision : null);
        if (!open) return;
        returnReveal.current?.();
        setPanel(current => current?.open ? { ...current, open: false } : current);
        setProofPanel(current => current?.open ? { ...current, open: false } : current);
    }, [revision]);
    const oauth = (owner, provider, currentPassword, reauthenticate = false, resumeTarget) => {
        const target = reauthenticate ? resumeTarget : 'social';
        return perform(owner, () => {
            if (reauthenticate && !['setup-password', 'remove-password', 'mfa', 'devices'].includes(target)) throw new Error('본인 확인할 작업을 다시 선택해주세요.');
            return reauthenticate ? memberService.beginLoginMethodOAuth(owner.id, { provider, currentPassword, reauthenticate })
                : sensitive.run('LINK', currentPassword, proof => memberService.beginLoginMethodOAuth(owner.id,
                    { provider, currentPassword, reauthenticate, ...proof }));
        }, result => {
            const expected = `/oauth2/authorization/${provider.toLowerCase()}?account_link=`;
            if (typeof result.authorizationUrl !== 'string' || !result.authorizationUrl.startsWith(expected)) throw new Error('로그인 요청을 확인하지 못했어요.');
            saveSecurityReturn(owner.id, target);
            window.location.assign(oauthAuthorizationUrl(provider, result.authorizationUrl.slice(expected.length)));
            return 'navigating';
        });
    };
    const togglePanel = (kind, event) => {
        const owner = scope();
        if (!owns(owner) || active.current) return;
        event.currentTarget.focus({ preventScroll: true });
        setProofPanel(current => current && { ...current, open: false });
        setPanel(current => current?.kind === kind && current.owner.id === owner.id
            && current.owner.revision === owner.revision && current.open
            ? { ...current, open: false } : { kind, owner, open: true });
    };
    const busy = pending || loading;
    const deviceManagementAvailable = canManageDevices(status);
    const deviceUnavailable = '접속 환경 보호를 켜면 자주 사용하는 기기를 등록할 수 있어요.';
    const recoveryNotice = !pending && recovery && recovery.owner.id === user?.id && recovery.owner.revision === revision ? recovery : null;
    const ready = status && status.memberId === user?.id && !loading && !loadError && !recoveryNotice;
    const providerName = socialLoginLabel(status?.socialProvider);
    const emailProofTarget = status?.passwordEnabled ? 'remove-password' : 'setup-password';
    const emailProofTitle = status?.passwordEnabled ? '이메일 로그인 해제' : '이메일 로그인 설정';
    const emailProofLabel = `${emailProofTitle}: ${providerName}로 본인 확인`;
    const emailSetupReason = status?.passwordEnabled ? '' : '먼저 이메일 로그인을 설정해주세요. 로그인 방법은 최소 하나를 유지해야 해요.';
    const visibleProviders = PROVIDERS.filter(([provider]) => provider === (status?.socialProvider || status?.linkableSocialProvider));
    const ownsPanel = panel?.owner.id === user?.id && panel?.owner.revision === revision;
    const panelOpen = Boolean(ownsPanel && ready && panel?.open
        && (panel.kind !== 'setup-password' || status.socialProofFresh));
    const { shouldRender: renderPanel, isClosing: panelClosing } = useExitAnimation(panelOpen, reducedMotion ? 0 : 200);
    const devicesOpen = panelOpen && panel?.kind === 'devices';
    const needsSocialProof = Boolean(status?.socialProvider && !status.socialProofFresh);
    const proofOpen = Boolean(ready && needsSocialProof && proofPanel?.key === loadKey && proofPanel.open);
    const { shouldRender: renderProof, isClosing: proofClosing } = useExitAnimation(proofOpen, reducedMotion ? 0 : 200);
    const setupOpen = proofOpen || panelOpen && panel?.kind === 'setup-password';
    const toggleProof = event => {
        if (!owns(scope()) || active.current) return;
        event.currentTarget.focus({ preventScroll: true });
        setPanel(current => current && { ...current, open: false });
        setProofPanel({ key: loadKey, open: !proofOpen });
    };
    const togglePasswordSetup = event => {
        if (needsSocialProof) toggleProof(event);
        else togglePanel('setup-password', event);
    };
    const panelAction = panel?.kind.startsWith('link:') ? 'LINK' : PANEL_ACTION[panel?.kind];
    const panelConfirmation = panelAction === sensitive.action ? sensitive.panel : null;
    const panelStep = panelConfirmation ? 'confirm' : panel?.kind === 'devices'
        ? panel.devices ? 'devices-list' : panel.passwordSelected ? 'devices-password' : 'devices-choice'
        : panel?.kind || '';
    const methodPanel = renderPanel && ownsPanel && <div ref={methodPanelRef} tabIndex={-1} id={methodPanelId} key={panel.kind} className="reserve-login-security-panel"
        inert={!panelOpen || panelClosing ? true : undefined}
        style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateRows: '1fr', animation: reducedMotion ? 'none'
            : !panelOpen || panelClosing ? 'reserve-feed-replies-exit 200ms ease-in both' : 'reserve-feed-replies-enter 200ms ease-out both' }}>
        <div style={{ minHeight: 0, overflow: 'hidden' }}><div className="reserve-login-security-surface">
        <AnimatedContent motionKey={panelStep} ready={panelOpen}>
        {panelConfirmation || <>
        {panel.kind === 'devices' && <RegisteredDevicesPanel devices={panel.devices} status={status} busy={pending} providerName={providerName}
            directProof={status?.deviceFactorAvailable && !panel.primaryRequired} factors={deviceFactors?.revision === revision ? deviceFactors : undefined}
            codesRequirePrimary={panel.codesRequirePrimary} passwordSelected={panel.passwordSelected}
            onUsePassword={() => updateDevicePanel(panel.owner, { passwordSelected: true })}
            onBackToChoices={() => returnToDeviceChoices(panel.owner)}
            onProof={(password, factor) => confirmDeviceAccess(panel.owner, password, factor)}
            onSocialProof={() => oauth(panel.owner, status.socialProvider, undefined, true, 'devices')}
            onRegister={() => registerDevice(panel.owner)}
            onForget={device => confirmDeviceChange(panel.owner, device, true)}
            onSignOut={device => confirmDeviceChange(panel.owner, device, false)} onClose={closePanel} />}
        {panel.kind === 'change-password' && <PasswordTab onBusyChange={passwordBusy} onCancel={closePanel} onUnconfirmed={checkUnconfirmedChange} />}
        {panel.kind.startsWith('link:') && <LoginMethodPasswordProof busy={pending}
            submitText={`${socialLoginLabel(panel.kind.slice(5))} 계정으로 연결하기`} actionText="연결"
            description="소셜 계정을 연결해도 이메일 로그인은 유지돼요. 필요한 본인 확인을 먼저 마친 뒤 연결하고 로그인을 이어가요."
            onCancel={closePanel} onSubmit={password => oauth(panel.owner, panel.kind.slice(5), password)} />}
        {panel.kind === 'unlink' && <LoginMethodPasswordProof busy={pending} submitText="연결 해제" onCancel={closePanel}
            description="RESERVE의 소셜 로그인 연결을 해제해요. 공급자에 남은 서비스 동의는 해당 계정 설정에서 관리할 수 있어요."
            onSubmit={password => performChange(panel.owner, {
                action: 'UNLINK', password, method: 'EMAIL',
                submit: () => memberService.unlinkSocialLogin(panel.owner.id, password),
                onComplete: () => changed('소셜 로그인 연결을 해제했어요. 이메일로 다시 로그인해주세요.'),
            })} />}
        {panel.kind === 'setup-password' && status?.socialProofFresh && <LoginMethodPasswordSetup email={status.email} busy={pending}
            onError={text => message.error(text)}
            onSend={email => perform(panel.owner, () => memberService.sendLoginMethodCode(panel.owner.id, email), () => message.success('인증 코드를 발송했어요.'))}
            onSubmit={data => performChange(panel.owner, {
                action: 'SET', method: status.socialProvider,
                submit: () => memberService.setLoginMethodPassword(panel.owner.id, data),
                onComplete: () => changed('이메일 로그인을 설정했어요. 다시 로그인해주세요.'),
            })} />}
        </>}
        </AnimatedContent>
        </div></div>
    </div>;

    return <section ref={sectionRef} id="login-security" tabIndex={-1} aria-label="로그인 및 보안" style={{ ...styles.tabsCard, marginTop: 24 }} aria-busy={busy && !sensitive.confirming}>
        <Text strong style={styles.sectionTitle}>로그인 및 보안</Text>
        <Text style={{ ...hintStyle, marginTop: -8, marginBottom: 16 }}>로그인 방법을 바꿔도 회원 정보와 이용 내역은 유지돼요.</Text>
        {loading && <div aria-label="로그인 방법을 불러오는 중">{[0, 1, 2, 3].map(row => <Bone key={row} height={44} style={{ marginBottom: 12 }} />)}</div>}
        {loadError && <DataState state="error" title="로그인 방법을 불러오지 못했어요." error={loadError}
            onRetry={() => setRetry(value => value + 1)} retrying={loading} compact />}
        {recoveryNotice && <div>
            <Text role="status" style={hintStyle}>{loginMethodRecoveryText(recoveryNotice.method)}</Text>
            <UnderlinedTextButton onClick={() => returnToLoginAfterUnknown(recoveryNotice)}>다시 로그인</UnderlinedTextButton>
        </div>}
        {ready && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 12, alignItems: 'center' }}>
            <div style={rowStyle}><div style={methodLabelStyle}><Text strong>이메일 로그인</Text><Text style={hintStyle}>{status.passwordEnabled ? status.email : '설정하지 않음'}</Text></div>
                <div style={methodActionsStyle}>
                    {status.passwordEnabled ? <>
                        <IconTool label="비밀번호 변경" icon={<EditOutlined aria-hidden="true" />} disabled={busy}
                            active={panelOpen && panel?.kind === 'change-password'} expanded={panelOpen && panel?.kind === 'change-password'}
                            controls={methodPanelId} onClick={event => togglePanel('change-password', event)} />
                        {status.socialProvider && <IconTool label="이메일 로그인 해제" icon={<DisconnectOutlined aria-hidden="true" />}
                            disabled={busy} active={proofOpen} expanded={needsSocialProof ? proofOpen : undefined}
                            controls={needsSocialProof ? proofPanelId : undefined} onClick={needsSocialProof ? toggleProof : () => confirmPasswordRemoval(scope(), status.socialProvider)} />}
                    </> : <IconTool label="이메일 로그인 설정" icon={<PlusOutlined aria-hidden="true" className={`reserve-login-setup-icon${setupOpen ? ' is-open' : ''}`} />} disabled={busy}
                        active={setupOpen} expanded={setupOpen}
                        controls={needsSocialProof ? proofPanelId : methodPanelId} onClick={togglePasswordSetup} />}
                </div>
            </div>
            {renderProof && needsSocialProof && proofPanel?.key === loadKey && <div id={proofPanelId}
                className="reserve-login-security-proof" inert={!proofOpen || proofClosing ? true : undefined}
                style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateRows: '1fr', animation: reducedMotion ? 'none'
                    : !proofOpen || proofClosing ? 'reserve-feed-replies-exit 200ms ease-in both' : 'reserve-feed-replies-enter 200ms ease-out both' }}>
                <div style={{ minHeight: 0, overflow: 'hidden' }}><div className="reserve-login-security-surface">
                <LoginMethodSocialProof title={emailProofTitle} description={status.passwordEnabled
                    ? `${providerName}로 본인 확인 후 이메일 로그인 해제 여부를 확인해요.`
                    : `${providerName}로 본인 확인 후 이메일·비밀번호 설정 화면으로 이어져요.`}
                    provider={status.socialProvider.toLowerCase()} buttonLabel={emailProofLabel} disabled={busy}
                    onConfirm={() => oauth(scope(), status.socialProvider, undefined, true, emailProofTarget)}
                    onClose={status.passwordEnabled ? closeProofPanel : undefined} />
                </div></div>
            </div>}
            <CollapsibleContent open={sensitive.action === 'REMOVE'} retainHeight bodyClassName="reserve-login-security-surface" style={{ gridColumn: '1 / -1' }}>
                {sensitive.action === 'REMOVE' && sensitive.panel}
            </CollapsibleContent>
            {['change-password', 'setup-password'].includes(panel?.kind) && methodPanel}
            {visibleProviders.map(([provider, label]) => <div key={provider} style={rowStyle}>
                <div style={methodLabelStyle}><Text strong>소셜 로그인</Text>
                    <Text style={hintStyle}>{label} {status.socialProvider === provider ? '연결됨' : '연결하지 않음'}</Text>
                </div>
                <div style={methodActionsStyle}>
                {status.socialProvider === provider
                    ? <IconTool label={`${label} 로그인 연결 해제`} icon={<DisconnectOutlined aria-hidden="true" />} disabled={busy}
                        active={panelOpen && panel?.kind === 'unlink'} expanded={panelOpen && panel?.kind === 'unlink'} controls={methodPanelId}
                        unavailableReason={emailSetupReason} onClick={event => togglePanel('unlink', event)} />
                    : <Tooltip title={`${label} 연결`}><SocialLoginButton provider={provider.toLowerCase()}
                        label={`${label} 연결`} disabled={busy} aria-expanded={panelOpen && panel?.kind === `link:${provider}`}
                        aria-controls={methodPanelId} onClick={event => togglePanel(`link:${provider}`, event)} /></Tooltip>}
                </div>
                {(panel?.kind === `link:${provider}` || panel?.kind === 'unlink' && status.socialProvider === provider) && methodPanel}
            </div>)}
            <MfaSecuritySection loginMethods={status} disabled={busy || devicesOpen} resumeRequest={mfaResume?.key === loadKey ? mfaResume : null} onIntentChange={onMfaIntentChange}
                onSettingsChange={onSettingsChange} onSocialProof={() => oauth(scope(), status.socialProvider, undefined, true, 'mfa')} />
            <div style={rowStyle}>
                <div style={methodLabelStyle}><Text strong>로그인 기기</Text><Text style={hintStyle}>
                    {!deviceManagementAvailable ? deviceUnavailable
                        : status.browserTrust === 'REMEMBERED' ? '이 기기 등록됨' : status.browserTrust === 'UNAVAILABLE'
                        ? '기기 등록 상태를 확인하지 못했어요.' : '본인 확인 후 기기를 관리할 수 있어요.'}
                </Text></div>
                <div style={methodActionsStyle}>
                    <IconTool label="로그인 기기 관리" icon={<PlusOutlined aria-hidden="true" className={`reserve-login-setup-icon${devicesOpen ? ' is-open' : ''}`} />}
                        disabled={busy} active={devicesOpen} expanded={devicesOpen} controls={methodPanelId}
                        unavailableReason={!deviceManagementAvailable ? deviceUnavailable
                            : mfaOpenRevision === revision ? '패스키 및 인증 앱 관리를 닫은 후 다시 시도해주세요.' : ''}
                        onClick={event => togglePanel('devices', event)} />
                </div>
                {panel?.kind === 'devices' && methodPanel}
            </div>
            </div>
            {!status.socialProvider && visibleProviders.length === 0 && <Text style={{ ...hintStyle, marginTop: 12 }}>이 이메일은 소셜 로그인 연결을 지원하지 않아요. 이메일 로그인은 계속 사용할 수 있어요.</Text>}
            <Text style={{ ...hintStyle, marginTop: 12 }}>소셜 계정은 한 개를 연결할 수 있어요. 로그인 방법은 최소 하나를 유지해주세요.</Text>
        </>}
        {children && <><Divider />{children}</>}
    </section>;
}
LoginSecuritySection.propTypes = { user: PropTypes.object, initialPasswordOpen: PropTypes.bool, children: PropTypes.node };
