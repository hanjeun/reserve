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
import LoginSecurityPanelHeading from './LoginSecurityPanelHeading';
import { PageTitle, PageDescription } from '../common/PageTypography';
import { SafetyCertificateOutlined, LockOutlined, MobileOutlined, CheckOutlined, DisconnectOutlined, ReloadOutlined, PlusOutlined } from '../common/icons';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { authenticateWithPasskey, confirmMfaEnrollment, finishMfaSession, verifyMfaProof } from '../../utils/mfaAuthentication';
import { AUTHENTICATION_BACK, AUTHENTICATION_HOME } from '../../utils/authenticationNavigation';
import { fontSize } from '../../styles/tokens';
import useMessage from '../../hooks/useMessage';
import useReducedMotion from '../../hooks/useReducedMotion';
import { revealSecurityPanel } from '../../utils/securityReturn';
import { isCurrentSession, currentSession } from '../../api/sessionScope';

const config = { skipAuthRefresh: true };
const post = (path, data) => api.post('/api/auth/mfa/' + path, data, config);
const needsRestart = failure => failure.status === 401 || failure.name === 'MfaRequestChangedError';
function MfaAction({ page, text, label, icon, loading, disabled, htmlType = 'button', onClick, variant = 'primary' }) {
    if (page || text) return <Button variant={variant} size={page ? 'lg' : 'sm'} block={page} icon={page ? icon : undefined}
        loading={loading} disabled={disabled} htmlType={htmlType} onClick={onClick}>{label}</Button>;
    return <IconTool label={label} icon={icon} loading={loading} disabled={disabled} htmlType={htmlType} onClick={onClick} />;
}
MfaAction.propTypes = { page: PropTypes.bool, text: PropTypes.bool, label: PropTypes.string.isRequired, icon: PropTypes.node.isRequired,
    loading: PropTypes.bool, disabled: PropTypes.bool, htmlType: PropTypes.oneOf(['button', 'submit']), onClick: PropTypes.func, variant: PropTypes.string };
