import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Dropdown } from 'antd';
import { DownloadOutlined, FlagOutlined, MoreOutlined, UndoOutlined } from '@ant-design/icons';
import { useMessage } from '../../hooks';
import chatService from '../../services/chatService';
import useAuthStore from '../../store/useAuthStore';
import ChatReportDialog from './ChatReportDialog';
import { downloadChatImage } from '../../utils/chatImageTransfer';

export default function ChatMessageActions({ message: item, roomId, onRetracted, reportRole, timestamp = '' }) {
    const { message, confirm } = useMessage();
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const scope = `${sessionRevision}:${roomId}:${item.id}:${item.imageUrl}:${item.pending}:${item.expired}:${item.retracted}`;
    const [busyScope, setBusyScope] = useState(null);
    const busy = busyScope === scope;
    const [reportOpen, setReportOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const downloadController = useRef(null);
    const currentItem = useRef(item);
    useLayoutEffect(() => { currentItem.current = item; }, [item]);
    useEffect(() => () => {
        downloadController.current?.abort();
        downloadController.current = null;
    }, [sessionRevision, roomId, item.id, item.imageUrl, item.pending, item.expired, item.retracted]);
    const canRetract = !item.retracted && item.canRetract === true && Boolean(onRetracted);
    const canDownload = Boolean(item.imageUrl) && !item.retracted;
    if (!roomId || item.pending || item.expired || (!canRetract && !reportRole && !canDownload)) {
        return timestamp ? <span className="reserve-chat-message-time">{timestamp}</span> : null;
    }
    const retract = () => {
        const revision = useAuthStore.getState().sessionRevision;
        confirm({ title: '메시지 전송을 취소할까요?',
            content: '양쪽 대화에 취소된 메시지로 표시됩니다. 이미 읽거나 내려받은 내용은 회수할 수 없으며, 신고·분쟁 검토 원본은 보존됩니다.',
            okText: '전송 취소', cancelText: '돌아가기',
            onOk: async () => {
                if (revision !== useAuthStore.getState().sessionRevision) return;
                setBusyScope(scope);
                try {
                    const result = await chatService.retract(roomId, item.id);
                    if (revision !== useAuthStore.getState().sessionRevision) return;
                    onRetracted(result);
                    message.success('전송을 취소했습니다.');
                } catch (error) {
                    if (revision === useAuthStore.getState().sessionRevision) message.error(error.message || '전송을 취소하지 못했습니다.');
                } finally { setBusyScope(current => current === scope ? null : current); }
            },
        });
    };
    const download = async () => {
        if (busy || !canDownload) return;
        const controller = new AbortController();
        downloadController.current?.abort();
        downloadController.current = controller;
        const revision = useAuthStore.getState().sessionRevision;
        const isCurrent = () => {
            const current = currentItem.current;
            return revision === useAuthStore.getState().sessionRevision && current.id === item.id
                && current.imageUrl === item.imageUrl && !current.pending && !current.expired && !current.retracted;
        };
        setBusyScope(scope);
        try {
            await downloadChatImage(item.imageUrl, controller.signal, isCurrent);
        } catch (error) {
            if (!controller.signal.aborted && isCurrent()) message.error(error.message || '사진을 내려받지 못했습니다.');
        } finally {
            if (downloadController.current === controller) {
                downloadController.current = null;
                setBusyScope(current => current === scope ? null : current);
            }
        }
    };
    const items = [
        ...(canDownload ? [{ key: 'download', label: '다운로드', icon: <DownloadOutlined /> }] : []),
        ...(canRetract ? [{ key: 'retract', label: '전송 취소', icon: <UndoOutlined /> }]
            : reportRole ? [{ key: 'report', label: '메시지 신고', icon: <FlagOutlined /> }] : []),
    ];
    return <><span className="reserve-chat-message-meta" data-menu-open={menuOpen}>
        <span className="reserve-chat-message-time">{timestamp}</span>
        <Dropdown trigger={['click']} open={menuOpen} onOpenChange={setMenuOpen} menu={{ items, onClick: ({ key }) => {
        setMenuOpen(false);
        if (key === 'report') setReportOpen(true);
        else if (key === 'download') void download();
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
