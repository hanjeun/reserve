import { useState } from 'react';
import { Form } from 'antd';
import { Button, FormInput } from '../../components/common';
import { useMessage } from '../../hooks';
import { memberService } from '../../services';
import { handleApiError } from '../../utils/errorHandler';
import useAuthStore from '../../store/useAuthStore';


const NameTab = ({ user }) => {
    const { message } = useMessage();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const onFinish = async ({ name }) => {
        setLoading(true);
        try {
            await memberService.updateMember({ name });
            useAuthStore.getState().updateUser({ ...user, name });
            message.success('이름이 변경됐어요');
        } catch (err) {
            handleApiError(err, message, '이름 변경에 실패했어요');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Form form={form} layout="vertical" onFinish={onFinish}
            initialValues={{ name: user?.name }} requiredMark={false} size="large">
            <Form.Item name="name" style={{ marginBottom: 16 }} rules={[
                { required: true, message: '이름을 입력해주세요' },
                { min: 2, max: 20, message: '2~20자 사이로 입력해주세요' },
            ]}>
                <FormInput placeholder="새 이름" />
            </Form.Item>
            <Button variant="primary" htmlType="submit" loading={loading} block>저장</Button>
        </Form>
    );
};

export default NameTab;
