import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form, Typography, Flex, Checkbox } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import Button from '../common/Button';
import FormInput from '../common/FormInput';
import AnimatedContent from '../common/AnimatedContent';
import CopyableText from '../common/CopyableText';
import IconTool from '../common/IconTool';
import MfaCredentialRow from './MfaCredentialRow';
import { PageTitle, PageDescription } from '../common/PageTypography';
import { SafetyCertificateOutlined, LockOutlined, MobileOutlined, CheckOutlined, DisconnectOutlined, ReloadOutlined, PlusOutlined, ArrowLeftOutlined, CloseOutlined } from '../common/icons';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { authenticateWithPasskey, finishMfaSession } from '../../utils/mfaAuthentication';
import { AUTHENTICATION_BACK } from '../../utils/authenticationNavigation';
import { fontSize } from '../../styles/tokens';
import useMessage from '../../hooks/useMessage';
import useReducedMotion from '../../hooks/useReducedMotion';
import { revealSecurityPanel } from '../../utils/securityReturn';
import { isCurrentSession, currentSession } from '../../api/sessionScope';

const config = { skipAuthRefresh: true };
const post = (path, data) => api.post('/api/auth/mfa/' + path, data, config);
function MfaAction({ page, label, icon, loading, disabled, htmlType = 'button', onClick, variant = 'primary', kind = 'tool' }) {
    return page ? <Button variant={variant} size="lg" block icon={icon} loading={loading} disabled={disabled} htmlType={htmlType} onClick={onClick}>{label}</Button>
        : <IconTool label={label} icon={icon} loading={loading} disabled={disabled} htmlType={htmlType} onClick={onClick} kind={kind} />;
}
MfaAction.propTypes = { page: PropTypes.bool, label: PropTypes.string.isRequired, icon: PropTypes.node.isRequired,
    loading: PropTypes.bool, disabled: PropTypes.bool, htmlType: PropTypes.oneOf(['button', 'submit']), onClick: PropTypes.func, variant: PropTypes.string,
    kind: PropTypes.oneOf(['navigation', 'tool']) };
