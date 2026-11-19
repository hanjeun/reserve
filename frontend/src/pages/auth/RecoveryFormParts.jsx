import PropTypes from 'prop-types';
import { Flex, Form } from 'antd';
import FormInput from '../../components/common/FormInput';
import TextLink from '../../components/common/TextLink';
import { VALIDATION_RULES } from '../../utils/validation';
import { animation, colors, fontSize } from '../../styles/tokens';

export function RecoveryLoginLink() {
    return <Flex justify="center" style={{ marginTop: 20 }}>
        <TextLink to="/login" state={{ reserveRouteMotion: 'from-left' }} style={{ fontSize: fontSize.sm, padding: '2px 0' }}>
            로그인으로 돌아가기
        </TextLink>
    </Flex>;
}

export function RecoveryEmailFields({ emailPlaceholder, sent, pending, timeLeft, codeNotice, timerText, onSend, onVerify }) {
    return <>
        <Form.Item name="email" rules={VALIDATION_RULES.email}>
            <FormInput.WithButton placeholder={emailPlaceholder} type="email" autoComplete="email" disabled={sent || pending === 'send'}
                buttonText={sent ? '재발송' : '코드발송'} buttonLoading={pending === 'send'} buttonDisabled={Boolean(pending)} onButtonClick={onSend} />
        </Form.Item>
        {sent && <Form.Item name="verificationCode" validateTrigger={[]} rules={[{ required: true, message: '인증번호를 입력해주세요' }]}
            style={{ animation: animation?.slideUpIn }} extra={<span role={codeNotice ? 'status' : undefined}
                style={{ color: timeLeft <= 60 ? colors.error.main : colors.text.tertiary, fontSize: 12 }}>{codeNotice || timerText}</span>}>
            <FormInput.WithButton placeholder="6자리 인증번호" buttonText="확인" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                disabled={Boolean(pending)} buttonLoading={pending === 'verify'} buttonDisabled={!timeLeft || Boolean(pending)} onButtonClick={onVerify} />
        </Form.Item>}
    </>;
}

RecoveryEmailFields.propTypes = {
    emailPlaceholder: PropTypes.string.isRequired,
    sent: PropTypes.bool.isRequired,
    pending: PropTypes.string,
    timeLeft: PropTypes.number.isRequired,
    codeNotice: PropTypes.string,
    timerText: PropTypes.string.isRequired,
    onSend: PropTypes.func.isRequired,
    onVerify: PropTypes.func.isRequired,
};
