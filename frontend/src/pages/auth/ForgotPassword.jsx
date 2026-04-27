import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Typography, Flex } from 'antd';
import { PageContainer, Button, FormInput } from '../../components/common';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { VALIDATION_RULES } from '../../utils/validation';
import { colors, fontWeight, fontSize, animation } from '../../styles/tokens';

const { Title, Text } = Typography;

const TIMER_SEC = 5 * 60;

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
                        background: i <= current ? colors.primary?.main || '#3182f6' : colors.gray?.[100] || '#f2f4f6',
                        color: i <= current ? '#fff' : colors.text?.tertiary || '#b0b8c1',
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

    const [email, setEmail]             = useState('');
    const [isCodeSent, setIsCodeSent]   = useState(false);
    const [isVerified, setIsVerified]   = useState(false);
    const [sendLoading, setSendLoading] = useState(false);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [timeLeft, setTimeLeft]       = useState(0);
    const timerRef = useRef(null);

    useEffect(() => () => clearInterval(timerRef.current), []);

    const startTimer = () => {
        clearInterval(timerRef.current);
        setTimeLeft(TIMER_SEC);
        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) { clearInterval(timerRef.current); return 0; }
                return prev - 1;
            });
        }, 1000);
    };

    const formatTimer = (sec) => {
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        return `${m}:${s}`;
    };

    const handleSendCode = async () => {
        try {
            await form.validateFields(['email']);
            const emailVal = form.getFieldValue('email').trim();
            setSendLoading(true);
            const result = await api.post(API_ENDPOINTS.PASSWORD_RESET.SEND_CODE, { email: emailVal });

            if (!result?.sent) {
                message.warning('가입된 이메일이 아니거나 소셜 로그인 계정입니다.');
                return;
            }

            message.success('인증 코드를 발송했습니다.');
            setEmail(emailVal);
            setIsCodeSent(true);
            setIsVerified(false);
            startTimer();
        } catch (err) {
            if (!err?.errorFields) {
                const msg = typeof err === 'string' ? err : err?.message;
                message.error(msg || '발송에 실패했습니다.');
            }
        } finally {
            setSendLoading(false);
        }
    };

    const handleResend = async () => {
        try {
            setSendLoading(true);
            const result = await api.post(API_ENDPOINTS.PASSWORD_RESET.SEND_CODE, { email });
            if (!result?.sent) {
                message.warning('가입된 이메일이 아니거나 소셜 로그인 계정입니다.');
                return;
            }
            message.success('인증 코드를 재발송했습니다.');
            startTimer();
        } catch (err) {
            const msg = typeof err === 'string' ? err : err?.message;
            message.error(msg || '재발송에 실패했습니다.');
        } finally {
            setSendLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        if (timeLeft === 0) return message.warning('인증 시간이 만료되었습니다.');
        const code = form.getFieldValue('verificationCode')?.trim();
        if (!code) return message.warning('인증번호를 입력해주세요.');
        setVerifyLoading(true);
        try {
            await api.post(API_ENDPOINTS.PASSWORD_RESET.VERIFY_CODE, { email, code });
            message.success('인증되었습니다.');
            setIsVerified(true);
            clearInterval(timerRef.current);
        } catch (err) {
            const msg = typeof err === 'string' ? err : err?.message;
            message.error(msg || '인증번호가 올바르지 않습니다.');
        } finally {
            setVerifyLoading(false);
        }
    };

    const handleResetPassword = async (values) => {
        const code = form.getFieldValue('verificationCode')?.trim();
        setSubmitLoading(true);
        try {
            await api.post(API_ENDPOINTS.PASSWORD_RESET.RESET, {
                email,
                code,
                newPassword: values.newPassword,
            });
            message.success('비밀번호가 변경되었습니다.');
            navigate('/login');
        } catch (err) {
            const msg = typeof err === 'string' ? err : err?.message;
            message.error(msg || '변경에 실패했습니다.');
        } finally {
            setSubmitLoading(false);
        }
    };

    const indicatorStep = isVerified ? 2 : isCodeSent ? 1 : 0;

    const timerInfo = isVerified ? null
        : timeLeft > 0
            ? { text: `남은 시간 ${formatTimer(timeLeft)}`, isWarning: timeLeft <= 60 }
            : isCodeSent
                ? { text: '시간 만료 — 재발송해주세요', isWarning: true }
                : null;

    return (
        <PageContainer size="sm" paddingTop="60px" center>
            <div className="fade-in-up">
                <Title level={2} style={styles.title}>비밀번호 찾기</Title>
                <Text type="secondary" style={styles.subtitle}>
                    가입한 이메일로 인증 후 비밀번호를 재설정합니다
                </Text>

                <StepIndicator current={indicatorStep} />

                <Form
                    form={form}
                    layout="vertical"
                    size="large"
                    requiredMark={false}
                    onFinish={isVerified ? handleResetPassword : undefined}
                >
                    {/* ── Step 0 & 1: 이메일 + 코드 (Signup과 완전히 동일한 구조) ── */}
                    {!isVerified && (
                        <>
                            {/* 이메일 + 코드발송/재발송 버튼 — Signup의 이메일 행과 동일 */}
                            <Form.Item name="email" rules={VALIDATION_RULES.email}>
                                <FormInput.WithButton
                                    placeholder="가입한 이메일 주소"
                                    disabled={isCodeSent}
                                    buttonText={isCodeSent ? '재발송' : '코드발송'}
                                    buttonLoading={sendLoading}
                                    onButtonClick={isCodeSent ? handleResend : handleSendCode}
                                />
                            </Form.Item>

                            {/* 인증번호 — 코드 발송 후 표시, Signup의 인증번호 행과 동일 */}
                            {isCodeSent && (
                                <Form.Item
                                    name="verificationCode"
                                    rules={[{ required: true, message: '인증번호를 입력해주세요' }]}
                                    style={{ animation: animation?.slideUpIn }}
                                    extra={
                                        timerInfo
                                            ? <span style={{ color: timerInfo.isWarning ? '#ff4d4f' : '#8b95a1', fontSize: 12 }}>{timerInfo.text}</span>
                                            : null
                                    }
                                >
                                    <FormInput.WithButton
                                        placeholder="6자리 인증번호"
                                        buttonText="확인"
                                        buttonLoading={verifyLoading}
                                        buttonDisabled={timeLeft === 0}
                                        onButtonClick={handleVerifyCode}
                                    />
                                </Form.Item>
                            )}
                        </>
                    )}

                    {/* ── Step 2: 비밀번호 변경 (인증 완료 후) ── */}
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
                                            return Promise.reject(new Error('비밀번호가 일치하지 않습니다'));
                                        },
                                    }),
                                ]}
                            >
                                <FormInput type="password" placeholder="새 비밀번호 확인" />
                            </Form.Item>
                            <Button variant="primary" htmlType="submit" block loading={submitLoading}>
                                비밀번호 변경
                            </Button>
                        </>
                    )}
                </Form>

                <Flex justify="center" style={{ marginTop: 20 }}>
                    <button
                        onClick={() => navigate('/login')}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: fontSize.sm,
                            color: colors.text?.tertiary,
                            textDecoration: 'underline',
                            textUnderlineOffset: '3px',
                            padding: '2px 0',
                        }}
                    >
                        로그인으로 돌아가기
                    </button>
                </Flex>
            </div>
        </PageContainer>
    );
};

const styles = {
    title: {
        marginBottom: '12px',
        fontWeight: fontWeight.extrabold,
        letterSpacing: '-1.2px',
        color: colors.text?.primary,
    },
    subtitle: {
        display: 'block',
        marginBottom: '40px',
        color: colors.text?.tertiary,
        fontSize: fontSize.lg,
    },
};

export default ForgotPassword;
