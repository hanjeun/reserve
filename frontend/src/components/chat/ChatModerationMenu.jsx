import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Dropdown } from 'antd';
import { FlagOutlined, MoreOutlined, StopOutlined, UnlockOutlined } from '@ant-design/icons';
import { FormField, FormModal, FormSelect, FormTextArea } from '../common';
import { useMessage } from '../../hooks';
import { chatService } from '../../services';

const REPORT_REASONS = [
    { value: 'SPAM', label: '스팸·도배' },
    { value: 'HARASSMENT', label: '욕설·괴롭힘' },
    { value: 'INAPPROPRIATE', label: '부적절한 내용' },
    { value: 'FRAUD', label: '사기·결제 유도' },
    { value: 'OTHER', label: '기타' },
];

/** STORE 대화에만 노출되는 차단·신고 메뉴. 자동 제재는 하지 않는다. */
const ChatModerationMenu = ({ thread, onChanged, pending = false, disabled = false }) => {
    const { message, confirm } = useMessage();
    const [reportOpen, setReportOpen] = useState(false);
    const [reason, setReason] = useState(null);
    const [details, setDetails] = useState('');
    const [reasonError, setReasonError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const ready = thread?.type === 'STORE';
    // 가게 문의는 대화를 불러오는 동안에도 X 와 함께 자리를 지킨다(비활성). 불러온 뒤 튀어나오지 않게 한다.
    if (!ready && !pending) return null;
    if (!ready || disabled) {
        return (
            <button type="button" className="reserve-chat-icon-button" aria-label="대화 관리" disabled>
                <MoreOutlined />
            </button>
        );
    }

    const viewerRole = thread.viewerRole === 'OWNER' ? 'OWNER' : 'MEMBER';
    const blockedByOther = thread.blocked && !thread.blockedByMe;
    const changeBlock = () => {
        const nextBlocked = !thread.blockedByMe;
        confirm({
            title: nextBlocked ? '대화를 차단할까요?' : '차단을 해제할까요?',
            content: nextBlocked
                ? '차단하면 양쪽 모두 새 메시지를 보낼 수 없습니다. 이전 대화와 신고 기록은 그대로 보존됩니다.'
                : '상대방도 차단한 상태라면 내 차단을 풀어도 메시지는 계속 보낼 수 없습니다.',
            okText: nextBlocked ? '차단' : '차단 해제',
            okButtonProps: nextBlocked ? { danger: true } : undefined,
            onOk: async () => {
                try {
                    await chatService.setBlocked(thread.roomId, viewerRole, nextBlocked);
                    message.success(nextBlocked ? '대화를 차단했습니다.' : '내 차단을 해제했습니다.');
                    onChanged?.();
                } catch {
                    message.error('차단 상태를 변경하지 못했습니다.');
                }
            },
        });
    };

    const openReport = () => {
        setReason(null);
        setDetails('');
        setReasonError('');
        setReportOpen(true);
    };
    const closeReport = () => {
        if (!submitting) setReportOpen(false);
    };
    const submitReport = async () => {
        if (!reason) {
            setReasonError('신고 사유를 선택해주세요.');
            return;
        }
        if (reason === 'OTHER' && !details.trim()) {
            setReasonError('기타 사유를 설명해주세요.');
            return;
        }
        setReasonError('');
        setSubmitting(true);
        try {
            await chatService.reportConversation(thread.roomId, viewerRole, {
                reason,
                details: details.trim() || undefined,
            });
            setReportOpen(false);
            message.success('신고를 접수했습니다. 관리자가 확인할게요.');
        } catch (error) {
            message.error((error?.status ?? error?.response?.status) === 429
                ? '신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
                : '신고를 접수하지 못했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    const items = [
        {
            key: 'block',
            icon: thread.blockedByMe ? <UnlockOutlined /> : <StopOutlined />,
            label: thread.blockedByMe ? '내 차단 해제' : (blockedByOther ? '상대방이 차단한 대화' : '대화 차단'),
            disabled: blockedByOther,
        },
        { key: 'report', icon: <FlagOutlined />, label: '대화 신고' },
    ];

    return (
        <>
            <Dropdown
                trigger={['click']}
                menu={{
                    items,
                    onClick: ({ key }) => {
                        if (key === 'block') changeBlock();
                        if (key === 'report') openReport();
                    },
                }}
            >
                {/* 옆의 닫기(X)와 같은 44×44 아이콘 버튼 — 평소 투명, hover 에 회색 판 (2026-09-23) */}
                <button type="button" className="reserve-chat-icon-button" aria-label="대화 관리">
                    <MoreOutlined />
                </button>
            </Dropdown>
            <FormModal
                title="대화 신고"
                open={reportOpen}
                onClose={closeReport}
                onSubmit={submitReport}
                submitting={submitting}
                submitText="신고 접수"
                submitDisabled={!reason}
            >
                <FormField label="신고 사유" error={reasonError}>
                    <FormSelect
                        value={reason}
                        onChange={(value) => { setReason(value); setReasonError(''); }}
                        options={REPORT_REASONS}
                        placeholder="사유를 선택해주세요"
                    />
                </FormField>
                <FormField label="상세 설명 (선택)">
                    <FormTextArea
                        value={details}
                        onChange={(event) => setDetails(event.target.value)}
                        rows={4}
                        maxLength={500}
                        showCount
                        placeholder="관리자가 확인할 내용을 적어주세요"
                    />
                </FormField>
            </FormModal>
        </>
    );
};

ChatModerationMenu.propTypes = {
    pending: PropTypes.bool,
    disabled: PropTypes.bool,
    thread: PropTypes.object,
    onChanged: PropTypes.func,
};

export default ChatModerationMenu;
