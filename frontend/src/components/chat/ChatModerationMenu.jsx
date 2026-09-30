import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Dropdown } from 'antd';
import { EyeInvisibleOutlined, EyeOutlined, FlagOutlined, MoreOutlined, StopOutlined, UnlockOutlined } from '@ant-design/icons';
import { useMessage } from '../../hooks';
import { chatService } from '../../services';
import useAuthStore from '../../store/useAuthStore';
import ChatReportDialog from './ChatReportDialog';

/** STORE 대화에만 노출되는 차단·신고 메뉴. 자동 제재는 하지 않는다. */
const ChatModerationMenu = ({ thread, onChanged, onHidden, hidden = false, pending = false, disabled = false }) => {
    const { message, confirm } = useMessage();
    const [reportOpen, setReportOpen] = useState(false);
    const ready = thread?.viewerRole === 'MEMBER' || thread?.viewerRole === 'OWNER';
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
        const revision = useAuthStore.getState().sessionRevision;
        const nextBlocked = !thread.blockedByMe;
        confirm({
            title: nextBlocked ? '대화를 차단할까요?' : '차단을 해제할까요?',
            content: nextBlocked
                ? '차단하면 양쪽 모두 새 메시지를 보낼 수 없습니다. 이전 대화와 신고 기록은 그대로 보존됩니다.'
                : '상대방도 차단한 상태라면 내 차단을 풀어도 메시지는 계속 보낼 수 없습니다.',
            okText: nextBlocked ? '차단' : '차단 해제',
            okButtonProps: nextBlocked ? { danger: true } : undefined,
            onOk: async () => {
                if (revision !== useAuthStore.getState().sessionRevision) return;
                try {
                    await chatService.setBlocked(thread.roomId, viewerRole, nextBlocked);
                    if (revision !== useAuthStore.getState().sessionRevision) return;
                    message.success(nextBlocked ? '대화를 차단했습니다.' : '내 차단을 해제했습니다.');
                    onChanged?.();
                } catch {
                    if (revision === useAuthStore.getState().sessionRevision) message.error('차단 상태를 변경하지 못했습니다.');
                }
            },
        });
    };

    const changeVisibility = () => {
        const revision = useAuthStore.getState().sessionRevision;
        confirm({ title: hidden ? '대화를 목록에 복원할까요?' : '내 목록에서 대화를 숨길까요?',
            content: '상대방 화면과 원문·신고 자료는 삭제되지 않습니다. 숨긴 대화에서 이전 내용을 확인하거나 신고할 수 있으며 새 메시지가 오면 다시 표시됩니다.',
            okText: hidden ? '복원' : '숨기기',
            onOk: async () => {
                if (revision !== useAuthStore.getState().sessionRevision) return;
                try {
                    await chatService.setHidden(thread.roomId, viewerRole, !hidden);
                    if (revision !== useAuthStore.getState().sessionRevision) return;
                    onHidden?.();
                    message.success(hidden ? '대화를 복원했습니다.' : '내 목록에서 숨겼습니다.');
                } catch { if (revision === useAuthStore.getState().sessionRevision) message.error('대화 표시 상태를 변경하지 못했습니다.'); }
            },
        });
    };

    let blockLabel = '대화 차단';
    if (thread.blockedByMe) blockLabel = '내 차단 해제';
    else if (blockedByOther) blockLabel = '상대방이 차단한 대화';
    const items = [
        { key: 'visibility', icon: hidden ? <EyeOutlined /> : <EyeInvisibleOutlined />, label: hidden ? '대화 복원' : '내 목록에서 숨기기' },
        ...(thread.type === 'STORE' ? [
        {
            key: 'block',
            icon: thread.blockedByMe ? <UnlockOutlined /> : <StopOutlined />,
            label: blockLabel,
            disabled: blockedByOther,
        },
        { key: 'report', icon: <FlagOutlined />, label: '대화 신고' },
        ] : []),
    ];

    return (
        <>
            <Dropdown
                trigger={['click']}
                menu={{
                    items,
                    onClick: ({ key }) => {
                        if (key === 'block') changeBlock();
                        if (key === 'report') setReportOpen(true);
                        if (key === 'visibility') changeVisibility();
                    },
                }}
            >
                {/* 옆의 닫기(X)와 같은 44×44 아이콘 버튼 — 평소 투명, hover 에 회색 판 (2026-09-23) */}
                <button type="button" className="reserve-chat-icon-button" aria-label="대화 관리">
                    <MoreOutlined />
                </button>
            </Dropdown>
            {reportOpen && <ChatReportDialog roomId={thread.roomId} viewerRole={viewerRole} onClose={() => setReportOpen(false)} />}
        </>
    );
};

ChatModerationMenu.propTypes = {
    pending: PropTypes.bool,
    disabled: PropTypes.bool,
    thread: PropTypes.object,
    onChanged: PropTypes.func,
    onHidden: PropTypes.func,
    hidden: PropTypes.bool,
};

export default ChatModerationMenu;
