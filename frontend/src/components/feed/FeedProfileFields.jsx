import { Checkbox, Form } from 'antd';
import PropTypes from 'prop-types';
import { FormInput, FormTextArea } from '../common';

export default function FeedProfileFields({ avatarField }) {
    return <>
        {avatarField}
        <Form.Item name="nickname" label="공개 닉네임" style={{ marginBottom: 16 }} rules={[{ required: true, whitespace: true, message: '닉네임을 입력해주세요.' }, { max: 30, message: '닉네임은 30자 이하로 입력해주세요.' }]}>
            <FormInput maxLength={30} aria-label="공개 닉네임" autoComplete="nickname" />
        </Form.Item>
        <Form.Item name="bio" label="소개 (선택)" style={{ marginBottom: 16 }} rules={[{ max: 160, message: '소개는 160자 이하로 입력해주세요.' }]}>
            <FormTextArea maxLength={160} rows={3} aria-label="프로필 소개" />
        </Form.Item>
        {!avatarField && <Form.Item name="useAccountAvatar" valuePropName="checked"><Checkbox>계정의 프로필 사진을 피드에 공개해요.</Checkbox></Form.Item>}
    </>;
}
FeedProfileFields.propTypes = { avatarField: PropTypes.node };