export default function MfaFlow({ ref, initialView, settings, page = false, revealOnMount = true, onDone, onCancel, onVerified, onAuthenticated, allowRememberBrowser = false, deviceManagement = false, adminProtection = false, startWithPasskey = false }) {
    const chooseVerificationMethod = (page || Boolean(settings)) && !deviceManagement && !adminProtection;
    const revision = useAuthStore(state => state.sessionRevision);
    const browserRegistrationReference = useAuthStore(state => page ? state.browserRegistrationReference : null);
    const { message } = useMessage();
    const [view, setView] = useState(initialView);
    const [rememberBrowser, setRememberBrowser] = useState(initialView?.rememberedBrowser === true);
    const [setup, setSetup] = useState(null);
    const [codes, setCodes] = useState(null);
    const [busy, setBusy] = useState(false);
    const [loadFailure, setLoadFailure] = useState(null);
    const [statusRetry, setStatusRetry] = useState(0);
    const initialNotice = useRef(null);
    const [method, setMethod] = useState(chooseVerificationMethod ? null : initialView?.preferredFactor || null);
    const [emailSent, setEmailSent] = useState(false);
    const active = useRef(false);
    const controller = useRef(null);
    const completion = useRef(initialView?.completionState || {});
    const credentialChange = useRef(null);
    const enrollmentHold = useRef(null);
    const mounted = useRef(true);
    const sectionRef = useRef(null);
    const reducedMotion = useReducedMotion();
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; controller.current?.abort(); enrollmentHold.current?.(); enrollmentHold.current = null; };
    }, []);
    useEffect(() => {
        if (!initialView?.initialError || initialNotice.current === initialView.initialError) return;
        initialNotice.current = initialView.initialError;
        message.error(initialView.initialError);
    }, [initialView?.initialError, message]);
    const holdEnrollment = () => {
        if (enrollmentHold.current) return;
        let release;
        const pending = new Promise(resolve => { release = resolve; });
        enrollmentHold.current = release;
        void useAuthStore.getState().withAuthTransition(() => pending);
    };
    const releaseEnrollment = () => { enrollmentHold.current?.(); enrollmentHold.current = null; };
    const finish = async (defer = false, verifiedView = view) => {
        const purpose = verifiedView?.purpose;
        const reference = verifiedView?.completionId;
        if (reference && completion.current.reference !== reference) completion.current = { reference };
        if (page && purpose === 'RISK_LOGIN' && reference) completion.current.offerBrowserRegistration = true;
        let member;
        if (purpose === 'MANAGE') {
            // 복구코드 재발급은 이미 세션을 교체했으므로 관리 요청만 닫는다.
            if (!completion.current.closed) { await post('cancel'); completion.current.closed = true; }
            member = await api.get('/api/member/me', config);
        } else member = await finishMfaSession(controller.current?.signal, defer, completion.current);
        if (!mounted.current) return;
        releaseEnrollment();
        if (completion.current.browserRegistrationAvailable) {
            // 계정 캐시 경계에서 화면이 다시 만들어져도 같은 로그인에서만 선택을 이어줘요.
            onAuthenticated?.();
            useAuthStore.getState().login(member, { browserRegistrationReference: reference });
        } else {
            useAuthStore.getState().login(member);
            onDone?.(member);
        }
    };
    const perform = async (action, { factor, totpAvailable = view?.totpAvailable } = {}) => {
        if (active.current) return;
        active.current = true;
        setBusy(true);
        const session = currentSession().epoch;
        try { await action(); }
        catch (failure) {
            if (!mounted.current || !isCurrentSession(session) || failure.isSessionExpired || failure.isStaleSession) return;
            const cancelled = ['NotAllowedError', 'AbortError'].includes(failure.name);
            if (deviceManagement && onCancel) {
                if (cancelled || failure.name === 'CanceledError') message.info('패스키 인증을 취소했어요.');
                else message.error(needsRestart(failure)
                    ? '인증 시간이 지났거나 접속 환경이 바뀌었어요. 인증 수단을 다시 선택해주세요.'
                    : failure.message || '본인 확인을 마치지 못했어요. 인증 수단을 다시 선택해주세요.');
                onCancel();
                return;
            }
            if (needsRestart(failure)) { setLoadFailure({ restart: true }); return; }
            if (chooseVerificationMethod && factor) {
                if (factor === 'PASSKEY' && (cancelled || failure.name === 'CanceledError')) message.info('패스키 인증을 취소했어요. 인증 수단을 다시 선택해주세요.');
                else message.error(failure.message || '본인 확인을 마치지 못했어요. 인증 수단을 다시 선택해주세요.');
                setMethod(null);
                sectionRef.current?.focus({ preventScroll: true });
                return;
            }
            if (cancelled) message.info(view?.passkeyOnly ? '패스키 인증을 취소했어요. 다시 시도해주세요.' : '패스키 인증을 취소했어요. 다른 방법으로 확인할 수 있어요.');
            else message.error(failure.message || '인증을 다시 시작해주세요.');
            if (cancelled && totpAvailable) setMethod('TOTP');
        }
        finally {
            if (!completion.current.enrollmentPending && !completion.current.enrollmentConfirmed) releaseEnrollment();
            active.current = false;
            if (mounted.current) setBusy(false);
        }
    };
    const enrolled = async (result, kind) => {
        if (!mounted.current) return;
        completion.current.enrollmentConfirmed = true;
        if (result.recovered && view?.enrollmentRequired) message.info('인증 수단은 등록됐어요. 복구코드는 다시 표시할 수 없으니 로그인 및 보안에서 재발급해주세요.');
        else message.success(kind === 'PASSKEY' ? '패스키를 등록했어요.' : '인증 앱을 연결했어요.');
        setSetup(null);
        setView(current => ({ ...current, verified: true, enrollmentRequired: false, purpose: 'LOGIN' }));
        if (result.codes?.length) setCodes(result.codes);
        else await finish(false, { ...view, purpose: 'LOGIN' });
    };
    const changeCredential = (path, body, notice) => perform(() => useAuthStore.getState().withAuthTransition(async () => {
        const session = currentSession().epoch;
        const key = path + ':' + (body?.id || 'all');
        if (credentialChange.current?.session !== session) credentialChange.current = null;
        if (credentialChange.current && credentialChange.current.key !== key)
            throw new Error('해제된 인증 정보를 먼저 확인해주세요. 같은 버튼으로 다시 확인할 수 있어요.');
        if (!credentialChange.current) {
            const result = await post(path, body);
            if (!mounted.current || !isCurrentSession(session)) return;
            credentialChange.current = { key, session, result, notice };
        }
        const completed = credentialChange.current;
        if (completed.result?.sessionRenewed) {
            let member;
            try { member = await api.get('/api/member/me', config); }
            catch (failure) {
                if (failure.isSessionExpired || failure.isStaleSession) throw failure;
                throw new Error('인증 수단은 해제했지만 계정 정보를 불러오지 못했어요. 같은 버튼으로 다시 확인해주세요.', { cause: failure });
            }
            if (!mounted.current || !isCurrentSession(session)) return;
            message.success(completed.notice);
            credentialChange.current = null;
            useAuthStore.getState().updateUser(member);
            onDone?.(member);
        } else {
            message.info(completed.notice + ' 다시 로그인해주세요.');
            credentialChange.current = null;
            useAuthStore.getState().logout();
            onCancel?.();
        }
    }));
    const verify = (kind, proof) => perform(async () => {
        completion.current.reference ??= view?.completionId;
        const request = () => verifyMfaProof(kind, proof, controller.current?.signal, completion.current);
        const result = kind === 'BACKUP' ? await useAuthStore.getState().withAuthTransition(request) : await request();
        if (!mounted.current) return;
        setView(result);
        if (result.completionId && completion.current.reference !== result.completionId)
            completion.current = { reference: result.completionId };
        if (result.purpose === 'MANAGE') { if (onVerified) await onVerified({ ...result, rememberBrowser }); }
        else await finish(false, result);
    }, { factor: kind });
    const passkey = (registration, availableView = view) => perform(async () => {
        controller.current = new AbortController();
        completion.current.reference ??= availableView?.completionId;
        if (registration) holdEnrollment();
        const result = await authenticateWithPasskey(registration, controller.current.signal, completion.current);
        if (!mounted.current) return;
        if (registration) await enrolled(result, 'PASSKEY');
        else {
            setView(result);
            if (result.completionId && completion.current.reference !== result.completionId)
                completion.current = { reference: result.completionId };
            if (result.purpose === 'MANAGE') { if (onVerified) await onVerified({ ...result, rememberBrowser }); }
            else await finish(false, result);
        }
    }, { factor: registration ? undefined : 'PASSKEY', totpAvailable: availableView?.totpAvailable });
    const resumeRiskLogin = useEffectEvent(result => {
        if (page && result?.purpose === 'RISK_LOGIN' && result.verified && !completion.current.issued)
            void perform(() => finish(false, result));
    });
    const receiveInitial = useEffectEvent(result => {
        setLoadFailure(null);
        setView(result);
        setRememberBrowser(result.rememberedBrowser === true);
        if (result.verified) resumeRiskLogin(result);
        else if (!chooseVerificationMethod && result.passkeyAvailable && !result.enrollmentRequired && !result.initialError && !result.preferredFactor)
            void passkey(false, result);
    });
    useEffect(() => {
        if (browserRegistrationReference) { completion.current.issued = true; return; }
        if (completion.current.issued) return;
        if (initialView) {
            if (startWithPasskey && initialView.passkeyAvailable && !initialView.verified && !initialView.enrollmentRequired) {
                // 개발 StrictMode의 첫 정리에서 브라우저 요청을 취소하지 않도록 다음 프레임에 시작해요.
                const frame = requestAnimationFrame(() => receiveInitial(initialView));
                return () => cancelAnimationFrame(frame);
            }
            resumeRiskLogin(initialView);
            return;
        }
        const request = new AbortController();
        api.post('/api/auth/mfa/status', undefined, { ...config, signal: request.signal }).then(result => {
            if (!request.signal.aborted) receiveInitial(result);
        }).catch(failure => {
            if (request.signal.aborted || failure.isSessionExpired || failure.isStaleSession) return;
            setLoadFailure({ restart: needsRestart(failure), description: failure.message });
        });
        return () => request.abort();
    }, [initialView, revision, statusRetry, browserRegistrationReference, startWithPasskey]);
    const deviceChoice = Boolean(browserRegistrationReference);
    const chooseDevice = (register, home = false) => {
        const { user: member, browserRegistrationReference: reference, clearBrowserRegistration } = useAuthStore.getState();
        if (active.current || !member || !reference || reference !== browserRegistrationReference) return;
        const epoch = currentSession().epoch;
        if (!register) {
            clearBrowserRegistration();
            if (home) onDone?.(member, { home: true });
            else onDone?.(member);
            return;
        }
        void perform(async () => {
            try {
                await api.post('/api/member/mfa/remember-browser', { completionId: reference }, config);
            } catch (failure) {
                if (!mounted.current || !isCurrentSession(epoch)) return;
                if ([401, 428].includes(failure.status)) {
                    message.info('기기 등록 확인 시간이 지났거나 접속 환경이 바뀌었어요. 로그인 및 보안에서 다시 등록할 수 있어요.');
                    clearBrowserRegistration();
                    onDone?.(member);
                } else message.error('로그인했어요. 기기 등록 결과는 로그인 및 보안에서 확인해주세요.');
                return;
            }
            if (!mounted.current || !isCurrentSession(epoch)) return;
            message.success('이 기기 등록을 완료했어요.');
            clearBrowserRegistration();
            onDone?.(member, { deviceRegistration: true });
        });
    };
    const cancel = () => {
        if (deviceChoice) { chooseDevice(false); return; }
        if (deviceManagement || loadFailure?.restart) { onCancel?.(); return; }
        void perform(async () => { await post('cancel'); releaseEnrollment(); if (mounted.current) onCancel?.(); });
    };
    useImperativeHandle(ref, () => ({ cancel }));
    const back = () => {
        if (active.current) return;
        if (setup) { setSetup(null); return; }
        if (chooseVerificationMethod && method && !view?.verified && !loadFailure) { setMethod(null); return; }
        cancel();
    };
    const goBack = useEffectEvent(back);
    useEffect(() => {
        const back = event => { event.preventDefault(); goBack(); };
        window.addEventListener(AUTHENTICATION_BACK, back);
        return () => window.removeEventListener(AUTHENTICATION_BACK, back);
    }, []);
    const goHome = useEffectEvent(event => {
        if (!deviceChoice) return;
        event.preventDefault();
        chooseDevice(false, true);
    });
    useEffect(() => {
        if (!page) return undefined;
        const home = event => goHome(event);
        window.addEventListener(AUTHENTICATION_HOME, home);
        return () => window.removeEventListener(AUTHENTICATION_HOME, home);
    }, [page]);
    const changing = settings && view?.purpose === 'MANAGE' && view?.verified;
    const verifiedAction = onVerified && view?.verified;
    const verifiedLogin = view?.verified && view?.purpose !== 'MANAGE';
    const restart = loadFailure?.restart;
    const selected = chooseVerificationMethod ? method : view?.passkeyOnly ? 'PASSKEY'
        : method || (view?.emailAvailable ? 'EMAIL' : view?.passkeyAvailable || view?.purpose === 'PASSKEY_LOGIN' ? 'PASSKEY' : 'TOTP');
    const title = page && restart ? '인증을 다시 시작해주세요' : page && loadFailure ? '인증 정보를 불러오지 못했어요'
        : adminProtection ? '관리자 본인 확인' : deviceManagement ? '기기 관리 본인 확인' : codes ? '복구코드 보관' : setup ? '인증 앱 연결'
        : changing ? '인증 수단 관리' : view?.enrollmentRequired ? '패스키 등록하기'
            : deviceChoice ? '자주 사용하는 기기로 등록하시겠어요?'
                : view?.purpose === 'RISK_LOGIN' ? '접속 환경 확인' : view?.purpose === 'PASSKEY_LOGIN' ? '패스키로 로그인' : '추가 인증';
    const description = restart ? '접속 환경이 바뀌었거나 인증 시간이 지났어요.'
        : loadFailure ? (loadFailure.description || '잠시 후 다시 불러와주세요.')
        : adminProtection ? '등록한 패스키나 인증 앱으로 이 작업을 확인해주세요.'
        : deviceManagement ? '등록된 기기를 확인하고 관리하려면 본인 확인을 완료해주세요.'
        : codes ? '패스키나 인증 앱을 쓸 수 없을 때 사용하는 비상용 코드예요. 각 코드는 한 번만 사용할 수 있어요.'
        : setup ? '인증 앱에서 QR을 스캔하고 6자리 코드를 입력해주세요.'
            : changing ? '패스키는 등록한 환경으로 표시해요. 저장 위치는 브라우저에서 선택해요.'
                : deviceChoice ? '로그인했어요. 등록은 30일 동안 유지되고, 만료 전 같은 환경에서 다시 로그인하면 갱신돼요. 공용 기기에서는 괜찮아요를 선택해주세요.'
                    : verifiedLogin ? '본인 확인을 마쳤어요. 로그인을 계속해주세요.'
            : view?.enrollmentRequired ? '기기나 비밀번호 관리자에 저장하고, 지문·얼굴·기기 PIN으로 사용해요.'
                : view?.purpose === 'RISK_LOGIN' ? '계정 보호를 위해 접속 환경을 다시 확인해요. 본인 확인을 마치면 계속할 수 있어요.'
                    : '등록한 인증 수단으로 본인인지 확인해주세요.';
    const motionKey = restart ? 'restart' : loadFailure ? 'status-failed' : deviceChoice ? 'device-choice'
        : codes ? 'codes' : setup ? 'totp-setup' : changing ? 'manage' : verifiedLogin ? 'verified-login' : view?.enrollmentRequired ? 'enroll'
            : view ? 'verify-' + (selected || 'choice') : 'loading';
    const previousMotion = useRef(motionKey);
    useEffect(() => {
        const changed = previousMotion.current !== motionKey;
        previousMotion.current = motionKey;
        if (page && motionKey.startsWith('verify-')) sectionRef.current?.focus({ preventScroll: true });
        if (!page && (revealOnMount || changed)) return revealSecurityPanel(sectionRef.current, reducedMotion);
        return undefined;
    }, [page, motionKey, reducedMotion, revealOnMount]);
    const selectedDeviceFactor = deviceManagement && (startWithPasskey || initialView?.preferredFactor);
    const alternatives = view && !chooseVerificationMethod && !selectedDeviceFactor && !view.passkeyOnly && view.purpose !== 'PASSKEY_LOGIN' && <Flex gap={16} wrap className="reserve-mfa-alternatives">
        {view.passkeyAvailable && selected !== 'PASSKEY' && <IconTool label="패스키 사용" icon={<LockOutlined aria-hidden="true" />} disabled={busy} onClick={() => { setMethod('PASSKEY'); void passkey(false); }} />}
        {view.totpAvailable && selected !== 'TOTP' && <IconTool label="인증 앱 사용" icon={<MobileOutlined aria-hidden="true" />} disabled={busy} onClick={() => setMethod('TOTP')} />}
        {!adminProtection && !view.emailAvailable && selected !== 'BACKUP' && <IconTool label="복구코드 사용" icon={<SafetyCertificateOutlined aria-hidden="true" />} disabled={busy} onClick={() => setMethod('BACKUP')} />}
    </Flex>;
    const passkeyOnly = view?.passkeyOnly || view?.purpose === 'PASSKEY_LOGIN';
    const recoveryCodeAvailable = view?.recoveryCodeAvailable ?? (settings?.recoveryCodes !== 0 && (view?.passkeyAvailable || view?.totpAvailable));
    const verificationButtonSize = page ? 'lg' : 'md';
    const stepActions = (label, canSubmit = true) => <div className="reserve-login-actions">
        <Button size={verificationButtonSize} variant="secondary" disabled={busy} onClick={back}>이전</Button>
        <Button size={verificationButtonSize} htmlType="submit" loading={busy} disabled={!canSubmit}>{label}</Button>
    </div>;
    const codeActions = (canSubmit = true) => {
        const otherMethods = !page && selected !== 'EMAIL' && alternatives;
        if (chooseVerificationMethod || adminProtection) return <>
            {stepActions('확인', canSubmit)}
            {otherMethods}
        </>;
        return <div className="reserve-mfa-verification-actions">
            {canSubmit && <MfaAction page={page} text label="확인" htmlType="submit" icon={<CheckOutlined aria-hidden="true" />} loading={busy} />}
            {otherMethods}
        </div>;
    };
    const closeSettings = !adminProtection && !codes && !setup && (onCancel || !settings) ? cancel : undefined;
    const registrationActions = <>
        <MfaAction page={page} label="패스키 추가" icon={<PlusOutlined aria-hidden="true" />} disabled={busy} onClick={() => passkey(true)} />
        {(!settings || !settings.credentials.some(value => value.kind === 'TOTP')) && <MfaAction page={page} label="인증 앱 연결"
            variant="secondary" icon={<MobileOutlined aria-hidden="true" />} disabled={busy}
            onClick={() => perform(async () => { const result = await post('totp/setup'); if (mounted.current) setSetup(result); })} />}
    </>;
    return <AnimatedContent motionKey={motionKey}><section ref={sectionRef} tabIndex={-1} aria-label="추가 인증" data-sentry-block aria-busy={busy} className={`reserve-mfa-flow${!page ? ' reserve-mfa-flow--settings' : ''}`}>
        {page ? <>
            <PageTitle style={{ textAlign: 'center', marginBottom: 12 }}><SafetyCertificateOutlined aria-hidden="true" /> {title}</PageTitle>
            <PageDescription role={restart || loadFailure ? 'status' : undefined} style={{ textAlign: 'center', marginBottom: 48 }}>{description}</PageDescription>
        </> : <>
            <LoginSecurityPanelHeading onClose={closeSettings} disabled={busy}>
                <Typography.Title level={5} className="reserve-mfa-title" style={{ fontSize: fontSize.base, margin: 0 }}><SafetyCertificateOutlined aria-hidden="true" /> {title}</Typography.Title>
            </LoginSecurityPanelHeading>
            <Typography.Paragraph type="secondary" style={{ fontSize: fontSize.sm }}>{description}</Typography.Paragraph>
        </>}
        {allowRememberBrowser && !restart && !loadFailure && !codes && !setup && <Typography.Paragraph>
            <Checkbox checked={rememberBrowser} disabled={busy} onChange={event => setRememberBrowser(event.target.checked)}>이 브라우저를 30일 동안 기억해요.</Checkbox>
            <br /><Typography.Text type="secondary">공용 기기에서는 선택하지 마세요.</Typography.Text>
        </Typography.Paragraph>}
        {restart ? <Flex justify={page ? 'center' : 'end'}>
            <Button size={page ? 'lg' : 'sm'} onClick={cancel}>{page ? '로그인 다시 시작' : '본인 확인 다시 시작'}</Button>
        </Flex> : loadFailure ? <Flex justify={page ? 'center' : 'end'}>
            <IconTool label="인증 정보 다시 불러오기" icon={<ReloadOutlined aria-hidden="true" />} disabled={busy}
                onClick={() => { setLoadFailure(null); setStatusRetry(value => value + 1); }} />
        </Flex> : codes ? <>
            <ul aria-label="복구코드" className="reserve-mfa-recovery-codes">{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul>
            <div className={!page ? 'reserve-mfa-verification-actions' : undefined}><MfaAction page={page} text label="보관했어요" icon={<CheckOutlined aria-hidden="true" />} loading={busy} onClick={() => perform(() => finish())} /></div>
        </> : setup ? <>
            <div className="reserve-mfa-qr"><QRCodeSVG value={setup.uri} size={180} marginSize={4} title="인증 앱 등록 QR" /></div>
            <div className="reserve-mfa-manual-key">
                <Typography.Text type="secondary">QR을 스캔할 수 없나요? 아래 키를 직접 입력해주세요.</Typography.Text>
                <CopyableText value={setup.secret} label="인증 앱 등록 키" />
            </div>
            <Form layout="vertical" requiredMark={false} onFinish={({ code }) => perform(async () => {
                completion.current.reference ??= view?.completionId;
                holdEnrollment();
                await enrolled(await confirmMfaEnrollment('totp', { code }, controller.current?.signal, completion.current), 'TOTP');
            })}>
                <Form.Item name="code" label="인증 앱 코드" rules={[{ pattern: /^[0-9]{6}$/, required: true, message: '6자리 코드를 입력해주세요.' }]}>
                    <FormInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6자리 인증 코드" />
                </Form.Item>
                {stepActions('등록')}
            </Form>
        </> : verifiedAction ? <div className={!page ? 'reserve-mfa-verification-actions' : undefined}>
            <MfaAction page={page} text label={deviceManagement ? '기기 목록 보기' : '변경 계속하기'} icon={<CheckOutlined aria-hidden="true" />} loading={busy}
                onClick={() => perform(() => onVerified({ ...view, rememberBrowser }))} />
        </div> : deviceChoice ? <div className="reserve-login-actions">
            <Button size="lg" block loading={busy} disabled={busy} onClick={() => chooseDevice(true)}>등록</Button>
            <Button size="lg" variant="outline" block disabled={busy} onClick={() => chooseDevice(false)}>괜찮아요</Button>
        </div> : verifiedLogin ? <div className={!page ? 'reserve-mfa-verification-actions' : undefined}>
            <MfaAction page={page} text label="로그인 계속하기" icon={<CheckOutlined aria-hidden="true" />} loading={busy} onClick={() => perform(() => finish())} />
        </div> : view?.enrollmentRequired || changing ? <>
            {!changing && <div className={!page ? 'reserve-mfa-management-actions' : (!settings || !settings.credentials.some(value => value.kind === 'TOTP')) ? 'reserve-login-actions' : undefined}>{registrationActions}</div>}
            {!changing && view.canDeferEnrollment && <div className="reserve-auth-secondary-actions">
                <Button variant="ghost-sm" disabled={busy} onClick={() => perform(() => finish(true))}>다음에 할게요</Button>
            </div>}
            {changing && <>
                {settings.credentials.map(value => <MfaCredentialRow key={value.id} credential={value} busy={busy}
                    lastRequired={settings.required && !settings.localAdminResetAvailable && settings.credentials.length <= 1}
                    onRemove={id => changeCredential('remove', { id }, value.kind === 'PASSKEY' ? '패스키를 해제했어요.' : '인증 앱을 해제했어요.')} />)}
                <div className="reserve-mfa-management-actions reserve-mfa-management-actions--secondary">
                    {registrationActions}
                    {settings.credentials.length > 0 && <>
                        <IconTool label="복구코드 재발급" icon={<ReloadOutlined aria-hidden="true" />} disabled={busy}
                            onClick={() => perform(() => useAuthStore.getState().withAuthTransition(async () => {
                                const result = await post('recovery'); if (mounted.current) setCodes(result.codes);
                            }))} />
                        {!settings.required && <IconTool label="추가 인증 전체 해제" icon={<DisconnectOutlined aria-hidden="true" />} disabled={busy}
                            onClick={() => changeCredential('disable', { keepCurrentSession: true }, '추가 인증을 해제했어요.')} />}
                    </>}
                </div>
            </>}
        </> : view && <>
            {chooseVerificationMethod && !selected ? <div role="group" aria-label="인증 수단" className="reserve-login-actions">
                {(view.passkeyAvailable || passkeyOnly) && <Button size={verificationButtonSize} loading={busy}
                    onClick={() => passkey(false)}>패스키로 확인</Button>}
                {!passkeyOnly && view.totpAvailable && <Button size={verificationButtonSize} variant="secondary" disabled={busy}
                    onClick={() => setMethod('TOTP')}>인증 앱 코드로 확인</Button>}
                {!passkeyOnly && view.emailAvailable && <Button size={verificationButtonSize} variant="secondary" disabled={busy}
                    onClick={() => setMethod('EMAIL')}>이메일 코드로 확인</Button>}
                {!passkeyOnly && !view.emailAvailable && recoveryCodeAvailable && <Button size={verificationButtonSize} variant="secondary" disabled={busy}
                    onClick={() => setMethod('BACKUP')}>복구코드로 확인</Button>}
            </div> : selected === 'EMAIL' ? <Form layout="vertical" requiredMark={false}
                onFinish={({ code }) => { if (emailSent) verify('EMAIL', code); }}>
                <Typography.Paragraph type="secondary">{emailSent ? '인증 코드를 보냈어요. 계정 이메일에서 확인해주세요.' : '코드발송을 누르면 계정 이메일로 인증 코드를 보내요.'}</Typography.Paragraph>
                <Form.Item name="code" label="이메일 인증 코드" rules={[{ pattern: /^[0-9]{6}$/, required: true, message: '6자리 코드를 입력해주세요.' }]}>
                    <FormInput.WithButton inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6자리 인증 코드"
                        buttonText={emailSent ? '재발송' : '코드발송'} buttonLoading={busy}
                        onButtonClick={() => perform(async () => { await post('email/send'); if (mounted.current) setEmailSent(true); })} />
                </Form.Item>
                {(emailSent || chooseVerificationMethod) && codeActions(emailSent)}
            </Form> : selected === 'PASSKEY' ? <div className={!page ? 'reserve-mfa-verification-actions' : undefined}>
                <MfaAction page={page} text={!deviceManagement} label="패스키로 확인" icon={<LockOutlined aria-hidden="true" />} loading={busy} onClick={() => passkey(false)} />
                {!page && alternatives}
            </div>
                : <Form key={selected} layout="vertical" requiredMark={false}
                    onFinish={({ code }) => verify(selected, code)}>
                    <Form.Item name="code" label={selected === 'BACKUP' ? '복구코드' : '인증 앱 코드'}
                        rules={[{ required: true, ...(selected === 'TOTP' ? { pattern: /^[0-9]{6}$/ } : {}), message: selected === 'TOTP' ? '6자리 코드를 입력해주세요.' : '복구코드를 입력해주세요.' }]}>
                        <FormInput inputMode={selected === 'BACKUP' ? 'text' : 'numeric'} maxLength={selected === 'BACKUP' ? 128 : 6}
                            autoComplete="one-time-code" placeholder={selected === 'BACKUP' ? '일회용 복구코드' : '6자리 인증 코드'} />
                    </Form.Item>
                    {codeActions()}
                </Form>}
            {page && alternatives}
        </>}
    </section></AnimatedContent>;
}
MfaFlow.propTypes = { ref: PropTypes.object, initialView: PropTypes.object, settings: PropTypes.object, page: PropTypes.bool, revealOnMount: PropTypes.bool,
    onDone: PropTypes.func, onCancel: PropTypes.func, onVerified: PropTypes.func, onAuthenticated: PropTypes.func, allowRememberBrowser: PropTypes.bool, deviceManagement: PropTypes.bool, adminProtection: PropTypes.bool, startWithPasskey: PropTypes.bool };
