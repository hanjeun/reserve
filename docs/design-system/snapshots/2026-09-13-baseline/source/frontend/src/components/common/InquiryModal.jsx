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
import SegmentedGrid from './SegmentedGrid';
import useAuthStore from '../../store/useAuthStore';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { EMAIL_REGEX } from '../../utils/validation';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

// 라벨에서 "문의"를 뺐다 — 바로 위 FormField가 이미 "문의 유형"이라 중복인 데다,
// "○○ 문의"는 모바일 모달 폭(약 320px)에 안 들어간다.
//
// 개수를 5 → 8로 늘린 이유: 5개는 어느 폭에서도 4+1로 갈라져 마지막 줄에 하나만 남았다.
// 억지로 한 줄에 욱여넣으면 글자가 잘리므로, **4의 배수로 맞춰 대칭으로 접히게** 하는 쪽을 택했다
// (넓으면 8+0 또는 4+4, 좁으면 2+2+2+2 — 어느 쪽이든 줄 끝이 비지 않는다).
// 늘어난 3개는 채우기용이 아니라 실제로 문의가 갈리는 도메인이다(환불·광고·리뷰).
//
// ★ 백엔드 Inquiry.InquiryCategory와 **값·순서가 1:1로 일치**해야 한다.
//   서버가 valueOf()로 파싱하므로 여기에만 있는 값을 보내면 400이 난다.
const CATEGORY_OPTIONS = [
    { value: 'RESERVATION', label: '예약' },
    { value: 'PAYMENT', label: '결제' },
    { value: 'REFUND', label: '환불' },
    { value: 'STORE', label: '가게' },
    { value: 'AD', label: '광고' },
    { value: 'REVIEW', label: '리뷰' },
    { value: 'ACCOUNT', label: '계정' },
    { value: 'ETC', label: '기타' },
];

const InquiryModal = ({ open, onClose }) => {
    const { isLoggedIn } = useAuthStore();
    const { message } = useMessage();

    const [category, setCategory] = useState('ETC');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [guestName, setGuestName] = useState('');
    const [guestEmail, setGuestEmail] = useState('');
    const [sending, setSending] = useState(false);
    // 필드별 에러 메시지 { title: '...', content: '...' }. 비어 있으면 에러 없음.
    const [errors, setErrors] = useState({});

    // 사용자가 고치기 시작하면 그 칸의 에러는 즉시 지운다.
    // 다 고쳤는데 빨간 글씨가 남아 있으면 "아직 틀렸나?" 하고 헷갈린다.
    const clearError = (field) => setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

    const reset = () => {
        setCategory('ETC'); setTitle(''); setContent(''); setGuestName(''); setGuestEmail(''); setErrors({});
    };
    const handleClose = () => { if (!sending) { onClose(); reset(); } };

    /**
     * 검증 — 틀린 칸을 **전부** 모아 각 칸 아래에 표시한다.
     *
     * 예전엔 `if (...) { message.warning(...); return; }` 를 네 번 이어 붙여서
     * ① 첫 번째 오류만 알려주고(고치면 다음 오류가 또 나온다) ② 토스트가 사라지면 어느 칸이
     * 문제였는지 알 수 없고 ③ 보내기를 여러 번 누르면 같은 토스트가 겹쳐 쌓였다(실제 증상).
     * 한 번에 다 보여주면 사용자가 한 번에 고칠 수 있다.
     */
    const validate = () => {
        const next = {};
        if (!isLoggedIn) {
            if (!guestName.trim()) next.guestName = '이름을 입력해주세요.';
            if (!guestEmail.trim() || !EMAIL_REGEX.test(guestEmail.trim())) {
                next.guestEmail = '올바른 이메일을 입력해주세요.';
            }
        }
        if (!title.trim()) next.title = '제목을 입력해주세요.';
        if (!content.trim()) next.content = '문의 내용을 입력해주세요.';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;

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
                        <FormField label="이름" error={errors.guestName}>
                            <FormInput placeholder="이름" value={guestName}
                                onChange={(e) => { setGuestName(e.target.value); clearError('guestName'); }} maxLength={50} />
                        </FormField>
                    </div>
                    <div style={{ flex: 1.4 }}>
                        <FormField label="이메일" error={errors.guestEmail}>
                            <FormInput placeholder="example@email.com" value={guestEmail}
                                onChange={(e) => { setGuestEmail(e.target.value); clearError('guestEmail'); }} maxLength={100} />
                        </FormField>
                    </div>
                </div>
            )}
            <FormField label="문의 유형">
                {/* columns={4} — 8개가 항상 4+4로 대칭이 된다.
                    wrap(flex)은 왼쪽부터 채우는 방식이라 폭에 따라 5+3처럼 갈라졌다. */}
                <SegmentedGrid value={category} onChange={setCategory} options={CATEGORY_OPTIONS} columns={4} />
            </FormField>
            <FormField label="제목" error={errors.title}>
                <FormInput placeholder="문의 제목을 입력하세요" value={title}
                    onChange={(e) => { setTitle(e.target.value); clearError('title'); }} maxLength={200} showCount />
            </FormField>
            <FormField label="내용" error={errors.content}>
                <FormTextArea rows={6} placeholder="문의하실 내용을 자세히 적어주세요."
                    value={content} onChange={(e) => { setContent(e.target.value); clearError('content'); }}
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
