import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form, Typography, Flex } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import Button from '../common/Button';
import FormInput from '../common/FormInput';
import AnimatedContent from '../common/AnimatedContent';
import CopyableText from '../common/CopyableText';
import { PageTitle, PageDescription } from '../common/PageTypography';
import { SafetyCertificateOutlined, LockOutlined, MobileOutlined, CheckOutlined } from '../common/icons';
import api from '../../api/axios';
import useAuthStore from '../../store/useAuthStore';
import { authenticateWithPasskey, finishMfaSession } from '../../utils/mfaAuthentication';
import { AUTHENTICATION_BACK } from '../../utils/authenticationNavigation';
import { colors, fontSize } from '../../styles/tokens';

const config = { skipAuthRefresh: true };
const post = (path, data) => api.post('/api/auth/mfa/' + path, data, config);
export default function MfaFlow({ ref, initialView, settings, page = false, onDone, onCancel }) {
    const revision = useAuthStore(state => state.sessionRevision);
    const [view, setView] = useState(initialView);
    const [setup, setSetup] = useState(null);
    const [codes, setCodes] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(initialView?.initialError || '');
    const [method, setMethod] = useState(initialView?.preferredFactor || null);
    const active = useRef(false);
    const controller = useRef(null);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; controller.current?.abort(); };
    }, []);
    const finish = async (defer = false) => {
        const member = await finishMfaSession(controller.current?.signal, defer);
        if (!mounted.current) return;
        useAuthStore.getState().login(member);
        onDone?.(member);
    };
    const perform = async (action, totpAvailable = view?.totpAvailable) => {
        if (active.current) return;
        active.current = true;
        setBusy(true); setError('');
        try { await action(); }
        catch (failure) {
            if (!mounted.current) return;
            const cancelled = ['NotAllowedError', 'AbortError'].includes(failure.name);
            setError(cancelled ? '패스키 인증을 취소했어요. 다른 방법으로 확인할 수 있어요.'
                : failure.message || '인증을 다시 시작해주세요.');
            if (cancelled && totpAvailable) setMethod('TOTP');
        }
        finally { active.current = false; if (mounted.current) setBusy(false); }
    };
    const enrolled = async result => {
        if (!mounted.current) return;
        setSetup(null);
        if (result.codes?.length) setCodes(result.codes);
        else await finish();
    };
    const verify = async (kind, proof) => {
        const result = await post('verify', { kind, proof });
        if (!mounted.current) return;
        if (result.purpose === 'MANAGE') setView(result);
        else await finish();
    };
    const passkey = (registration, availableView = view) => perform(async () => {
        controller.current = new AbortController();
        const result = await authenticateWithPasskey(registration, controller.current.signal);
        if (!mounted.current) return;
        if (registration) await enrolled(result);
        else if (result.purpose === 'MANAGE') setView(result);
        else await finish();
    }, availableView?.totpAvailable);
    const receiveInitial = useEffectEvent(result => {
        setView(result);
        if (result.passkeyAvailable && !result.enrollmentRequired && !result.verified
            && !result.initialError && !result.preferredFactor) void passkey(false, result);
    });
    useEffect(() => {
        if (initialView) return;
        let live = true;
        api.post('/api/auth/mfa/status', undefined, config).then(result => { if (live) receiveInitial(result); })
            .catch(failure => { if (live) setError(failure.message); });
        return () => { live = false; };
    }, [initialView, revision]);
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
    const selected = method || (view?.passkeyAvailable || view?.purpose === 'PASSKEY_LOGIN' ? 'PASSKEY' : 'TOTP');
    const title = codes ? '복구코드 보관' : setup ? '인증 앱 연결'
        : changing ? '인증 수단 관리' : view?.enrollmentRequired ? '패스키 등록하기'
            : view?.purpose === 'PASSKEY_LOGIN' ? '패스키로 로그인' : '추가 인증';
    const description = codes ? '패스키나 인증 앱을 쓸 수 없을 때 사용하는 비상용 코드예요. 각 코드는 한 번만 사용할 수 있어요.'
        : setup ? '인증 앱에서 QR을 스캔하고 6자리 코드를 입력해주세요.'
            : view?.enrollmentRequired || changing ? '기기나 비밀번호 관리자에 저장하고, 지문·얼굴·기기 PIN으로 사용해요.'
                : '등록한 인증 수단으로 본인인지 확인해주세요.';
    const motionKey = codes ? 'codes' : setup ? 'totp-setup' : changing ? 'manage' : view?.enrollmentRequired ? 'enroll' : 'verify-' + selected;
    const alternatives = view && view.purpose !== 'PASSKEY_LOGIN' && <Flex gap={16} wrap className="reserve-mfa-alternatives">
        {view.passkeyAvailable && selected !== 'PASSKEY' && <Button variant="ghost-sm" icon={<LockOutlined />} disabled={busy} onClick={() => { setMethod('PASSKEY'); void passkey(false); }}>패스키 사용</Button>}
        {view.totpAvailable && selected !== 'TOTP' && <Button variant="ghost-sm" icon={<MobileOutlined />} disabled={busy} onClick={() => setMethod('TOTP')}>인증 앱 사용</Button>}
        {selected !== 'BACKUP' && <Button variant="ghost-sm" icon={<SafetyCertificateOutlined />} disabled={busy} onClick={() => setMethod('BACKUP')}>복구코드 사용</Button>}
    </Flex>;
    return <AnimatedContent motionKey={motionKey}><section aria-label="추가 인증" data-sentry-block aria-busy={busy} className="reserve-mfa-flow">
        {page ? <>
            <PageTitle style={{ textAlign: 'center', marginBottom: 12 }}><SafetyCertificateOutlined aria-hidden="true" /> {title}</PageTitle>
            <PageDescription style={{ textAlign: 'center', marginBottom: 48 }}>{description}</PageDescription>
        </> : <>
            <Typography.Title level={5} className="reserve-mfa-title" style={{ fontSize: fontSize.base, marginBottom: 8 }}><SafetyCertificateOutlined aria-hidden="true" /> {title}</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: fontSize.sm }}>{description}</Typography.Paragraph>
        </>}
        {error && <Typography.Paragraph role="alert" style={{ color: colors.error.main }}>{error}</Typography.Paragraph>}
        {codes ? <>
            <ul aria-label="복구코드" className="reserve-mfa-recovery-codes">{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul>
            <Button variant="primary" size={page ? 'lg' : 'sm'} block={page} icon={<CheckOutlined />} loading={busy} onClick={() => perform(() => finish())}>보관했어요</Button>
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
                <Button variant="primary" size={page ? 'lg' : 'sm'} htmlType="submit" icon={<CheckOutlined />} loading={busy} block={page}>등록</Button>
            </Form>
        </> : view?.enrollmentRequired || changing ? <>
            <div className={page && (!settings || !settings.credentials.some(value => value.kind === 'TOTP')) ? 'reserve-login-actions' : undefined}
                style={!page ? { display: 'flex', gap: 8, flexWrap: 'wrap' } : undefined}>
                <Button variant="primary" size={page ? 'lg' : 'sm'} block={page} icon={<LockOutlined />} disabled={busy} onClick={() => passkey(true)}>패스키 추가</Button>
                {(!settings || !settings.credentials.some(value => value.kind === 'TOTP')) && <Button variant="secondary" size={page ? 'lg' : 'sm'} block={page} icon={<MobileOutlined />} disabled={busy}
                    onClick={() => perform(async () => { const result = await post('totp/setup'); if (mounted.current) setSetup(result); })}>인증 앱 연결</Button>}
            </div>
            {!changing && view.canDeferEnrollment && <div className="reserve-auth-secondary-actions">
                <Button variant="ghost-sm" disabled={busy} onClick={() => perform(() => finish(true))}>다음에 할게요</Button>
            </div>}
            {changing && <>
                {settings.credentials.map(value => <Flex key={value.id} justify="space-between" align="center" style={{ marginTop: 16 }}>
                    <Typography.Text>{value.name}</Typography.Text>
                    <Button variant="ghost-sm" disabled={busy || settings.required && settings.credentials.length <= 1} onClick={() => perform(async () => {
                        await post('remove', { id: value.id }); useAuthStore.getState().logout(); onCancel?.();
                    })}>해제</Button>
                </Flex>)}
                <Flex gap={16} wrap className="reserve-mfa-alternatives">
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => perform(async () => { const result = await post('recovery'); if (mounted.current) setCodes(result.codes); })}>복구코드 재발급</Button>
                    {!settings.required && <Button variant="ghost-sm" disabled={busy} onClick={() => perform(async () => {
                        await post('disable'); useAuthStore.getState().logout(); onCancel?.();
                    })}>추가 인증 해제</Button>}
                </Flex>
            </>}
        </> : view && <>
            {selected === 'PASSKEY' ? <div className={!page ? 'reserve-mfa-verification-actions' : undefined}>
                <Button size={page ? 'lg' : 'sm'} block={page} icon={<LockOutlined />} loading={busy} onClick={() => passkey(false)}>패스키로 확인</Button>
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
                        <Button variant="primary" size={page ? 'lg' : 'sm'} htmlType="submit" icon={<CheckOutlined />} loading={busy} block={page}>확인</Button>
                        {!page && alternatives}
                    </div>
                </Form>}
            {page && alternatives}
        </>}
        {!page && !codes && (setup || !settings) && <div className="reserve-auth-secondary-actions">
            <Button variant="ghost-sm" disabled={busy} onClick={back}>{setup ? '뒤로' : '닫기'}</Button>
        </div>}
    </section></AnimatedContent>;
}
MfaFlow.propTypes = { ref: PropTypes.object, initialView: PropTypes.object, settings: PropTypes.object, page: PropTypes.bool, onDone: PropTypes.func, onCancel: PropTypes.func };
