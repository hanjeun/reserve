import { useState } from 'react';
import { Typography, Form } from 'antd';
import { Button, FormInput } from '../../components/common';
import { useMessage } from '../../hooks';
import { memberService } from '../../services';
import { handleApiError } from '../../utils/errorHandler';
import { VALIDATION_RULES } from '../../utils/validation';
import useAuthStore from '../../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { colors, fontSize } from '../../styles/tokens';

import styles from './myPageStyles';

const { Text } = Typography;
const PasswordTab = () => {
    const { message } = useMessage();
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const onFinish = async ({ currentPassword, newPassword, confirmPassword }) => {
        setLoading(true);
        try {
            await memberService.changePassword({
                currentPassword,
                newPassword,
                newPasswordConfirm: confirmPassword,
            });
            useAuthStore.getState().logout();
            message.success('비밀번호가 변경됐어요. 다시 로그인해주세요.');
            // 비밀번호 변경 → 다시 로그인: 흐름이 이어지는 이동(오른쪽에서)
            navigate('/login', { replace: true, state: { reserveRouteMotion: 'from-right' } });
        } catch (err) {
            handleApiError(err, message, '비밀번호 변경에 실패했어요');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
            <div style={styles.securityNotice}>
                <Text style={{ fontSize: fontSize.xs, color: colors.text.secondary }}>
                    영문과 숫자를 포함해 8~64자로 입력해주세요
                </Text>
            </div>
            <Form.Item name="currentPassword" style={{ marginBottom: 16 }}
                rules={[{ required: true, message: '현재 비밀번호를 입력해주세요' }]}>
                <FormInput type="password" placeholder="현재 비밀번호" />
            </Form.Item>
            <Form.Item name="newPassword" style={{ marginBottom: 16 }} rules={VALIDATION_RULES.password}>
                <FormInput type="password" placeholder="새 비밀번호 (영문+숫자 8자 이상)" />
            </Form.Item>
            <Form.Item name="confirmPassword" style={{ marginBottom: 16 }} dependencies={['newPassword']} rules={[
                { required: true, message: '비밀번호 확인을 입력해주세요' },
                ({ getFieldValue }) => ({
                    validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                        return Promise.reject(new Error('비밀번호가 일치하지 않아요'));
                    },
                }),
            ]}>
                <FormInput type="password" placeholder="새 비밀번호 확인" />
            </Form.Item>
            <Button variant="primary" htmlType="submit" loading={loading} block>변경</Button>
        </Form>
    );
};

export default PasswordTab;
