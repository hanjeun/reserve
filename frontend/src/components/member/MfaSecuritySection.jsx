import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import FormInput from '../common/FormInput';
import IconTool from '../common/IconTool';
import { EditOutlined, PlusOutlined } from '../common/icons';
import { Bone, DataState } from '../common';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';
import LoginMethodFormActions from './LoginMethodFormActions';
import MfaFlow from './MfaFlow';
import styles from './myPageStyles';

export default function MfaSecuritySection({ loginMethods, disabled = false }) {
    const navigate = useNavigate();
    const location = useLocation();
    const sectionRef = useRef(null);
    const flowRef = useRef(null);
    const revision = useAuthStore(state => state.sessionRevision);
    const [load, setLoad] = useState(null);
    const [retry, setRetry] = useState(0);
    const [view, setView] = useState(null);
    const [action, setAction] = useState(null);
    const [panel, setPanel] = useState({ revision, open: location.hash === '#account-security' });
    const currentAction = action?.revision === revision ? action : null;
    const error = currentAction?.error || '';
    const busy = currentAction?.busy || false;
    const status = load?.revision === revision ? load.status : null;
    const loadError = load?.revision === revision ? load.error : null;
    const open = panel.revision === revision && panel.open;
    const reducedMotion = useReducedMotion();
    const { shouldRender, isClosing } = useExitAnimation(open, reducedMotion ? 0 : 200);
    const close = () => {
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
        if (status && location.hash === '#account-security') {
            sectionRef.current?.scrollIntoView?.({ block: 'start' });
            navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true });
        }
    }, [status, location.hash, location.pathname, location.search, navigate]);
    const manage = async ({ password } = {}) => {
        setAction({ revision, busy: true });
        try {
            const value = await api.post('/api/member/mfa/manage', { password }, { skipAuthRefresh: true });
            if (useAuthStore.getState().sessionRevision === revision) setView({ revision, value });
        } catch (failure) {
            if (useAuthStore.getState().sessionRevision === revision) setAction({ revision, error: failure.message });
        } finally {
            setAction(previous => previous?.revision === revision ? { ...previous, busy: false } : previous);
        }
    };
    const begin = () => {
        if (open) {
            if (flowRef.current) flowRef.current.cancel();
            else close();
            return;
        }
        setView(null);
        setAction(null);
        setPanel({ revision, open: true });
        if (status.required && status.enabled || loginMethods.socialProofFresh) void manage();
    };
    if (status && !status.available && !status.enabled) return null;
    const showPassword = loginMethods.passwordEnabled && (!status?.enabled || !status.required);
    const needsSocialProof = !showPassword && !(status?.required && status?.enabled) && !loginMethods.socialProofFresh;
    const label = status?.enabled ? '패스키·인증 앱 관리' : '패스키·인증 앱 등록';
    return <div role="group" aria-label="패스키 및 인증 앱" data-sentry-block style={{ display: 'contents' }}>
        <div ref={sectionRef} id="account-security" style={styles.loginMethodLabel}>
            <Typography.Text strong>패스키 및 인증 앱</Typography.Text>
            {!status && !loadError ? <Bone height={16} /> : <Typography.Text style={styles.loginMethodHint}>
                {loadError ? '불러오지 못했어요.' : status.required ? status.enabled ? '연결됨 · 필수' : '등록 필요' : status.enabled ? '연결됨 · 선택 사용' : '연결하지 않음 · 선택 사항'}
            </Typography.Text>}
        </div>
        <div style={styles.loginMethodActions}>
            <IconTool label={label} icon={status?.enabled ? <EditOutlined aria-hidden="true" /> : <PlusOutlined aria-hidden="true" />}
                disabled={disabled || busy || !status} active={open} onClick={begin} />
        </div>
        {loadError && <div style={{ gridColumn: '1 / -1' }}><DataState state="error" title="인증 수단을 불러오지 못했어요." error={loadError}
            compact onRetry={() => setRetry(value => value + 1)} /></div>}
        {shouldRender && <div className="reserve-login-security-panel" inert={!open || isClosing ? true : undefined}
            aria-hidden={!open || isClosing || undefined} style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateRows: '1fr',
                animation: reducedMotion ? 'none' : !open || isClosing ? 'reserve-feed-replies-exit 200ms ease-in both' : 'reserve-feed-replies-enter 200ms ease-out both' }}>
            <div style={{ minHeight: 0, overflow: 'hidden' }}><div style={{ paddingTop: 20 }}>
                {error && <Typography.Paragraph role="alert">{error}</Typography.Paragraph>}
                {view?.revision === revision ? <MfaFlow ref={flowRef} initialView={view.value} settings={status} onDone={close} onCancel={close} />
                    : <Form key={revision} aria-label={label} layout="vertical" requiredMark={false} onFinish={manage}>
                        {showPassword && <Form.Item name="password" label="현재 비밀번호" rules={[{ required: !loginMethods.socialProofFresh, message: '현재 비밀번호를 입력해주세요.' }]}>
                            <FormInput type="password" autoComplete="current-password" maxLength={64} disabled={busy} />
                        </Form.Item>}
                        {needsSocialProof && <Typography.Paragraph style={styles.loginMethodHint}>위의 연결된 소셜 계정으로 본인 확인을 먼저 진행해주세요.</Typography.Paragraph>}
                        <LoginMethodFormActions submitLabel={label} submitText="확인" busy={busy}
                            unavailableReason={needsSocialProof ? '연결된 소셜 계정으로 본인 확인을 먼저 진행해주세요.' : ''} />
                    </Form>}
            </div></div>
        </div>}
    </div>;
}
MfaSecuritySection.propTypes = { loginMethods: PropTypes.object.isRequired, disabled: PropTypes.bool };
