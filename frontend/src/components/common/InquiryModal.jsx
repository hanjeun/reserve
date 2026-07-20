/**
 * RESERVE - 문의하기 모달
 * 로그인 여부와 무관하게 이용 가능 (정지된 회원도 문의할 수 있어야 해서 로그인 강제 안 함).
 * 로그인 상태면 회원 정보로 자동 귀속, 비로그인이면 이름/이메일을 직접 입력받아 게스트 문의로 저장.
 * 제출되면 DB(Inquiry)에 저장되고, 운영자 개인 이메일로도 알림이 감(백엔드에서 처리).
 */
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import FormModal, { FormField } from './FormModal';
import FormInput from './FormInput';
import FormTextArea from './FormTextArea';
import SegmentedControl from './SegmentedControl';
import useAuthStore from '../../store/useAuthStore';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

const CATEGORY_OPTIONS = [
    { value: 'RESERVATION', label: '예약 문의' },
    { value: 'PAYMENT', label: '결제 문의' },
    { value: 'STORE', label: '가게 문의' },
    { value: 'ACCOUNT', label: '계정 문의' },
    { value: 'ETC', label: '기타 문의' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const InquiryModal = ({ open, onClose }) => {
    const { isLoggedIn } = useAuthStore();
    const { message } = useMessage();

    const [category, setCategory] = useState('ETC');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [guestName, setGuestName] = useState('');
    const [guestEmail, setGuestEmail] = useState('');
    const [sending, setSending] = useState(false);

    const reset = () => {
        setCategory('ETC'); setTitle(''); setContent(''); setGuestName(''); setGuestEmail('');
    };
    const handleClose = () => { if (!sending) { onClose(); reset(); } };

    const handleSubmit = async () => {
        if (!isLoggedIn) {
            if (!guestName.trim()) { message.warning('이름을 입력해주세요.'); return; }
            if (!guestEmail.trim() || !EMAIL_REGEX.test(guestEmail.trim())) { message.warning('올바른 이메일을 입력해주세요.'); return; }
        }
        if (!title.trim()) { message.warning('제목을 입력해주세요.'); return; }
        if (!content.trim()) { message.warning('문의 내용을 입력해주세요.'); return; }

        setSending(true);
        try {
            await api.post(API_ENDPOINTS.INQUIRY.CREATE, {
                category, title: title.trim(), content: content.trim(),
                ...(!isLoggedIn && { guestName: guestName.trim(), guestEmail: guestEmail.trim() }),
            });
            message.success('문의가 접수되었습니다. 빠르게 답변드릴게요.');
            handleClose();
        } catch {
            message.error('문의 등록에 실패했습니다.');
        } finally {
            setSending(false);
        }
    };

    return (
        <FormModal title="문의하기" open={open} onClose={handleClose}
            onSubmit={handleSubmit} submitting={sending}>
            {!isLoggedIn && (
                <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                        <FormField label="이름">
                            <FormInput placeholder="이름" value={guestName}
                                onChange={(e) => setGuestName(e.target.value)} maxLength={50} />
                        </FormField>
                    </div>
                    <div style={{ flex: 1.4 }}>
                        <FormField label="이메일">
                            <FormInput placeholder="example@email.com" value={guestEmail}
                                onChange={(e) => setGuestEmail(e.target.value)} maxLength={100} />
                        </FormField>
                    </div>
                </div>
            )}
            <FormField label="문의 유형">
                <SegmentedControl value={category} onChange={setCategory} options={CATEGORY_OPTIONS} wrap />
            </FormField>
            <FormField label="제목">
                <FormInput placeholder="문의 제목을 입력하세요" value={title}
                    onChange={(e) => setTitle(e.target.value)} maxLength={200} showCount />
            </FormField>
            <FormField label="내용">
                <FormTextArea rows={6} placeholder="문의하실 내용을 자세히 적어주세요."
                    value={content} onChange={(e) => setContent(e.target.value)}
                    maxLength={2000} showCount />
            </FormField>
            {!isLoggedIn && (
                <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>
                    비회원 문의는 입력하신 이메일로 답변을 보내드려요.
                </Text>
            )}
        </FormModal>
    );
};

InquiryModal.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func,
};

export default InquiryModal;
