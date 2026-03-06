import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import useAuthStore from "../../store/useAuthStore";
import { Form, Typography, Flex } from 'antd';
import { PageContainer, Button, FormInput } from '../../components/common';
import { useMessage } from '../../hooks';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontWeight, fontSize, animation } from '../../styles/tokens';

const { Title, Text } = Typography;

const Signup = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const { message } = useMessage();
    const { isLoggedIn } = useAuthStore();
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const [sendLoading, setSendLoading] = useState(false);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);

    useEffect(() => {
        if (isLoggedIn) navigate('/', { replace: true });
    }, [isLoggedIn, navigate]);

    const handleSendCode = async () => {
        try {
            await form.validateFields(['email']);
            const email = form.getFieldValue('email').trim();
            setSendLoading(true);
            await api.post(API_ENDPOINTS.EMAIL.SEND_CODE, { email });
            message.success("인증 코드가 발송되었습니다.");
            setIsCodeSent(true);
        } catch (err) {
            message.error(err?.message || err || "인증코드 발송 실패");
        } finally {
            setSendLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        const email = form.getFieldValue('email')?.trim();
        const code = form.getFieldValue('verificationCode')?.trim();
        if (!code) return message.warning("인증번호를 입력해주세요.");
        setVerifyLoading(true);
        try {
            await api.post(API_ENDPOINTS.EMAIL.VERIFY_CODE, { email, code });
            message.success("이메일 인증 완료");
            setIsVerified(true);
        } catch (err) {
            message.error(err?.message || err || "인증 코드 불일치");
        } finally {
            setVerifyLoading(false);
        }
    };

    const onSignupSubmit = async (values) => {
        if (!isVerified) return message.error("이메일 인증을 먼저 완료해주세요.");
        setSubmitLoading(true);
        try {
            await api.post(API_ENDPOINTS.AUTH.SIGNUP, {
                name: values.name.trim(),
                email: values.email.trim(),
                password: values.password
            });
            message.success("회원가입 완료!");
            navigate('/login');
        } catch (err) {
            message.error(err?.message || err || "회원가입 오류");
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

                    {/* 이메일 */}
                    <Form.Item
                        name="email"
                        rules={[
                            { required: true, message: '이메일을 입력해주세요' },
                            { type: 'email', message: '올바른 이메일 형식이 아닙니다' },
                        ]}
                    >
                        <FormInput.WithButton
                            placeholder="이메일 주소"
                            disabled={isVerified}
                            buttonText={isCodeSent ? '재발송' : '코드발송'}
                            buttonLoading={sendLoading}
                            buttonDisabled={isVerified}
                            onButtonClick={handleSendCode}
                            verified={false}
                        />
                    </Form.Item>

                    {/* 인증번호 */}
                    {isCodeSent && (
                        <Form.Item
                            name="verificationCode"
                            rules={[{ required: true, message: '인증번호를 입력해주세요' }]}
                            style={{ animation: animation.slideUpIn }}
                        >
                            <FormInput.WithButton
                                placeholder="6자리 인증번호"
                                disabled={isVerified}
                                buttonText={isVerified ? '인증됨' : '확인'}
                                buttonLoading={verifyLoading}
                                buttonDisabled={isVerified}
                                onButtonClick={handleVerifyCode}
                                verified={isVerified}
                            />
                        </Form.Item>
                    )}

                    {/* 비밀번호 */}
                    <Form.Item
                        name="password"
                        rules={[
                            { required: true, message: '비밀번호를 입력해주세요' },
                            { min: 8, message: '비밀번호는 8자 이상이어야 합니다' },
                        ]}
                    >
                        <FormInput type="password" placeholder="비밀번호 (8자 이상)" />
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
                                }
                            })
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
        color: colors.text.primary
    },
    subtitle: {
        display: 'block',
        marginBottom: '40px',
        color: colors.text.tertiary,
        fontSize: fontSize.lg
    },
};

export default Signup;
