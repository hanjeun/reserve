import { useCallback, useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Divider, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Bone, DataState } from '../common';
import IconTool from '../common/IconTool';
import { DisconnectOutlined, EditOutlined, PlusOutlined } from '../common/icons';
import SocialLoginButton from '../common/SocialLoginButton';
import Tooltip from '../common/Tooltip';
import { useMessage } from '../../hooks';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';
import { memberService } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import { handleApiError } from '../../utils/errorHandler';
import { oauthAuthorizationUrl } from '../../utils/oauthAuthorization';
import MfaSecuritySection from './MfaSecuritySection';
import PasswordTab from './PasswordTab';
import { LoginMethodPasswordProof, LoginMethodPasswordSetup } from './LoginMethodForms';
import styles from './myPageStyles';

const PROVIDERS = [['NAVER', '네이버'], ['KAKAO', '카카오'], ['GOOGLE', 'Google']];
const { Text } = Typography;
const rowStyle = { display: 'contents' };
const methodLabelStyle = styles.loginMethodLabel;
const methodActionsStyle = styles.loginMethodActions;
const hintStyle = styles.loginMethodHint;

export default function LoginSecuritySection({ user, initialPasswordOpen = false, children }) {
    const { message, confirm } = useMessage();
    const navigate = useNavigate();
    const revision = useAuthStore(state => state.sessionRevision);
    const [load, setLoad] = useState(null);
    const [pendingState, setPendingState] = useState(null);
    const [panel, setPanel] = useState(null);
    const [proofPanel, setProofPanel] = useState(null);
    const proofPanelId = useId();
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
                if (initialPassword.current && result.passwordEnabled) setPanel({ kind: 'change-password', owner, open: true });
                initialPassword.current = false;
            }).catch(error => { if (!controller.signal.aborted && owns(owner)) setLoad({ key: loadKey, status: null, error }); });
        }
        const restore = () => { if (owns(owner)) { active.current = null; setPending(false); setRetry(value => value + 1); } };
        const pageshow = event => { if (event.persisted) restore(); };
        window.addEventListener('pageshow', pageshow);
        return () => { mounted.current = false; controller.abort(); window.removeEventListener('pageshow', pageshow); };
    }, [scope, owns, retry, loadKey, setPending]);

    const passwordBusy = useCallback((value, operation) => {
        if (value) { active.current = operation; setPending(true); }
        else if (active.current === operation) { active.current = null; setPending(false); }
    }, [setPending]);

    const perform = async (owner, action, onSuccess) => {
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
                handleApiError(error, message, '로그인 방법을 변경하지 못했어요.');
                if (error.status === 428) setRetry(value => value + 1);
            }
            return undefined;
        } finally {
            if (active.current === operation && !navigating) { active.current = null; if (owns(owner)) setPending(false); }
        }
    };
    const changed = text => {
        message.success(text);
        useAuthStore.getState().logout();
        navigate('/login', { replace: true, state: { reserveRouteMotion: 'from-right' } });
    };
    const oauth = (owner, provider, currentPassword, reauthenticate = false) => perform(owner,
        () => memberService.beginLoginMethodOAuth(owner.id, { provider, currentPassword, reauthenticate }), result => {
            const expected = `/oauth2/authorization/${provider.toLowerCase()}?account_link=`;
            if (typeof result.authorizationUrl !== 'string' || !result.authorizationUrl.startsWith(expected)) throw new Error('로그인 요청을 확인하지 못했어요.');
            window.location.assign(oauthAuthorizationUrl(provider, result.authorizationUrl.slice(expected.length)));
            return 'navigating';
        });
    const open = kind => setPanel({ kind, owner: scope(), open: true });
    const closePanel = () => setPanel(current => current && { ...current, open: false });
    const removePassword = () => {
        const owner = scope();
        confirm({ title: '이메일 로그인을 해제할까요?', content: '연결된 소셜 계정으로만 로그인하게 돼요.\n회원 정보와 가게·예약 데이터는 유지돼요.',
            okText: '해제', onOk: () => perform(owner, () => memberService.removeLoginMethodPassword(owner.id),
                () => changed('이메일 로그인을 해제했어요. 소셜 계정으로 다시 로그인해주세요.')) });
    };
    const busy = pending || loading;
    const ready = status && status.memberId === user?.id && !loading && !loadError;
    const providerName = PROVIDERS.find(([key]) => key === status?.socialProvider)?.[1];
    const emailSetupReason = status?.passwordEnabled ? '' : '먼저 이메일 로그인을 설정해주세요. 로그인 방법은 최소 하나를 유지해야 해요.';
    const visibleProviders = PROVIDERS.filter(([provider]) => provider === (status?.socialProvider || status?.linkableSocialProvider));
    const ownsPanel = panel?.owner.id === user?.id && panel?.owner.revision === revision;
    const panelOpen = Boolean(ownsPanel && ready && panel?.open);
    const reducedMotion = useReducedMotion();
    const { shouldRender: renderPanel, isClosing: panelClosing } = useExitAnimation(panelOpen, reducedMotion ? 0 : 200);
    const needsSocialProof = Boolean(status?.socialProvider && !status.socialProofFresh);
    const proofOpen = Boolean(ready && needsSocialProof && proofPanel?.key === loadKey && proofPanel.open);
    const { shouldRender: renderProof, isClosing: proofClosing } = useExitAnimation(proofOpen, reducedMotion ? 0 : 200);
    const setupOpen = proofOpen || panelOpen && panel?.kind === 'setup-password';
    const toggleProof = () => setProofPanel({ key: loadKey, open: !proofOpen });
    const togglePasswordSetup = () => {
        if (needsSocialProof) toggleProof();
        else if (panelOpen && panel?.kind === 'setup-password') closePanel();
        else open('setup-password');
    };

    return <section aria-label="로그인 및 보안" style={{ ...styles.tabsCard, marginTop: 24 }} aria-busy={busy}>
        <Text strong style={styles.sectionTitle}>로그인 및 보안</Text>
        <Text style={{ ...hintStyle, marginTop: -8, marginBottom: 16 }}>로그인 방법을 바꿔도 회원 정보와 이용 내역은 유지돼요.</Text>
        {loading && <div aria-label="로그인 방법을 불러오는 중">{[0, 1, 2, 3].map(row => <Bone key={row} height={44} style={{ marginBottom: 12 }} />)}</div>}
        {loadError && <DataState state="error" title="로그인 방법을 불러오지 못했어요." error={loadError}
            onRetry={() => setRetry(value => value + 1)} retrying={loading} compact />}
        {ready && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 12, alignItems: 'center' }}>
            <div style={rowStyle}><div style={methodLabelStyle}><Text strong>이메일 로그인</Text><Text style={hintStyle}>{status.passwordEnabled ? status.email : '설정하지 않음'}</Text></div>
                <div style={methodActionsStyle}>
                    {status.passwordEnabled ? <>
                        <IconTool label="비밀번호 변경" icon={<EditOutlined aria-hidden="true" />} disabled={busy}
                            active={panelOpen && panel?.kind === 'change-password'} onClick={() => open('change-password')} />
                        {status.socialProvider && <IconTool label="이메일 로그인 해제" icon={<DisconnectOutlined aria-hidden="true" />}
                            disabled={busy} active={proofOpen} expanded={needsSocialProof ? proofOpen : undefined}
                            controls={needsSocialProof ? proofPanelId : undefined} onClick={needsSocialProof ? toggleProof : removePassword} />}
                    </> : <IconTool label="이메일 로그인 설정" icon={<PlusOutlined aria-hidden="true" className={`reserve-login-setup-icon${setupOpen ? ' is-open' : ''}`} />} disabled={busy}
                        active={setupOpen} expanded={needsSocialProof ? proofOpen : undefined}
                        controls={needsSocialProof ? proofPanelId : undefined} onClick={togglePasswordSetup} />}
                </div>
            </div>
            {renderProof && needsSocialProof && proofPanel?.key === loadKey && <div id={proofPanelId}
                className="reserve-login-security-proof" inert={!proofOpen || proofClosing ? true : undefined}
                aria-hidden={!proofOpen || proofClosing || undefined}
                style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateRows: '1fr', animation: reducedMotion ? 'none'
                    : !proofOpen || proofClosing ? 'reserve-feed-replies-exit 200ms ease-in both' : 'reserve-feed-replies-enter 200ms ease-out both' }}>
                <div style={{ minHeight: 0, overflow: 'hidden' }}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 12, alignItems: 'center' }}>
                <Text style={{ ...hintStyle, ...methodLabelStyle }}>이메일 로그인 설정·해제 전 {providerName}로 본인 확인이 필요해요.</Text>
                <div style={methodActionsStyle}>
                <Tooltip title={`${providerName}로 본인 확인`}><SocialLoginButton provider={status.socialProvider.toLowerCase()}
                    label={`${providerName}로 본인 확인`} disabled={busy}
                    onClick={() => oauth(scope(), status.socialProvider, undefined, true)} /></Tooltip>
                </div>
                </div></div>
            </div>}
            {visibleProviders.map(([provider, label]) => <div key={provider} style={rowStyle}>
                <div style={methodLabelStyle}><Text strong>소셜 로그인</Text><Text style={hintStyle}>{label} {status.socialProvider === provider ? '연결됨' : '연결하지 않음'}</Text></div>
                <div style={methodActionsStyle}>
                {status.socialProvider === provider
                    ? <IconTool label={`${label} 로그인 연결 해제`} icon={<DisconnectOutlined aria-hidden="true" />} disabled={busy}
                        active={panelOpen && panel?.kind === 'unlink'} unavailableReason={emailSetupReason} onClick={() => open('unlink')} />
                    : <Tooltip title={`${label} 연결`}><SocialLoginButton provider={provider.toLowerCase()}
                        label={`${label} 연결`} disabled={busy} onClick={() => open(`link:${provider}`)} /></Tooltip>}
                </div>
            </div>)}
            <MfaSecuritySection loginMethods={status} disabled={busy} />
            </div>
            {!status.socialProvider && visibleProviders.length === 0 && <Text style={{ ...hintStyle, marginTop: 12 }}>이 이메일은 소셜 로그인 연결을 지원하지 않아요. 이메일 로그인은 계속 사용할 수 있어요.</Text>}
            <Text style={{ ...hintStyle, marginTop: 12 }}>소셜 계정은 한 개를 연결할 수 있어요. 로그인 방법은 최소 하나를 유지해주세요.</Text>
            {renderPanel && ownsPanel && <div key={panel.kind} className="reserve-login-security-panel" inert={!panelOpen || panelClosing ? true : undefined}
                aria-hidden={!panelOpen || panelClosing || undefined}
                style={{ display: 'grid', gridTemplateRows: '1fr', animation: reducedMotion ? 'none'
                    : !panelOpen || panelClosing ? 'reserve-feed-replies-exit 200ms ease-in both' : 'reserve-feed-replies-enter 200ms ease-out both' }}>
                <div style={{ minHeight: 0, overflow: 'hidden' }}><div style={{ paddingTop: 20 }}>
                {panel.kind === 'change-password' && <PasswordTab onBusyChange={passwordBusy} onCancel={closePanel} />}
                {panel.kind.startsWith('link:') && <LoginMethodPasswordProof busy={pending} submitText={`${PROVIDERS.find(([key]) => key === panel.kind.slice(5))?.[1]} 계정으로 연결하기`} actionText="연결"
                    onCancel={closePanel} onSubmit={password => oauth(panel.owner, panel.kind.slice(5), password)} />}
                {panel.kind === 'unlink' && <><Text style={{ ...hintStyle, marginBottom: 12 }}>RESERVE의 소셜 로그인 연결을 해제해요. 공급자에 남은 서비스 동의는 해당 계정 설정에서 관리할 수 있어요.</Text>
                    <LoginMethodPasswordProof busy={pending} submitText="연결 해제" onCancel={closePanel}
                        onSubmit={password => perform(panel.owner, () => memberService.unlinkSocialLogin(panel.owner.id, password),
                            () => changed('소셜 로그인 연결을 해제했어요. 이메일로 다시 로그인해주세요.'))} /></>}
                {panel.kind === 'setup-password' && status.socialProofFresh && <LoginMethodPasswordSetup email={status.email} busy={pending} onCancel={closePanel}
                    onError={text => message.error(text)}
                    onSend={email => perform(panel.owner, () => memberService.sendLoginMethodCode(panel.owner.id, email), () => message.success('인증 코드를 발송했어요.'))}
                    onSubmit={data => perform(panel.owner, () => memberService.setLoginMethodPassword(panel.owner.id, data),
                        () => changed('이메일 로그인을 설정했어요. 다시 로그인해주세요.'))} />}
                </div></div>
            </div>}
        </>}
        {children && <><Divider />{children}</>}
    </section>;
}
LoginSecuritySection.propTypes = { user: PropTypes.object, initialPasswordOpen: PropTypes.bool, children: PropTypes.node };
