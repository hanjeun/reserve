import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import useAuthStore from "../../store/useAuthStore";
import { Form, Typography, Flex, Checkbox } from 'antd';
import { PageContainer, Button, FormInput } from '../../components/common';
import { useMessage, useEmailVerification } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { API_ENDPOINTS } from '../../constants';
import { VALIDATION_RULES } from '../../utils/validation';
import { colors, fontWeight, fontSize, animation, agreement as A } from '../../styles/tokens';

const { Title, Text } = Typography;

const Signup = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const { message } = useMessage();
    const { isLoggedIn } = useAuthStore();
    useDocumentTitle('회원가입');

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
    const [agreements, setAgreements] = React.useState({ terms: false, privacy: false, marketing: false });
    const allRequired = agreements.terms && agreements.privacy;
    const allChecked  = agreements.terms && agreements.privacy && agreements.marketing;

    const toggleAll = (checked) => setAgreements({ terms: checked, privacy: checked, marketing: checked });
    const toggle    = (key) => setAgreements(prev => ({ ...prev, [key]: !prev[key] }));

    useEffect(() => {
        if (isLoggedIn) navigate('/', { replace: true });
    }, [isLoggedIn, navigate]);

    const onSignupSubmit = async (values) => {
        if (!isVerified)   return message.error('이메일 인증을 먼저 완료해주세요.');
        if (!allRequired)  return message.error('필수 약관에 동의해주세요.');

        setSubmitLoading(true);
        try {
            const res = await api.post(API_ENDPOINTS.AUTH.SIGNUP, {
                name:            values.name.trim(),
                email:           values.email.trim(),
                password:        values.password,
                passwordConfirm: values.confirmPassword,
                termsAgreed:     true,                    // UI에서 이미 필수 체크 강제
                marketingAgreed: agreements.marketing,    // 선택 동의 여부 전달
            });
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

                    {/* 이메일 + 코드발송 */}
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

                    {/* 약관 동의 */}
                    <div style={A.section}>
                        <div style={A.divider} />

                        <button type="button" style={{ ...A.allRow, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%' }}
                            onClick={() => toggleAll(!allChecked)}>
                            <Checkbox checked={allChecked} onChange={e => toggleAll(e.target.checked)} onClick={e => e.stopPropagation()} />
                            <span style={A.allText}>전체 동의하기</span>
                        </button>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[
                                { key: 'terms',     label: '서비스 이용약관',    required: true,  path: '/terms' },
                                { key: 'privacy',   label: '개인정보 처리방침',   required: true,  path: '/privacy' },
                                { key: 'marketing', label: '이메일 마케팅 수신',  required: false, path: null },
                            ].map(({ key, label, required, path }) => (
                                <div key={key} style={A.itemRow}>
                                    <button type="button" style={{ ...A.itemLeft, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                                        onClick={() => toggle(key)}>
                                        <Checkbox checked={agreements[key]} onChange={() => toggle(key)} onClick={e => e.stopPropagation()} />
                                        <span style={A.itemText}>
                                            <span style={required ? A.requiredTag : A.optionalTag}>
                                                {required ? '필수' : '선택'}
                                            </span>
                                            {label}
                                        </span>
                                    </button>
                                    {path && (
                                        <button type="button" style={A.viewLink}
                                            onClick={e => { e.stopPropagation(); window.open(path, '_blank'); }}>
                                            보기
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginTop: '20px' }}>
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
