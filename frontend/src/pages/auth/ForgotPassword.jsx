import { PageTitle, PageDescription } from '../../components/common/PageTypography';
import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Typography } from 'antd';
import { PageContainer, Button, FormInput } from '../../components/common';
import { MailOutlined, LockOutlined } from '../../components/common/icons';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { VALIDATION_RULES } from '../../utils/validation';
import { handleApiError, isResponseUnconfirmed } from '../../utils/errorHandler';
import { colors } from '../../styles/tokens';
import { RecoveryEmailFields, RecoveryLoginLink } from './RecoveryFormParts';
import { CODE_EXPIRED, formatTimer, remainingSeconds } from './recoveryEmailTimer';

const { Text } = Typography;

const TIMER_MS = 5 * 60 * 1000;
const CODE_REQUESTED_MESSAGE = '요청을 받았어요. 이메일 로그인이 설정된 주소라면 인증 코드를 보내요.';

const STEPS = ['이메일 확인', '코드 인증', '비밀번호 변경'];

const StepIndicator = ({ current }) => (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 40 }}>
        {STEPS.map((label, i) => (
            <React.Fragment key={i}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                        background: i <= current ? colors.primary.solid : colors.gray?.[100] || '#f2f4f6',
                        color: i <= current ? colors.primary.foreground : colors.text?.tertiary || '#b0b8c1',
                        transition: 'all 0.2s',
                    }}>
                        {i < current ? '✓' : i + 1}
                    </div>
                    <Text style={{
                        fontSize: 11,
                        color: i === current ? colors.primary?.main || '#3182f6' : colors.text?.tertiary || '#b0b8c1',
                        fontWeight: i === current ? 600 : 400,
                        whiteSpace: 'nowrap',
                    }}>
                        {label}
                    </Text>
                </div>
                {i < STEPS.length - 1 && (
                    <div style={{
                        flex: 1, height: 2, margin: '0 8px', marginBottom: 20,
                        background: i < current ? colors.primary?.main || '#3182f6' : colors.gray?.[100] || '#f2f4f6',
                        transition: 'background 0.3s',
                    }} />
                )}
            </React.Fragment>
        ))}
    </div>
);

