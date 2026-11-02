import { useCallback, useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import FormInput from '../common/FormInput';
import IconTool from '../common/IconTool';
import { EditOutlined, PlusOutlined } from '../common/icons';
import { Bone, DataState } from '../common';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import SocialLoginButton from '../common/SocialLoginButton';
import { revealSecurityPanel } from '../../utils/securityReturn';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';
import LoginMethodFormActions from './LoginMethodFormActions';
import MfaFlow from './MfaFlow';
import styles from './myPageStyles';
import { mfaCredentialName } from '../../utils/passkey';
import useMessage from '../../hooks/useMessage';

export default function MfaSecuritySection({ loginMethods, disabled = false, resumeRequest, onIntentChange, onSocialProof }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { message } = useMessage();
    const sectionRef = useRef(null);
    const groupRef = useRef(null);
    const panelId = useId();
    const flowRef = useRef(null);
    const activeManage = useRef(null);
    const resumed = useRef(null);
    const surfaceRef = useRef(null);
    const returnReveal = useRef(null);
    const revision = useAuthStore(state => state.sessionRevision);
    const [load, setLoad] = useState(null);
    const [retry, setRetry] = useState(0);
    const [view, setView] = useState(null);
    const [action, setAction] = useState(null);
    const [panel, setPanel] = useState({ revision, open: location.hash === '#account-security' });
    const currentAction = action?.revision === revision ? action : null;
    const busy = currentAction?.busy || false;
    const status = load?.revision === revision ? load.status : null;
    const loadError = load?.revision === revision ? load.error : null;
    const open = panel.revision === revision && panel.open;
    const reducedMotion = useReducedMotion();
    const { shouldRender, isClosing } = useExitAnimation(open, reducedMotion ? 0 : 200);
    const close = () => {
        returnReveal.current?.();
        onIntentChange?.('mfa', false);
        groupRef.current?.querySelector('button.reserve-icon-tool')?.focus({ preventScroll: true });
        setPanel({ revision, open: false });
        if (!useAuthStore.getState().isLoggedIn) navigate('/login');
    };
    useEffect(() => {
        const controller = new AbortController();
        api.get('/api/member/mfa', { signal: controller.signal }).then(value => {
            if (!controller.signal.aborted) setLoad({ revision, status: value });
        }).catch(failure => { if (!controller.signal.aborted) setLoad({ revision, error: failure }); });
        return () => controller.abort();
    }, [revision, retry]);
    useEffect(() => {
        return () => { activeManage.current?.controller.abort(); activeManage.current = null; returnReveal.current?.(); };
    }, [revision]);
    useEffect(() => {
        if (status && location.hash === '#account-security') {
            sectionRef.current?.scrollIntoView?.({ block: 'start' });
            navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true });
        }
    }, [status, location.hash, location.pathname, location.search, navigate]);
    const manage = useCallback(async ({ password } = {}) => {
        if (activeManage.current) return;
        const operation = { controller: new AbortController() };
        activeManage.current = operation;
        setAction({ revision, busy: true });
        try {
            const value = await api.post('/api/member/mfa/manage', { password }, { skipAuthRefresh: true, signal: operation.controller.signal });
            if (!operation.controller.signal.aborted && useAuthStore.getState().sessionRevision === revision) setView({ revision, value });
        } catch (failure) {
            if (!operation.controller.signal.aborted && useAuthStore.getState().sessionRevision === revision
                && !failure.isSessionExpired && !failure.isStaleSession) message.error(failure.message || '인증 수단 관리를 시작하지 못했어요.');
        } finally {
            if (activeManage.current === operation) activeManage.current = null;
            if (!operation.controller.signal.aborted) setAction(previous => previous?.revision === revision ? { ...previous, busy: false } : previous);
        }
    }, [revision, message]);
    const begin = event => {
        if (activeManage.current) return;
        event.currentTarget.focus({ preventScroll: true });
        if (open) {
            if (flowRef.current) flowRef.current.cancel();
            else close();
            return;
        }
        setView(null);
        setAction(null);
        onIntentChange?.('mfa', true);
        setPanel({ revision, open: true });
        if (status.required && status.enabled || loginMethods.socialProofFresh) void manage();
    };
    useEffect(() => {
        if (!resumeRequest?.key || resumeRequest.revision !== revision || resumeRequest.memberId !== useAuthStore.getState().user?.id
            || resumed.current === resumeRequest.key || !status || disabled || !status.available && !status.enabled) return undefined;
        const frame = requestAnimationFrame(() => {
            resumed.current = resumeRequest.key;
            setPanel({ revision, open: true }); setView(null); setAction(null);
            onIntentChange?.('mfa', true);
            if (status.required && status.enabled || loginMethods.socialProofFresh) void manage();
            returnReveal.current?.();
            returnReveal.current = revealSecurityPanel(() => surfaceRef.current || sectionRef.current, reducedMotion);
        });
        return () => cancelAnimationFrame(frame);
    }, [resumeRequest, status, disabled, revision, loginMethods.socialProofFresh, onIntentChange, manage, reducedMotion]);
    if (status && !status.available && !status.enabled) return null;
    const showPassword = loginMethods.passwordEnabled && (!status?.enabled || !status.required);
    const needsSocialProof = !showPassword && !(status?.required && status?.enabled) && !loginMethods.socialProofFresh;
    const label = status?.enabled ? '패스키·인증 앱 관리' : '패스키·인증 앱 등록';
    const credentialNames = status?.credentials?.map(mfaCredentialName) || [];
    const connection = credentialNames.length ? `${credentialNames.join(' · ')} 연결됨` : '연결됨';
    return <div ref={groupRef} role="group" aria-label="패스키 및 인증 앱" data-sentry-block style={{ display: 'contents' }}>
        <div ref={sectionRef} id="account-security" style={styles.loginMethodLabel}>
            <Typography.Text strong>패스키 및 인증 앱</Typography.Text>
            {!status && !loadError ? <Bone height={16} /> : <Typography.Text style={styles.loginMethodHint}>
                {loadError ? '불러오지 못했어요.' : status.required ? status.enabled ? `${connection} · 필수` : '등록 필요' : status.enabled ? `${connection} · 선택 사용` : '연결하지 않음 · 선택 사항'}
            </Typography.Text>}
        </div>
        <div style={styles.loginMethodActions}>
            <IconTool label={label} icon={status?.enabled ? <EditOutlined aria-hidden="true" />
                : <PlusOutlined aria-hidden="true" className={`reserve-login-setup-icon${open ? ' is-open' : ''}`} />}
                disabled={disabled || busy || !status} active={open} expanded={open} controls={panelId} onClick={begin} />
        </div>
        {loadError && <div style={{ gridColumn: '1 / -1' }}><DataState state="error" title="인증 수단을 불러오지 못했어요." error={loadError}
            compact onRetry={() => setRetry(value => value + 1)} /></div>}
        {shouldRender && <div id={panelId} className="reserve-login-security-panel" inert={!open || isClosing ? true : undefined}
            style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateRows: '1fr',
                animation: reducedMotion ? 'none' : !open || isClosing ? 'reserve-feed-replies-exit 200ms ease-in both' : 'reserve-feed-replies-enter 200ms ease-out both' }}>
            <div style={{ minHeight: 0, overflow: 'hidden' }}><div ref={surfaceRef} tabIndex={-1} className="reserve-login-security-surface">
                {view?.revision === revision ? <MfaFlow ref={flowRef} initialView={view.value} settings={status} onDone={() => { setRetry(value => value + 1); close(); }} onCancel={close} />
                    : <Form key={revision} aria-label={label} layout="vertical" requiredMark={false} onFinish={manage}>
                        {showPassword && <Form.Item name="password" label="현재 비밀번호" rules={[{ required: !loginMethods.socialProofFresh, message: '현재 비밀번호를 입력해주세요.' }]}>
                            <FormInput type="password" autoComplete="current-password" maxLength={64} disabled={busy} />
                        </Form.Item>}
                        {needsSocialProof && <>
                            <Typography.Paragraph style={styles.loginMethodHint}>연결된 소셜 계정으로 본인 확인을 먼저 진행해주세요.</Typography.Paragraph>
                            {onSocialProof && loginMethods.socialProvider && <SocialLoginButton provider={loginMethods.socialProvider.toLowerCase()}
                                label="연결된 소셜 계정으로 본인 확인" disabled={busy || disabled} onClick={onSocialProof} />}
                        </>}
                        <LoginMethodFormActions submitLabel={label} submitText="확인" busy={busy}
                            unavailableReason={needsSocialProof ? '연결된 소셜 계정으로 본인 확인을 먼저 진행해주세요.' : ''} />
                    </Form>}
            </div></div>
        </div>}
    </div>;
}
MfaSecuritySection.propTypes = { loginMethods: PropTypes.object.isRequired, disabled: PropTypes.bool,
    resumeRequest: PropTypes.object, onIntentChange: PropTypes.func, onSocialProof: PropTypes.func };
