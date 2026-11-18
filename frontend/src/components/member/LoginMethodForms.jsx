import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Form, Typography } from 'antd';
import { FormInput } from '../common';
import SocialLoginButton from '../common/SocialLoginButton';
import Tooltip from '../common/Tooltip';
import useExitAnimation from '../../hooks/useExitAnimation';
import useReducedMotion from '../../hooks/useReducedMotion';
import LoginMethodFormActions from './LoginMethodFormActions';
import LoginSecurityPanelHeading from './LoginSecurityPanelHeading';
import { VALIDATION_RULES } from '../../utils/validation';
import { useMessage } from '../../hooks';
import { reportLoginMethodFormError } from './loginMethodFeedback';
import styles from './myPageStyles';

const SETUP_FIELDS = ['email', 'code', 'password', 'confirmation'];

export function LoginMethodSocialProof({ title, description, provider, buttonLabel, disabled, onConfirm, onClose, actions }) {
    const social = provider && onConfirm && <Tooltip title={buttonLabel}>
        <SocialLoginButton provider={provider} data-provider={provider} label={buttonLabel} disabled={disabled} onClick={onConfirm} />
    </Tooltip>;
    const heading = <LoginSecurityPanelHeading onClose={onClose} disabled={disabled}><Typography.Text strong>{title}</Typography.Text></LoginSecurityPanelHeading>;
    const hint = <Typography.Text style={{ ...styles.loginMethodHint, marginTop: 0, overflowWrap: 'anywhere' }}>{description}</Typography.Text>;
    if (social && !actions && !onClose) return <div className="reserve-login-proof-single">
        <div className="reserve-login-proof-copy">{heading}{hint}</div>
        {social}
    </div>;
    return <>
        {heading}
        <div className={actions ? 'reserve-login-proof-options reserve-login-proof-options--multiple' : 'reserve-login-proof-options'}>
            {hint}
            {actions ? <div className="reserve-mfa-management-actions" role="group" aria-label="인증 수단">{social}{actions}</div> : social}
        </div>
    </>;
}
LoginMethodSocialProof.propTypes = { title: PropTypes.string.isRequired, description: PropTypes.string.isRequired,
    provider: PropTypes.oneOf(['google', 'naver', 'kakao']), buttonLabel: PropTypes.string.isRequired,
    disabled: PropTypes.bool, onConfirm: PropTypes.func, onClose: PropTypes.func, actions: PropTypes.node };

export function LoginMethodPasswordProof({ busy, submitText, actionText = submitText, description, onSubmit, onCancel }) {
    const [form] = Form.useForm();
    const { message } = useMessage();
    return <Form form={form} aria-label={submitText} layout="vertical" requiredMark={false} onFinish={values => onSubmit(values.currentPassword)}
        onFinishFailed={failure => reportLoginMethodFormError(failure, form, message)}>
        <LoginSecurityPanelHeading onClose={onCancel} disabled={busy}><Typography.Text strong>{submitText}</Typography.Text></LoginSecurityPanelHeading>
        {description && <Typography.Text style={{ ...styles.loginMethodHint, marginBottom: 12 }}>{description}</Typography.Text>}
        <Form.Item name="currentPassword" label="현재 비밀번호" rules={[{ required: true, message: '현재 비밀번호를 먼저 입력해주세요.' }]}>
            <FormInput type="password" autoComplete="current-password" disabled={busy} maxLength={64} />
        </Form.Item>
        <LoginMethodFormActions submitLabel={submitText} submitText={actionText} busy={busy} />
    </Form>;
}
LoginMethodPasswordProof.propTypes = { busy: PropTypes.bool, submitText: PropTypes.string.isRequired, actionText: PropTypes.string, description: PropTypes.string,
    onSubmit: PropTypes.func.isRequired, onCancel: PropTypes.func.isRequired };

