import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import useAuthStore from "../../store/useAuthStore";
import { Form, Typography, Flex } from 'antd';
import { PageContainer, Button, FormInput } from '../../components/common';
import { useMessage, useEmailVerification } from '../../hooks';
import { API_ENDPOINTS } from '../../constants';
import { VALIDATION_RULES } from '../../utils/validation';
import { colors, fontWeight, fontSize, animation } from '../../styles/tokens';

const { Title, Text } = Typography;

const Signup = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const { message } = useMessage();
    const { isLoggedIn } = useAuthStore();

    const {
        isCodeSent, isVerified,
        sendLoading, verifyLoading,
        sendCode, verifyCode,
        timerInfo,
    } = useEmailVerification({
        sendEndpoint:   API_ENDPOINTS.EMAIL.SEND_CODE,
        verifyEndpoint: API_ENDPOINTS.EMAIL.VERIFY_CODE,
        form,
        emailFieldName: 'email',
        codeFieldName:  'verificationCode',
    });

    const [submitLoading, setSubmitLoading] = React.useState(false);

    useEffect(() => {
        if (isLoggedIn) navigate('/', { replace: true });
    }, [isLoggedIn, navigate]);

    const onSignupSubmit = async (values) => {
        if (!isVerified) return message.error('이메일 인증을 먼저 완료해주세요.');
        setSubmitLoading(true);
        try {
            const res = await api.post(API_ENDPOINTS.AUTH.SIGNUP, {
                name:     values.name.trim(),
                email:    values.email.trim(),
                password: values.password,
            });
            // 백엔드가 가입과 동시에 쿠키를 발급하므로 자동 로그인 처리
            if (res) {
                const { login } = useAuthStore.getState();
                login(res);
                message.success(`${res.name || ''}님, 환영합니다!`);
                navigate('/', { replace: true });
            } else {
                navigate('/login', { state: { signupSuccess: true } });
            }
        } catch (err) {
            if (err?.isSessionExpired) return;
            const msg = typeof err === 'string' ? err : err?.message;
            message.error(msg || '가입에 실패했습니다.');
        } finally {
            setSubmitLoading(false);
        }
    };

    return (
        <PageContainer size="sm" paddingTop="60px" center>
            <div className="fade-in-up">
                <Title level={2} style={styles.title}>회원가입</Title>
                <Text type="secondary" style={styles.subtitle}>간편한 가입으로 예약을 시작하세요</Text>

                <Form form={form} onFinish={onSignupSubmit} layout="vertical" size="large" requiredMark={false}>

                    {/* 이름 */}
                    <Form.Item name="name" rules={[{ required: true, message: '이름을 입력해주세요' }]}>
                        <FormInput placeholder="이름" />
                    </Form.Item>

                    {/* 이메일 + 코드발송 버튼 */}
                    <Form.Item name="email" rules={VALIDATION_RULES.email}>
                        <FormInput.WithButton
                            placeholder="이메일 주소"
                            disabled={isVerified}
                            buttonText={isCodeSent ? '재발송' : '코드발송'}
                            buttonLoading={sendLoading}
                            buttonDisabled={isVerified}
                            onButtonClick={sendCode}
                        />
                    </Form.Item>

                    {/* 인증번호 (코드 발송 후 표시) */}
                    {isCodeSent && (
                        <Form.Item
                            name="verificationCode"
                            rules={[{ required: true, message: '인증번호를 입력해주세요' }]}
                            style={{ animation: animation.slideUpIn }}
                            extra={
                                timerInfo
                                    ? <span style={{ color: timerInfo.isWarning ? '#ff4d4f' : '#8b95a1', fontSize: 12 }}>{timerInfo.text}</span>
                                    : null
                            }
                        >
                            <FormInput.WithButton
                                placeholder="6자리 인증번호"
                                disabled={isVerified}
                                buttonText={isVerified ? '인증됨' : '확인'}
                                buttonLoading={verifyLoading}
                                buttonDisabled={isVerified}
                                onButtonClick={verifyCode}
                                verified={isVerified}
                            />
                        </Form.Item>
                    )}

                    {/* 비밀번호 */}
                    <Form.Item name="password" rules={VALIDATION_RULES.password}>
                        <FormInput type="password" placeholder="비밀번호 (8자 이상, 영문+숫자)" />
                    </Form.Item>

                    {/* 비밀번호 확인 */}
                    <Form.Item
                        name="confirmPassword"
                        dependencies={["password"]}
                        rules={[
                            { required: true, message: '비밀번호 확인을 입력해주세요' },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                                    return Promise.reject(new Error('비밀번호가 일치하지 않습니다'));
                                },
                            }),
                        ]}
                    >
                        <FormInput type="password" placeholder="비밀번호 확인" />
                    </Form.Item>

                    <div style={{ marginTop: '32px' }}>
                        <Button
                            variant="primary"
                            htmlType="submit"
                            loading={submitLoading}
                            block
                            disabled={!isVerified}
                        >
                            가입 완료
                        </Button>
                    </div>
                </Form>

                <Flex align="center" justify="center" gap={4} style={{ marginTop: '32px' }}>
                    <Text type="secondary" style={{ fontSize: fontSize.base }}>이미 계정이 있으신가요?</Text>
                    <Button variant="link" onClick={() => navigate('/login')}>로그인</Button>
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
        color: colors.text.primary,
    },
    subtitle: {
        display: 'block',
        marginBottom: '40px',
        color: colors.text.tertiary,
        fontSize: fontSize.lg,
    },
};

export default Signup;
