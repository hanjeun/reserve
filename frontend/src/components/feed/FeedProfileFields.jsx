import { Form } from 'antd';
import PropTypes from 'prop-types';
import { FormInput, FormSelect, FormTextArea } from '../common';

const visibilityOptions = [
    { value: 'PUBLIC', label: '전체 공개' },
    { value: 'MEMBERS', label: '로그인한 회원만' },
    { value: 'PRIVATE', label: '나만 보기' },
];

export default function FeedProfileFields({ avatarField, nicknameTool, legacyVisibility = false }) {
    return <>
        {avatarField}
        <Form.Item name="nickname" label="공개 닉네임" style={{ marginBottom: 16 }} rules={[{ required: true, whitespace: true, message: '닉네임을 입력해주세요.' }, { max: 30, message: '닉네임은 30자 이하로 입력해주세요.' }]}>
            <FormInput maxLength={30} aria-label="공개 닉네임" autoComplete="nickname" suffix={nicknameTool} />
        </Form.Item>
        <Form.Item name="bio" label="소개 (선택)" style={{ marginBottom: 16 }} rules={[{ max: 160, message: '소개는 160자 이하로 입력해주세요.' }]}>
            <FormTextArea maxLength={160} rows={3} aria-label="프로필 소개" />
        </Form.Item>
        <Form.Item name="visibility" label="프로필 공개 범위" style={{ marginBottom: 16 }}
            rules={[{ required: true, message: '프로필 공개 범위를 선택해주세요.' }]}
            extra={legacyVisibility ? '기존 게시물 모아보기는 공개 중이에요. 범위를 저장하면 댓글·리뷰에도 적용돼요.'
                : '프로필 사진과 게시물·댓글·리뷰 모아보기를 볼 수 있는 대상을 정해요.'}>
            <FormSelect aria-label="프로필 공개 범위" options={visibilityOptions} placeholder="공개 범위 선택" />
        </Form.Item>
    </>;
}
FeedProfileFields.propTypes = { avatarField: PropTypes.node, nicknameTool: PropTypes.node, legacyVisibility: PropTypes.bool };
