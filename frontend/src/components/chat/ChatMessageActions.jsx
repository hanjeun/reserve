import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Dropdown } from 'antd';
import { DeleteOutlined, DownloadOutlined, FlagOutlined, MoreOutlined, UndoOutlined } from '@ant-design/icons';
import { useMessage } from '../../hooks';
import chatService from '../../services/chatService';
import useAuthStore from '../../store/useAuthStore';
import ChatReportDialog from './ChatReportDialog';
import { downloadChatImage } from '../../utils/chatImageTransfer';

export default function ChatMessageActions({ message: item, roomId, onRetracted, onHidden = onRetracted, reportRole, timestamp = '' }) {
    const { message, confirm } = useMessage();
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const scope = `${sessionRevision}:${roomId}:${item.id}:${item.imageUrl}:${item.pending}:${item.expired}:${item.retracted}:${item.hidden}`;
    const [busyScope, setBusyScope] = useState(null);
    const busy = busyScope === scope;
    const [reportOpen, setReportOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const downloadController = useRef(null);
    const writeController = useRef(null);
    const activeScope = useRef(null);
    useLayoutEffect(() => {
        const token = { scope };
        activeScope.current = token;
        return () => {
            if (activeScope.current === token) activeScope.current = null;
            writeController.current?.abort();
            writeController.current = null;
        };
    }, [scope]);
    const currentItem = useRef(item);
    useLayoutEffect(() => { currentItem.current = item; }, [item]);
    useEffect(() => () => {
        downloadController.current?.abort();
        downloadController.current = null;
    }, [sessionRevision, roomId, item.id, item.imageUrl, item.pending, item.expired, item.retracted, item.hidden]);
    const canRetract = !item.retracted && !item.expired && item.canRetract === true && Boolean(onRetracted);
    const canDownload = Boolean(item.imageUrl) && !item.retracted && !item.expired;
    const canHide = item.id > 0 && !item.hidden && Boolean(onHidden);
    const canReport = Boolean(reportRole) && !item.expired;
    if (!roomId || item.pending || item.hidden || (!canRetract && !canReport && !canDownload && !canHide)) {
        return timestamp ? <span className="reserve-chat-message-time">{timestamp}</span> : null;
    }
    const changeMessage = action => {
        const hiding = action === 'hide';
        if (busy || (hiding ? !canHide : !canRetract)) return;
        const token = activeScope.current;
        const revision = useAuthStore.getState().sessionRevision;
        const isCurrent = () => token != null && activeScope.current === token
            && revision === useAuthStore.getState().sessionRevision;
        confirm({ title: hiding ? '이 메시지를 나에게만 삭제할까요?' : '메시지 전송을 취소할까요?',
            content: hiding ? '이 계정의 대화 화면에서 삭제돼요. 상대방 대화와 신고·분쟁 검토 원본은 유지되며, 삭제한 메시지는 다시 표시할 수 없어요.'
                : '양쪽 대화에 취소된 메시지로 표시돼요. 이미 읽거나 내려받은 내용은 회수할 수 없으며, 신고·분쟁 검토 원본은 보존돼요.',
            okText: hiding ? '나에게만 삭제' : '전송 취소', cancelText: '돌아가기',
            onOk: async () => {
                if (!isCurrent() || writeController.current) return;
                const controller = new AbortController();
                writeController.current = controller;
                setBusyScope(scope);
                try {
                    const result = await (hiding ? chatService.hideMessage : chatService.retract)(roomId, item.id,
                        { signal: controller.signal });
                    if (!isCurrent() || controller.signal.aborted) return;
                    (hiding ? onHidden : onRetracted)(result);
                    message.success(hiding ? '나에게만 삭제했어요.' : '전송을 취소했어요.');
                } catch (error) {
                    if (isCurrent() && !controller.signal.aborted) message.error(error.message
                        || (hiding ? '메시지를 삭제하지 못했어요.' : '전송을 취소하지 못했어요.'));
                } finally {
                    if (writeController.current === controller) writeController.current = null;
                    setBusyScope(current => current === scope ? null : current);
                }
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
                && current.imageUrl === item.imageUrl && !current.pending && !current.expired && !current.retracted && !current.hidden;
        };
        setBusyScope(scope);
        try {
            await downloadChatImage(item.imageUrl, controller.signal, isCurrent, item.imageOriginalFilename);
        } catch (error) {
            if (!controller.signal.aborted && isCurrent()) message.error(error.message || '사진을 내려받지 못했어요.');
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
            : canReport ? [{ key: 'report', label: '메시지 신고', icon: <FlagOutlined /> }] : []),
        ...(canHide ? [{ key: 'hide', label: '나에게만 삭제', icon: <DeleteOutlined /> }] : []),
    ];
    return <><span className="reserve-chat-message-meta" data-menu-open={menuOpen}>
        <span className="reserve-chat-message-time">{timestamp}</span>
        <Dropdown trigger={['click']} open={menuOpen} onOpenChange={setMenuOpen} menu={{ items, onClick: ({ key }) => {
        setMenuOpen(false);
        if (key === 'report') setReportOpen(true);
        else if (key === 'download') void download();
        else changeMessage(key);
    } }}>
        <button type="button" className="reserve-chat-message-actions" disabled={busy} aria-label="메시지 관리" aria-expanded={menuOpen}><MoreOutlined /></button>
    </Dropdown>
    </span>
        {reportOpen && <ChatReportDialog roomId={roomId} viewerRole={reportRole} messageId={item.id}
            onClose={() => setReportOpen(false)} />}
    </>;
}
ChatMessageActions.propTypes = {
    message: PropTypes.object.isRequired, roomId: PropTypes.number, onRetracted: PropTypes.func, onHidden: PropTypes.func, reportRole: PropTypes.string,
    timestamp: PropTypes.string,
};