export function LoginMethodPasswordSetup({ email, busy, onSend, onSubmit, onCancel, onError }) {
    const [form] = Form.useForm();
    const { message } = useMessage();
    const [challenge, setChallenge] = useState(null);
    const [sending, setSending] = useState(false);
    const sendLock = useRef(false);
    const mounted = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const reducedMotion = useReducedMotion();
    const { shouldRender: renderCode } = useExitAnimation(Boolean(challenge), reducedMotion ? 0 : 200);
    const send = async () => {
        if (busy || sendLock.current) return;
        sendLock.current = true;
        setSending(true);
        try {
            const { email: value } = await form.validateFields(['email']).catch(failure => {
                reportLoginMethodFormError(failure, form, message);
                return {};
            });
            if (!value || !mounted.current) return;
            const result = await onSend(value);
            if (mounted.current && result && value.trim().toLowerCase() === form.getFieldValue('email')?.trim().toLowerCase()) {
                form.setFieldValue('code', '');
                setChallenge(result);
            }
        } catch (error) {
            if (mounted.current) onError(error.message || '인증 코드를 보내지 못했어요.');
        } finally {
            sendLock.current = false;
            if (mounted.current) setSending(false);
        }
    };
    const submit = values => {
        if (!challenge) return onError('이메일 인증 코드를 먼저 받아주세요.');
        if (Date.now() >= Date.parse(challenge.expiresAt)) return onError('인증 코드가 만료됐어요. 다시 받아주세요.');
        return onSubmit({ challengeId: challenge.challengeId, code: values.code, password: values.password, confirmation: values.confirmation });
    };
    return <Form form={form} aria-label="이메일 로그인 설정" layout="vertical" requiredMark={false} initialValues={{ email: email?.endsWith('.local') ? '' : email }}
        onValuesChange={values => { if (Object.hasOwn(values, 'email')) { setChallenge(null); form.setFieldValue('code', ''); } }} onFinish={submit}
        onFinishFailed={failure => {
            // 나중에 열린 코드 필드도 화면 순서대로 먼저 안내한다.
            const errorFields = [...failure.errorFields].sort((left, right) => SETUP_FIELDS.indexOf(left.name[0]) - SETUP_FIELDS.indexOf(right.name[0]));
            reportLoginMethodFormError({ ...failure, errorFields }, form, message);
        }}>
        <LoginSecurityPanelHeading onClose={onCancel} disabled={busy || sending}><Typography.Text strong>이메일 로그인 설정</Typography.Text></LoginSecurityPanelHeading>
        <Form.Item name="email" label="로그인 이메일" rules={VALIDATION_RULES.email}
            extra="인증한 이메일을 계정의 연락 이메일로도 사용해요.">
            <FormInput.WithButton type="email" autoComplete="email" disabled={busy} maxLength={254}
                buttonText={challenge ? '재발송' : '코드발송'} buttonAriaLabel={challenge ? '인증 코드 다시 받기' : '인증 코드 받기'}
                buttonLoading={sending} buttonDisabled={busy} onButtonClick={send} />
        </Form.Item>
        {(challenge || renderCode) && <div className="reserve-login-security-code" inert={!challenge ? true : undefined}
            style={{ display: 'grid', gridTemplateRows: '1fr', animation: reducedMotion ? 'none'
                : !challenge ? 'reserve-feed-replies-exit 200ms ease-in both' : 'reserve-feed-replies-enter 200ms ease-out both' }}>
            <div style={{ minHeight: 0, overflow: 'hidden' }}><Form.Item name="code" label="인증 코드" preserve={false}
                rules={[{ required: true, pattern: /^[0-9]{6}$/, message: '6자리 인증 코드를 입력해주세요.' }]}>
                <FormInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={busy || !challenge} />
            </Form.Item></div>
        </div>}
        <Form.Item name="password" label="비밀번호" rules={VALIDATION_RULES.password}>
            <FormInput type="password" autoComplete="new-password" maxLength={64} disabled={busy} />
        </Form.Item>
        <Form.Item name="confirmation" label="비밀번호 확인" dependencies={['password']} rules={[
            { required: true, message: '비밀번호를 다시 입력해주세요.' },
            ({ getFieldValue }) => ({ validator: (_, value) => !value || value === getFieldValue('password')
                ? Promise.resolve() : Promise.reject(new Error('비밀번호가 일치하지 않아요.')) }),
        ]}>
            <FormInput type="password" autoComplete="new-password" maxLength={64} disabled={busy} />
        </Form.Item>
        <p>인증 코드는 5분간 유효해요. 설정 후 다시 로그인해주세요.</p>
        <LoginMethodFormActions submitLabel="이메일 로그인 설정" submitText="설정" busy={busy}
            unavailableReason={challenge ? '' : '먼저 이메일 인증 코드를 받아주세요.'} />
    </Form>;
}
LoginMethodPasswordSetup.propTypes = { email: PropTypes.string, busy: PropTypes.bool, onSend: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired, onCancel: PropTypes.func, onError: PropTypes.func.isRequired };
