import { useState } from 'react';
import PropTypes from 'prop-types';
import { Dropdown } from 'antd';
import { FlagOutlined, MoreOutlined, UndoOutlined } from '@ant-design/icons';
import { useMessage } from '../../hooks';
import chatService from '../../services/chatService';
import useAuthStore from '../../store/useAuthStore';
import ChatReportDialog from './ChatReportDialog';

export default function ChatMessageActions({ message: item, roomId, onRetracted, reportRole, timestamp = '' }) {
    const { message, confirm } = useMessage();
    const [busy, setBusy] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const canRetract = !item.retracted && item.canRetract === true && Boolean(onRetracted);
    if (!roomId || item.pending || item.expired || (!canRetract && !reportRole)) {
        return timestamp ? <span className="reserve-chat-message-time">{timestamp}</span> : null;
    }
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
    const items = canRetract ? [{ key: 'retract', label: '전송 취소', icon: <UndoOutlined /> }]
        : [{ key: 'report', label: '메시지 신고', icon: <FlagOutlined /> }];
    return <><span className="reserve-chat-message-meta" data-menu-open={menuOpen}>
        <span className="reserve-chat-message-time">{timestamp}</span>
        <Dropdown trigger={['click']} open={menuOpen} onOpenChange={setMenuOpen} menu={{ items, onClick: ({ key }) => {
        setMenuOpen(false);
        if (key === 'report') setReportOpen(true);
        else retract();
    } }}>
        <button type="button" className="reserve-chat-message-actions" disabled={busy} aria-label="메시지 관리" aria-expanded={menuOpen}><MoreOutlined /></button>
    </Dropdown>
    </span>
        {reportOpen && <ChatReportDialog roomId={roomId} viewerRole={reportRole} messageId={item.id}
            onClose={() => setReportOpen(false)} />}
    </>;
}
ChatMessageActions.propTypes = {
    message: PropTypes.object.isRequired, roomId: PropTypes.number, onRetracted: PropTypes.func, reportRole: PropTypes.string,
    timestamp: PropTypes.string,
};
