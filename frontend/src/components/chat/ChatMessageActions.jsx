import { useState } from 'react';
import PropTypes from 'prop-types';
import { Dropdown } from 'antd';
import { MoreOutlined, UndoOutlined } from '@ant-design/icons';
import { useMessage } from '../../hooks';
import chatService from '../../services/chatService';
import useAuthStore from '../../store/useAuthStore';

export default function ChatMessageActions({ message: item, roomId, onRetracted }) {
    const { message, confirm } = useMessage();
    const [busy, setBusy] = useState(false);
    if (!roomId || item.pending || item.retracted || item.canRetract !== true || !onRetracted) return null;
    const retract = () => {
        const revision = useAuthStore.getState().sessionRevision;
        confirm({ title: '메시지 전송을 취소할까요?',
            content: '양쪽 대화에 취소된 메시지로 표시됩니다. 이미 읽거나 내려받은 내용은 회수할 수 없으며, 신고·분쟁 검토 원본은 보존됩니다.',
            okText: '전송 취소', cancelText: '돌아가기',
            onOk: async () => {
                if (revision !== useAuthStore.getState().sessionRevision) return;
                setBusy(true);
                try {
                    const result = await chatService.retract(roomId, item.id);
                    if (revision !== useAuthStore.getState().sessionRevision) return;
                    onRetracted(result);
                    message.success('전송을 취소했습니다.');
                } catch (error) {
                    if (revision === useAuthStore.getState().sessionRevision) message.error(error.message || '전송을 취소하지 못했습니다.');
                } finally { setBusy(false); }
            },
        });
    };
    return <Dropdown trigger={['click']} menu={{ items: [{ key: 'retract', label: '전송 취소', icon: <UndoOutlined /> }], onClick: retract }}>
        <button type="button" className="reserve-chat-message-actions" disabled={busy} aria-label="메시지 관리"><MoreOutlined /></button>
    </Dropdown>;
}
ChatMessageActions.propTypes = {
    message: PropTypes.object.isRequired, roomId: PropTypes.number, onRetracted: PropTypes.func,
};
