import { useState } from 'react';
import PropTypes from 'prop-types';
import { Form } from 'antd';
import { FormInput } from '../common';
import IconTool from '../common/IconTool';
import { MailOutlined } from '../common/icons';
import LoginMethodFormActions from './LoginMethodFormActions';
import { VALIDATION_RULES } from '../../utils/validation';
import { useMessage } from '../../hooks';
import { reportLoginMethodFormError } from './loginMethodFeedback';

export function LoginMethodPasswordProof({ busy, submitText, actionText = submitText, onSubmit, onCancel }) {
    const [form] = Form.useForm();
    const { message } = useMessage();
    return <Form form={form} aria-label={submitText} layout="vertical" requiredMark={false} onFinish={values => onSubmit(values.currentPassword)}
        onFinishFailed={failure => reportLoginMethodFormError(failure, form, message)}>
        <Form.Item name="currentPassword" label="현재 비밀번호" rules={[{ required: true, message: '현재 비밀번호를 먼저 입력해주세요.' }]}>
            <FormInput type="password" autoComplete="current-password" disabled={busy} maxLength={64} />
        </Form.Item>
        <LoginMethodFormActions submitLabel={submitText} submitText={actionText} busy={busy} onCancel={onCancel} />
    </Form>;
}
LoginMethodPasswordProof.propTypes = { busy: PropTypes.bool, submitText: PropTypes.string.isRequired, actionText: PropTypes.string,
    onSubmit: PropTypes.func.isRequired, onCancel: PropTypes.func.isRequired };

export function LoginMethodPasswordSetup({ email, busy, onSend, onSubmit, onCancel, onError }) {
    const [form] = Form.useForm();
    const { message } = useMessage();
    const [challenge, setChallenge] = useState(null);
    const send = async () => {
        const { email: value } = await form.validateFields(['email']).catch(failure => {
            reportLoginMethodFormError(failure, form, message);
            return {};
        });
        if (!value) return;
        const result = await onSend(value);
        if (result && value.trim().toLowerCase() === form.getFieldValue('email')?.trim().toLowerCase()) setChallenge(result);
    };
    const submit = values => {
        if (!challenge) return onError('이메일 인증 코드를 먼저 받아주세요.');
        if (Date.now() >= Date.parse(challenge.expiresAt)) return onError('인증 코드가 만료됐어요. 다시 받아주세요.');
        return onSubmit({ challengeId: challenge.challengeId, code: values.code, password: values.password, confirmation: values.confirmation });
    };
    return <Form form={form} aria-label="이메일 로그인 설정" layout="vertical" requiredMark={false} initialValues={{ email: email?.endsWith('.local') ? '' : email }}
        onValuesChange={values => { if (Object.hasOwn(values, 'email')) setChallenge(null); }} onFinish={submit}
        onFinishFailed={failure => reportLoginMethodFormError(failure, form, message)}>
        <Form.Item name="email" label="로그인 이메일" rules={VALIDATION_RULES.email}>
            <FormInput type="email" autoComplete="email" disabled={busy} maxLength={254} />
        </Form.Item>
        <p>인증한 이메일을 계정의 연락 이메일로도 사용해요.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <IconTool label={challenge ? '인증 코드 다시 받기' : '인증 코드 받기'} icon={<MailOutlined aria-hidden="true" />} disabled={busy} onClick={send} />
        </div>
        <Form.Item name="code" label="인증 코드" style={{ marginTop: 16 }}
            rules={[{ required: true, pattern: /^[0-9]{6}$/, message: '6자리 인증 코드를 입력해주세요.' }]}>
            <FormInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={busy || !challenge} />
        </Form.Item>
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
        <LoginMethodFormActions submitLabel="이메일 로그인 설정" submitText="설정" busy={busy} onCancel={onCancel}
            unavailableReason={challenge ? '' : '먼저 이메일 인증 코드를 받아주세요.'} />
    </Form>;
}
LoginMethodPasswordSetup.propTypes = { email: PropTypes.string, busy: PropTypes.bool, onSend: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired, onCancel: PropTypes.func.isRequired, onError: PropTypes.func.isRequired };
