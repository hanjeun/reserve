import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Form } from 'antd';
import Button from '../../components/common/Button';
import FormInput from '../../components/common/FormInput';
import PageContainer from '../../components/common/PageContainer';
import SegmentedControl from '../../components/common/SegmentedControl';
import CopyableText from '../../components/common/CopyableText';
import { PageDescription, PageTitle } from '../../components/common/PageTypography';
import { SafetyCertificateOutlined } from '../../components/common/icons';
import AnimatedContent from '../../components/common/AnimatedContent';
import TextLink from '../../components/common/TextLink';
import useMessage from '../../hooks/useMessage';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../api/axios';
import { performPasskey } from '../../utils/passkey';
import { handleApiError, isResponseUnconfirmed } from '../../utils/errorHandler';
import { RecoveryEmailFields, RecoveryLoginLink } from './RecoveryFormParts';
import { CODE_EXPIRED, formatTimer, remainingSeconds } from './recoveryEmailTimer';

const RECOVERY_PATH = '/account-recovery';
const LABELS = { PASSKEY: '패스키', TOTP: '인증 앱', BACKUP: '복구코드' };
const EMAIL_REQUESTED = '요청을 받았어요. 잠긴 계정의 보안 이메일이면 인증 코드를 보내요.';
const EXPIRED = '복구 시간이 만료됐어요. 보안 이메일로 코드를 다시 받아주세요.';
const keyFrom = hash => /^#key=([A-Za-z0-9_-]{43})$/.exec(hash)?.[1] ?? null;
const post = (action, data, signal) => api.post('/api/auth/account-recovery/' + action, data, { skipAuthRefresh: true, signal });

export default function AccountRecovery() {
    const { hash, search } = useLocation();
    if (new URLSearchParams(search).get('type') === 'withdrawn' && !keyFrom(hash)) return <WithdrawnAccount />;
    return <LockedAccount />;
}

function WithdrawnAccount() {
    useDocumentTitle('탈퇴한 계정');
    return <PageContainer size="sm" paddingTop="60px" center>
        <PageTitle style={{ textAlign: 'center', marginBottom: 12 }}>탈퇴한 계정</PageTitle>
        <PageDescription style={{ textAlign: 'center', marginBottom: 32 }}>
            탈퇴가 완료되면 로그인 정보와 이메일을 지워요. 다시 이용하려면 새로 가입해주세요.
        </PageDescription>
        <div className="reserve-auth-secondary-actions"><TextLink to="/signup" className="reserve-auth-accent-link">회원가입</TextLink></div>
        <RecoveryLoginLink />
    </PageContainer>;
}