export default function MfaFlow({ ref, initialView, settings, page = false, revealOnMount = true, onDone, onCancel, onVerified, allowRememberBrowser = false }) {
    const revision = useAuthStore(state => state.sessionRevision);
    const { message } = useMessage();
    const [view, setView] = useState(initialView);
    const [rememberBrowser, setRememberBrowser] = useState(initialView?.rememberedBrowser === true);
    const [setup, setSetup] = useState(null);
    const [codes, setCodes] = useState(null);
    const [busy, setBusy] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [statusRetry, setStatusRetry] = useState(0);
    const initialNotice = useRef(null);
    const [method, setMethod] = useState(initialView?.preferredFactor || null);
    const [emailSent, setEmailSent] = useState(false);
    const active = useRef(false);
    const controller = useRef(null);
    const completion = useRef(initialView?.completionState || {});
    const mounted = useRef(true);
    const sectionRef = useRef(null);
    const reducedMotion = useReducedMotion();
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; controller.current?.abort(); };
    }, []);
    useEffect(() => {
        if (!initialView?.initialError || initialNotice.current === initialView.initialError) return;
        initialNotice.current = initialView.initialError;
        message.error(initialView.initialError);
    }, [initialView?.initialError, message]);
    const finish = async (defer = false) => {
        if (view?.completionId && completion.current.reference !== view.completionId)
            completion.current = { reference: view.completionId };
        if (view?.purpose === 'RISK_LOGIN') completion.current.rememberBrowser = rememberBrowser;
        const member = await finishMfaSession(controller.current?.signal, defer, completion.current);
        if (!mounted.current) return;
        if (completion.current.browser === 'UNAVAILABLE') message.info('로그인은 완료했지만 브라우저를 기억하지 못했어요. 다음 로그인에서 다시 확인할 수 있어요.');
        useAuthStore.getState().login(member);
        onDone?.(member);
    };
    const perform = async (action, totpAvailable = view?.totpAvailable) => {
        if (active.current) return;
        active.current = true;
        setBusy(true);
        try { await action(); }
        catch (failure) {
            if (!mounted.current || failure.isSessionExpired || failure.isStaleSession) return;
            const cancelled = ['NotAllowedError', 'AbortError'].includes(failure.name);
            if (cancelled) message.info('패스키 인증을 취소했어요. 다른 방법으로 확인할 수 있어요.');
            else message.error(failure.message || '인증을 다시 시작해주세요.');
            if (cancelled && totpAvailable) setMethod('TOTP');
        }
        finally { active.current = false; if (mounted.current) setBusy(false); }
    };
    const enrolled = async result => {
        if (!mounted.current) return;
        setSetup(null);
        setView(current => ({ ...current, verified: true, enrollmentRequired: false, purpose: 'LOGIN' }));
        if (result.codes?.length) setCodes(result.codes);
        else await finish();
    };
    const verify = async (kind, proof) => {
        const request = () => post('verify', { kind, proof });
        const result = kind === 'BACKUP' ? await useAuthStore.getState().withAuthTransition(request) : await request();
        if (!mounted.current) return;
        setView(result);
        if (result.completionId && completion.current.reference !== result.completionId)
            completion.current = { reference: result.completionId };
        if (result.purpose === 'MANAGE') { if (onVerified) await onVerified({ ...result, rememberBrowser }); }
        else await finish();
    };
    const passkey = (registration, availableView = view) => perform(async () => {
        controller.current = new AbortController();
        const result = await authenticateWithPasskey(registration, controller.current.signal);
        if (!mounted.current) return;
        if (registration) await enrolled(result);
        else {
            setView(result);
            if (result.completionId && completion.current.reference !== result.completionId)
                completion.current = { reference: result.completionId };
            if (result.purpose === 'MANAGE') { if (onVerified) await onVerified({ ...result, rememberBrowser }); }
            else await finish();
        }
    }, availableView?.totpAvailable);
    const receiveInitial = useEffectEvent(result => {
        setLoadFailed(false);
        setView(result);
        setRememberBrowser(result.rememberedBrowser === true);
        if (result.passkeyAvailable && !result.enrollmentRequired && !result.verified
            && !result.initialError && !result.preferredFactor) void passkey(false, result);
    });
    useEffect(() => {
        if (initialView) return;
        let live = true;
        api.post('/api/auth/mfa/status', undefined, config).then(result => { if (live) receiveInitial(result); })
            .catch(failure => {
                if (!live || failure.isSessionExpired || failure.isStaleSession) return;
                setLoadFailed(true);
                message.error(failure.message || '인증 정보를 불러오지 못했어요.');
            });
        return () => { live = false; };
    }, [initialView, revision, statusRetry, message]);
    const cancel = () => {
        void perform(async () => { await post('cancel'); if (mounted.current) onCancel?.(); });
    };
    useImperativeHandle(ref, () => ({ cancel }));
    const back = () => {
        if (active.current) return;
        if (setup) { setSetup(null); return; }
        cancel();
    };
    const goBack = useEffectEvent(back);
    useEffect(() => {
        const back = event => { event.preventDefault(); goBack(); };
        window.addEventListener(AUTHENTICATION_BACK, back);
        return () => window.removeEventListener(AUTHENTICATION_BACK, back);
    }, []);
    const changing = settings && view?.purpose === 'MANAGE' && view?.verified;
    const verifiedAction = onVerified && view?.verified;
    const verifiedLogin = view?.verified && view?.purpose !== 'MANAGE';
    const selected = method || (view?.emailAvailable ? 'EMAIL' : view?.passkeyAvailable || view?.purpose === 'PASSKEY_LOGIN' ? 'PASSKEY' : 'TOTP');
    const title = codes ? '복구코드 보관' : setup ? '인증 앱 연결'
        : changing ? '인증 수단 관리' : view?.enrollmentRequired ? '패스키 등록하기'
            : view?.purpose === 'RISK_LOGIN' ? '접속 환경 확인' : view?.purpose === 'PASSKEY_LOGIN' ? '패스키로 로그인' : '추가 인증';
    const description = codes ? '패스키나 인증 앱을 쓸 수 없을 때 사용하는 비상용 코드예요. 각 코드는 한 번만 사용할 수 있어요.'
        : setup ? '인증 앱에서 QR을 스캔하고 6자리 코드를 입력해주세요.'
            : changing ? '패스키는 등록한 환경으로 표시해요. 저장 위치는 브라우저에서 선택해요.'
                : verifiedLogin ? '본인 확인을 마쳤어요. 로그인을 계속해주세요.'
            : view?.enrollmentRequired ? '기기나 비밀번호 관리자에 저장하고, 지문·얼굴·기기 PIN으로 사용해요.'
                : view?.purpose === 'RISK_LOGIN' ? '계정 보호를 위해 접속 환경을 다시 확인해요. 본인 확인을 마치면 계속할 수 있어요.'
                    : '등록한 인증 수단으로 본인인지 확인해주세요.';
    const motionKey = codes ? 'codes' : setup ? 'totp-setup' : changing ? 'manage' : verifiedLogin ? 'verified-login' : view?.enrollmentRequired ? 'enroll' : 'verify-' + selected;
    const previousMotion = useRef(motionKey);
    useEffect(() => {
        const changed = previousMotion.current !== motionKey;
        previousMotion.current = motionKey;
        if (!page && (revealOnMount || changed)) return revealSecurityPanel(sectionRef.current, reducedMotion);
        return undefined;
    }, [page, motionKey, reducedMotion, revealOnMount]);
    const alternatives = view && view.purpose !== 'PASSKEY_LOGIN' && <Flex gap={16} wrap className="reserve-mfa-alternatives">
        {view.passkeyAvailable && selected !== 'PASSKEY' && <IconTool label="패스키 사용" icon={<LockOutlined aria-hidden="true" />} disabled={busy} onClick={() => { setMethod('PASSKEY'); void passkey(false); }} />}
        {view.totpAvailable && selected !== 'TOTP' && <IconTool label="인증 앱 사용" icon={<MobileOutlined aria-hidden="true" />} disabled={busy} onClick={() => setMethod('TOTP')} />}
        {!view.emailAvailable && selected !== 'BACKUP' && <IconTool label="복구코드 사용" icon={<SafetyCertificateOutlined aria-hidden="true" />} disabled={busy} onClick={() => setMethod('BACKUP')} />}
    </Flex>;
    const registrationActions = <>
        <MfaAction page={page} label="패스키 추가" icon={<PlusOutlined aria-hidden="true" />} disabled={busy} onClick={() => passkey(true)} />
        {(!settings || !settings.credentials.some(value => value.kind === 'TOTP')) && <MfaAction page={page} label="인증 앱 연결"
            variant="secondary" icon={<MobileOutlined aria-hidden="true" />} disabled={busy}
            onClick={() => perform(async () => { const result = await post('totp/setup'); if (mounted.current) setSetup(result); })} />}
    </>;
    return <AnimatedContent motionKey={motionKey}><section ref={sectionRef} tabIndex={-1} aria-label="추가 인증" data-sentry-block aria-busy={busy} className={`reserve-mfa-flow${!page ? ' reserve-mfa-flow--settings' : ''}`}>
        {page ? <>
            <PageTitle style={{ textAlign: 'center', marginBottom: 12 }}><SafetyCertificateOutlined aria-hidden="true" /> {title}</PageTitle>
            <PageDescription style={{ textAlign: 'center', marginBottom: 48 }}>{description}</PageDescription>
        </> : <>
            <Typography.Title level={5} className="reserve-mfa-title" style={{ fontSize: fontSize.base, marginBottom: 8 }}><SafetyCertificateOutlined aria-hidden="true" /> {title}</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: fontSize.sm }}>{description}</Typography.Paragraph>
        </>}
        {loadFailed && <div className="reserve-mfa-verification-actions"><IconTool label="인증 정보 다시 불러오기" icon={<ReloadOutlined aria-hidden="true" />}
            disabled={busy} onClick={() => { setLoadFailed(false); setStatusRetry(value => value + 1); }} /></div>}
        {(view?.purpose === 'RISK_LOGIN' || allowRememberBrowser) && !codes && !setup && <Typography.Paragraph>
            <Checkbox checked={rememberBrowser} disabled={busy} onChange={event => setRememberBrowser(event.target.checked)}>이 브라우저를 30일 동안 기억해요.</Checkbox>
            <br /><Typography.Text type="secondary">공용 기기에서는 선택하지 마세요.</Typography.Text>
        </Typography.Paragraph>}
        {codes ? <>
            <ul aria-label="복구코드" className="reserve-mfa-recovery-codes">{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul>
            <div className={!page ? 'reserve-mfa-verification-actions' : undefined}><MfaAction page={page} label="보관했어요" icon={<CheckOutlined aria-hidden="true" />} loading={busy} onClick={() => perform(() => finish())} /></div>
        </> : setup ? <>
            <div className="reserve-mfa-qr"><QRCodeSVG value={setup.uri} size={180} marginSize={4} title="인증 앱 등록 QR" /></div>
            <div className="reserve-mfa-manual-key">
                <Typography.Text type="secondary">QR을 스캔할 수 없나요? 아래 키를 직접 입력해주세요.</Typography.Text>
                <CopyableText value={setup.secret} label="인증 앱 등록 키" />
            </div>
            <Form layout="vertical" requiredMark={false} onFinish={({ code }) => perform(async () => enrolled(await post('totp/confirm', { code })))}>
                <Form.Item name="code" label="인증 앱 코드" rules={[{ pattern: /^[0-9]{6}$/, required: true, message: '6자리 코드를 입력해주세요.' }]}>
                    <FormInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6자리 인증 코드" />
                </Form.Item>
                <div className={!page ? 'reserve-mfa-verification-actions' : undefined}>
                    {!page && <MfaAction label="뒤로" icon={<ArrowLeftOutlined aria-hidden="true" />} variant="ghost-sm" kind="navigation" disabled={busy} onClick={back} />}
                    <MfaAction page={page} label="등록" htmlType="submit" icon={<CheckOutlined aria-hidden="true" />} loading={busy} />
                </div>
            </Form>
        </> : verifiedAction ? <div className={!page ? 'reserve-mfa-verification-actions' : undefined}>
            <MfaAction page={page} label="변경 계속하기" icon={<CheckOutlined aria-hidden="true" />} loading={busy}
                onClick={() => perform(() => onVerified({ ...view, rememberBrowser }))} />
        </div> : verifiedLogin ? <div className={!page ? 'reserve-mfa-verification-actions' : undefined}>
            <MfaAction page={page} label="로그인 계속하기" icon={<CheckOutlined aria-hidden="true" />} loading={busy} onClick={() => perform(() => finish())} />
        </div> : view?.enrollmentRequired || changing ? <>
            {!changing && <div className={!page ? 'reserve-mfa-management-actions' : (!settings || !settings.credentials.some(value => value.kind === 'TOTP')) ? 'reserve-login-actions' : undefined}>{registrationActions}</div>}
            {!changing && view.canDeferEnrollment && <div className="reserve-auth-secondary-actions">
                <Button variant="ghost-sm" disabled={busy} onClick={() => perform(() => finish(true))}>다음에 할게요</Button>
            </div>}
            {changing && <>
                {settings.credentials.map(value => <MfaCredentialRow key={value.id} credential={value} busy={busy}
                    lastRequired={settings.required && !settings.localAdminResetAvailable && settings.credentials.length <= 1}
                    onRemove={id => perform(() => useAuthStore.getState().withAuthTransition(async () => {
                        const session = currentSession().epoch;
                        const result = await post('remove', { id });
                        if (!mounted.current || !isCurrentSession(session)) return;
                        if (result?.sessionRenewed) {
                            const member = await api.get('/api/member/me', config);
                            if (!mounted.current || !isCurrentSession(session)) return;
                            useAuthStore.getState().updateUser(member);
                            onDone?.(member);
                        } else {
                            useAuthStore.getState().logout();
                            onCancel?.();
                        }
                    }))} />)}
                <div className="reserve-mfa-management-actions reserve-mfa-management-actions--secondary">
                    {registrationActions}
                    <IconTool label="복구코드 재발급" icon={<ReloadOutlined aria-hidden="true" />} disabled={busy}
                        onClick={() => perform(() => useAuthStore.getState().withAuthTransition(async () => {
                            const result = await post('recovery'); if (mounted.current) setCodes(result.codes);
                        }))} />
                    {!settings.required && <IconTool label="추가 인증 해제" icon={<DisconnectOutlined aria-hidden="true" />} disabled={busy} onClick={() => perform(async () => {
                        await post('disable'); useAuthStore.getState().logout(); onCancel?.();
                    })} />}
                </div>
            </>}
        </> : view && <>
            {selected === 'EMAIL' ? <Form layout="vertical" requiredMark={false}
                onFinish={({ code }) => perform(() => verify('EMAIL', code))}>
                <Typography.Paragraph type="secondary">{emailSent ? '인증 코드를 보냈어요. 계정 이메일에서 확인해주세요.' : '코드발송을 누르면 계정 이메일로 인증 코드를 보내요.'}</Typography.Paragraph>
                <Form.Item name="code" label="이메일 인증 코드" rules={[{ pattern: /^[0-9]{6}$/, required: true, message: '6자리 코드를 입력해주세요.' }]}>
                    <FormInput.WithButton inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6자리 인증 코드"
                        buttonText={emailSent ? '재발송' : '코드발송'} buttonLoading={busy}
                        onButtonClick={() => perform(async () => { await post('email/send'); if (mounted.current) setEmailSent(true); })} />
                </Form.Item>
                {emailSent && <div className={!page ? 'reserve-mfa-verification-actions' : undefined}>
                    <MfaAction page={page} label="확인" htmlType="submit" icon={<CheckOutlined aria-hidden="true" />} loading={busy} />
                </div>}
            </Form> : selected === 'PASSKEY' ? <div className={!page ? 'reserve-mfa-verification-actions' : undefined}>
                <MfaAction page={page} label="패스키로 확인" icon={<LockOutlined aria-hidden="true" />} loading={busy} onClick={() => passkey(false)} />
                {!page && alternatives}
            </div>
                : <Form key={selected} layout="vertical" requiredMark={false}
                    onFinish={({ code }) => perform(() => verify(selected, code))}>
                    <Form.Item name="code" label={selected === 'BACKUP' ? '복구코드' : '인증 앱 코드'}
                        rules={[{ required: true, ...(selected === 'TOTP' ? { pattern: /^[0-9]{6}$/ } : {}), message: selected === 'TOTP' ? '6자리 코드를 입력해주세요.' : '복구코드를 입력해주세요.' }]}>
                        <FormInput inputMode={selected === 'BACKUP' ? 'text' : 'numeric'} maxLength={selected === 'BACKUP' ? 128 : 6}
                            autoComplete="one-time-code" placeholder={selected === 'BACKUP' ? '일회용 복구코드' : '6자리 인증 코드'} />
                    </Form.Item>
                    <div className={!page ? 'reserve-mfa-verification-actions' : undefined}>
                        <MfaAction page={page} label="확인" htmlType="submit" icon={<CheckOutlined aria-hidden="true" />} loading={busy} />
                        {!page && alternatives}
                    </div>
                </Form>}
            {page && alternatives}
        </>}
        {!page && !codes && !setup && !settings && <div className="reserve-auth-secondary-actions">
            <MfaAction page={page} label="닫기" icon={<CloseOutlined aria-hidden="true" />}
                variant="ghost-sm" disabled={busy} onClick={back} />
        </div>}
    </section></AnimatedContent>;
}
MfaFlow.propTypes = { ref: PropTypes.object, initialView: PropTypes.object, settings: PropTypes.object, page: PropTypes.bool, revealOnMount: PropTypes.bool,
    onDone: PropTypes.func, onCancel: PropTypes.func, onVerified: PropTypes.func, allowRememberBrowser: PropTypes.bool };