const ForgotPassword = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const { message } = useMessage();
    useDocumentTitle('비밀번호 찾기');

    const [email, setEmail] = useState('');
    const [step, setStep] = useState('email');
    const [pending, setPending] = useState(null);
    const [deadline, setDeadline] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [codeNotice, setCodeNotice] = useState('');
    const operation = useRef(null);
    const mounted = useRef(false);
    const isCodeSent = step !== 'email';
    const isVerified = step === 'password';
    const returnToLogin = () => navigate('/login', { state: { reserveRouteMotion: 'from-left' } });

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const returnToCode = useCallback(notice => {
        form.resetFields(['verificationCode', 'newPassword', 'confirmNewPassword']);
        setStep('code');
        setDeadline(0);
        setTimeLeft(0);
        setCodeNotice(notice);
    }, [form]);

    useEffect(() => {
        if (!deadline) return undefined;
        const update = () => {
            const remaining = remainingSeconds(deadline);
            setTimeLeft(remaining);
            if (!remaining && isVerified && !operation.current) returnToCode(CODE_EXPIRED);
        };
        const timer = setInterval(update, 1000);
        document.addEventListener('visibilitychange', update);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', update);
        };
    }, [deadline, isVerified, returnToCode]);

    const startTimer = until => {
        setDeadline(until);
        setTimeLeft(remainingSeconds(until));
    };

    const begin = kind => {
        if (operation.current || !mounted.current) return false;
        operation.current = kind;
        setPending(kind);
        return true;
    };
    const finish = () => {
        operation.current = null;
        if (mounted.current) setPending(null);
    };

    const handleSendCode = async () => {
        if (!begin('send')) return;
        try {
            const address = isCodeSent ? email : (await form.validateFields(['email'])).email.trim();
            if (!mounted.current) return;
            await api.post(API_ENDPOINTS.PASSWORD_RESET.SEND_CODE, { email: address });
            if (!mounted.current) return;
            form.setFieldValue('verificationCode', '');
            form.setFieldValue('email', address);
            setEmail(address);
            setStep('code');
            setCodeNotice('');
            startTimer(Date.now() + TIMER_MS);
            message.success(CODE_REQUESTED_MESSAGE);
        } catch (err) {
            if (mounted.current && !err?.errorFields && !err?.isStaleSession) {
                message.error(err?.message || '코드를 요청하지 못했어요.');
            }
        } finally {
            finish();
        }
    };

    const handleVerifyCode = async () => {
        if (operation.current) return;
        const setCodeError = msg => form.setFields([{ name: 'verificationCode', errors: [msg] }]);
        if (Date.now() >= deadline) return setCodeError(CODE_EXPIRED);
        const code = form.getFieldValue('verificationCode')?.trim();
        if (!code || !/^[0-9]{6}$/.test(code)) return setCodeError('6자리 인증 코드를 입력해주세요.');
        if (!begin('verify')) return;
        try {
            const result = await api.post(API_ENDPOINTS.PASSWORD_RESET.VERIFY_CODE, { email, code });
            if (!mounted.current) return;
            const verifiedUntil = result === null ? deadline : Date.parse(result?.expiresAt);
            if (!Number.isFinite(verifiedUntil) || verifiedUntil <= Date.now()) {
                returnToCode(CODE_EXPIRED);
                return;
            }
            startTimer(verifiedUntil);
            setCodeNotice('');
            setStep('password');
            message.success('인증됐어요.');
        } catch (err) {
            if (!mounted.current || err?.isStaleSession || err?.name === 'AbortError') return;
            if (err?.data?.code === 'PASSWORD_RESET_CODE_INVALID' || err?.status === 400) {
                setCodeError(err?.message || '인증 코드를 다시 확인해주세요.');
            } else {
                handleApiError(err, message, '인증 코드를 확인하지 못했어요.');
            }
        } finally {
            finish();
        }
    };

    const handleResetPassword = async values => {
        if (operation.current) return;
        if (Date.now() >= deadline) return returnToCode(CODE_EXPIRED);
        const code = form.getFieldValue('verificationCode')?.trim();
        if (!begin('reset')) return;
        try {
            await api.post(API_ENDPOINTS.PASSWORD_RESET.RESET, {
                email, code, newPassword: values.newPassword, newPasswordConfirm: values.confirmNewPassword,
            });
            if (!mounted.current) return;
            message.success('비밀번호가 변경됐어요.');
            returnToLogin();
        } catch (err) {
            if (!mounted.current || err?.isStaleSession) return;
            if (isResponseUnconfirmed(err)) {
                returnToCode('변경 결과를 확인하지 못했어요. 새 비밀번호로 로그인해보고, 로그인할 수 없으면 새 코드를 받아주세요.');
            } else if (err?.data?.code === 'PASSWORD_RESET_CODE_INVALID' || Date.now() >= deadline) {
                returnToCode('인증 코드를 다시 받아주세요.');
            } else {
                message.error(err?.message || '비밀번호를 변경하지 못했어요.');
            }
        } finally {
            finish();
        }
    };

    let indicatorStep = 0;
    if (isVerified) {
        indicatorStep = 2;
    } else if (isCodeSent) {
        indicatorStep = 1;
    }

    const timerText = timeLeft > 0
        ? (isVerified ? '변경까지 남은 시간 ' : '남은 시간 ') + formatTimer(timeLeft)
        : '인증 시간이 만료됐어요. 코드를 다시 받아주세요.';

    return (
        <PageContainer size="sm" paddingTop="60px" center>
            <div className="fade-in-up">
                <PageTitle style={styles.title}><MailOutlined aria-hidden="true" /> 비밀번호 찾기</PageTitle>
                <PageDescription style={styles.subtitle}>
                    이메일 로그인을 설정한 계정의 비밀번호를 재설정해요.
                    소셜 로그인만 사용한다면 로그인 화면에서 연결한 서비스를 선택해주세요.
                </PageDescription>

                <StepIndicator current={indicatorStep} />

                <Form
                    form={form}
                    layout="vertical"
                    size="large"
                    requiredMark={false}
                    onFinish={isVerified ? handleResetPassword : undefined}
                >
                    {!isVerified && <RecoveryEmailFields emailPlaceholder="로그인 이메일 주소" sent={isCodeSent} pending={pending}
                        timeLeft={timeLeft} codeNotice={codeNotice} timerText={timerText} onSend={handleSendCode} onVerify={handleVerifyCode} />}

                    {/* Step 2: 비밀번호 변경 (인증 완료 후) ── */}
                    {isVerified && (
                        <>
                            <Form.Item name="newPassword" rules={VALIDATION_RULES.password}>
                                <FormInput type="password" placeholder="새 비밀번호 (8자 이상, 영문+숫자)" />
                            </Form.Item>
                            <Form.Item
                                name="confirmNewPassword"
                                dependencies={['newPassword']}
                                rules={[
                                    { required: true, message: '비밀번호 확인을 입력해주세요' },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                                            return Promise.reject(new Error('비밀번호가 일치하지 않아요'));
                                        },
                                    }),
                                ]}
                            >
                                <FormInput type="password" placeholder="새 비밀번호 확인" />
                            </Form.Item>
                            <Text style={{ display: 'block', color: colors.text.tertiary, marginBottom: 12 }}>{timerText}</Text>
                            <Button variant="primary" htmlType="submit" block loading={pending === 'reset'} icon={<LockOutlined />}>
                                비밀번호 변경
                            </Button>
                        </>
                    )}
                </Form>

                <RecoveryLoginLink />
            </div>
        </PageContainer>
    );
};

const styles = {
    title: {
        marginBottom: '12px',
    },
    subtitle: {
        display: 'block',
        marginBottom: '40px',
    },
};

export default ForgotPassword;