function LockedAccount() {
    const { hash } = useLocation();
    const navigate = useNavigate();
    const { message } = useMessage();
    useDocumentTitle('잠긴 계정 복구');
    const [emailForm] = Form.useForm();
    const [key, setKey] = useState(() => keyFrom(hash));
    const [methods, setMethods] = useState(null);
    const [method, setMethod] = useState(null);
    const [outcome, setOutcome] = useState(null);
    const [replacement, setReplacement] = useState(null);
    const [pending, setPending] = useState(null);
    const [emailRequest, setEmailRequest] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const controller = useRef(null);
    const active = useRef(false);
    const busy = Boolean(pending);
    const showEmailForm = !key && !methods && (!outcome || outcome === 'expired');

    useEffect(() => {
        if (!hash) return;
        navigate(RECOVERY_PATH, { replace: true });
    }, [hash, navigate]);
    useEffect(() => {
        const scope = new AbortController();
        controller.current = scope;
        return () => scope.abort();
    }, []);
    useEffect(() => {
        if (!emailRequest) return undefined;
        const update = () => setTimeLeft(remainingSeconds(emailRequest.deadline));
        const timer = setInterval(update, 1000);
        document.addEventListener('visibilitychange', update);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', update);
        };
    }, [emailRequest]);

    const perform = async (action, kind = 'proof') => {
        if (active.current || !controller.current) return;
        const { signal } = controller.current;
        active.current = true;
        setPending(kind);
        try { await action(signal); }
        catch (failure) {
            if (signal.aborted || failure.isStaleSession || failure.errorFields) return;
            if (failure.status === 401) {
                setKey(null);
                setMethods(null);
                setReplacement(null);
                setOutcome('expired');
            } else if (failure.name === 'NotAllowedError') message.info('패스키 확인을 취소했어요.');
            else handleApiError(failure, message, '계정 복구를 진행하지 못했어요.');
        } finally {
            active.current = false;
            if (!signal.aborted) setPending(null);
        }
    };
    const showMethods = view => {
        const available = [
            ...(view.passkeyAvailable ? ['PASSKEY'] : []),
            ...(view.totpAvailable ? ['TOTP'] : []),
            ...(view.recoveryCodeAvailable ? ['BACKUP'] : []),
        ];
        if (!available.length) { setOutcome('expired'); setKey(null); return; }
        setMethods(available);
        setMethod(available[0]);
        setKey(null);
        setOutcome(null);
    };
    const begin = () => perform(async signal => {
        const view = await post('start', { key }, signal);
        if (!signal.aborted) showMethods(view);
    });
    const sendEmailCode = () => perform(async signal => {
        const { email } = await emailForm.validateFields(['email']);
        if (signal.aborted) return;
        const request = await post('email/send-code', { email: email.trim() }, signal);
        if (signal.aborted) return;
        const deadline = Date.parse(request?.expiresAt);
        if (!/^[A-Za-z0-9_-]{43}$/.test(request?.reference ?? '') || !(deadline > Date.now())) {
            message.error('인증 코드 요청을 확인하지 못했어요. 다시 시도해주세요.');
            return;
        }
        emailForm.setFieldValue('verificationCode', '');
        setEmailRequest({ reference: request.reference, deadline });
        setTimeLeft(remainingSeconds(deadline));
        setOutcome(null);
        message.success(EMAIL_REQUESTED);
    }, 'send');
    const verifyEmailCode = () => {
        if (active.current || !emailRequest) return;
        const setCodeError = error => emailForm.setFields([{ name: 'verificationCode', errors: [error] }]);
        if (Date.now() >= emailRequest.deadline) return setCodeError(CODE_EXPIRED);
        const code = emailForm.getFieldValue('verificationCode')?.trim();
        if (!/^[0-9]{6}$/.test(code ?? '')) return setCodeError('6자리 인증 코드를 입력해주세요.');
        return perform(async signal => {
            try {
                const view = await post('email/verify-code', { reference: emailRequest.reference, code }, signal);
                if (signal.aborted) return;
                setEmailRequest(null);
                showMethods(view);
            } catch (failure) {
                if (signal.aborted || failure.isStaleSession) return;
                if (failure.status !== 400) throw failure;
                setCodeError('인증 코드를 확인하지 못했어요. 다시 확인하거나 새 코드를 받아주세요.');
            }
        }, 'verify');
    };
    const complete = async (kind, proof, signal) => {
        let result;
        try { result = await post('complete', { kind, proof }, signal); }
        catch (failure) {
            if (signal.aborted || !isResponseUnconfirmed(failure)) throw failure;
            setMethods(null);
            setReplacement(null);
            setOutcome('unconfirmed');
            return;
        }
        if (signal.aborted) return;
        setMethods(null);
        setReplacement(null);
        setOutcome('recovered');
        if (result?.notificationSubmitted) message.success('계정 복구를 완료했어요.');
        else message.info('계정 복구는 완료됐어요. 보안 알림 메일의 발송 여부는 확인하지 못했어요.');
    };
    const useCode = ({ code }) => perform(async signal => {
        if (method !== 'BACKUP') { await complete(method, code, signal); return; }
        const next = await post('backup', { code }, signal);
        if (!signal.aborted) setReplacement({ code: next.code, proof: code });
    });
    const usePasskey = () => perform(async signal => {
        const options = await post('passkey', undefined, signal);
        const proof = await performPasskey(options, false, signal);
        await complete('PASSKEY', proof, signal);
    });
    const recoveryDescription = outcome === 'recovered' ? '로그인할 수 있어요. 기존 로그인 수단과 추가 인증을 사용해주세요.'
        : outcome === 'unconfirmed' ? '복구 결과를 확인하지 못했어요. 로그인 화면에서 기존 로그인 수단으로 확인해주세요.'
            : outcome === 'expired' ? EXPIRED
                : replacement ? '다음 로그인에 사용할 새 복구코드예요. 안전한 곳에 보관한 뒤 확인해주세요.'
                    : methods ? '보호를 해제하려면 기존에 등록한 인증 수단으로 본인인지 확인해주세요.'
                    : key ? '복구를 시작하면 등록한 인증 수단으로 본인인지 확인해요.'
                    : emailRequest ? '복구 가능한 계정이면 등록된 보안 이메일로 코드를 보내요. 받은 6자리 코드를 입력해주세요.'
                    : '잠긴 계정에 등록된 보안 이메일을 입력해주세요.';

    return <PageContainer size="sm" paddingTop="60px" center>
        <AnimatedContent motionKey={outcome || (replacement ? 'backup' : methods ? 'proof' : 'start')} data-sentry-block>
            <PageTitle style={{ textAlign: 'center', marginBottom: 12 }}>
                <SafetyCertificateOutlined aria-hidden="true" /> {outcome === 'recovered' ? '계정 복구를 완료했어요' : replacement ? '새 복구코드 보관' : '잠긴 계정 복구'}
            </PageTitle>
            <PageDescription role={outcome ? 'status' : undefined} style={{ textAlign: 'center', marginBottom: 32 }}>
                {recoveryDescription}
            </PageDescription>
            {showEmailForm ? <Form form={emailForm} layout="vertical" size="large" requiredMark={false} clearOnDestroy
                onFinish={emailRequest ? verifyEmailCode : sendEmailCode}>
                <RecoveryEmailFields emailPlaceholder="보안 이메일 주소" sent={Boolean(emailRequest)} pending={pending}
                    timeLeft={timeLeft} timerText={timeLeft > 0 ? `남은 시간 ${formatTimer(timeLeft)}` : CODE_EXPIRED}
                    onSend={sendEmailCode} onVerify={verifyEmailCode} />
            </Form> : replacement ? <>
                <div className="reserve-mfa-manual-key"><CopyableText value={replacement.code} label="새 복구코드" /></div>
                <Button size="lg" block loading={busy} onClick={() => perform(signal => complete('BACKUP', replacement.proof, signal))}>보관했어요</Button>
            </> : methods ? <>
                <div style={{ marginBottom: 24 }}><SegmentedControl aria-label="복구 인증 수단" value={method} onChange={setMethod}
                    disabled={busy} options={methods.map(value => ({ value, label: LABELS[value] }))} /></div>
                {method === 'PASSKEY' ? <Button size="lg" block loading={busy} onClick={usePasskey}>패스키로 확인</Button>
                    : <Form key={method} layout="vertical" requiredMark={false}
                        onFinish={useCode}>
                        <Form.Item name="code" label={method === 'TOTP' ? '인증 앱 코드' : '복구코드'}
                            rules={method === 'TOTP' ? [{ required: true, pattern: /^[0-9]{6}$/, message: '6자리 코드를 입력해주세요.' }]
                                : [{ required: true, whitespace: true, message: '복구코드를 입력해주세요.' }]}>
                            <FormInput inputMode={method === 'TOTP' ? 'numeric' : 'text'} autoComplete="one-time-code"
                                maxLength={method === 'TOTP' ? 6 : 128} disabled={busy} />
                        </Form.Item>
                        <Button size="lg" htmlType="submit" block loading={busy}>{method === 'BACKUP' ? '복구코드 확인' : '계정 복구'}</Button>
                    </Form>}
            </> : key && <Button size="lg" block loading={busy} onClick={begin}>복구 시작</Button>}
            {showEmailForm && <div className="reserve-auth-secondary-actions"><TextLink href="/?inquiry=open">문의하기</TextLink></div>}
            <RecoveryLoginLink />
        </AnimatedContent>
    </PageContainer>;
}
