import { useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import chatService from '../../services/chatService';
import useAuthStore from '../../store/useAuthStore';
import useMessage from '../../hooks/useMessage';
import { CHAT_DOCUMENT_MAX_BYTES, formatChatFileSize } from '../../utils/chatAttachments';
import { saveChatBlob } from '../../utils/chatImageTransfer';
import { DownloadOutlined, FileTextOutlined } from '../common/icons';
import { SpinIndicator } from '../common/Loading';

const FILE_PATH = /^\/api\/(?:v1\/)?(?:chat\/files|admin\/chat\/reports\/[1-9]\d*\/files)\/[1-9]\d*$/;

export default function ChatFileDownload({ url, filename, bytes }) {
    const { message } = useMessage();
    const revision = useAuthStore(state => state.sessionRevision);
    const activeRequest = useRef(null);
    const scope = `${revision}:${url}`;
    const [status, setStatus] = useState(() => ({ scope, busy: false }));
    if (status.scope !== scope) setStatus({ scope, busy: false });
    const busy = status.scope === scope && status.busy;
    useLayoutEffect(() => () => {
        activeRequest.current?.abort();
        activeRequest.current = null;
    }, [url, revision]);
    const name = filename || '첨부 파일';
    const size = formatChatFileSize(bytes);
    const download = async () => {
        if (!FILE_PATH.test(url) || activeRequest.current) return;
        const request = new AbortController();
        activeRequest.current = request;
        setStatus({ scope, busy: true });
        const isCurrent = () => activeRequest.current === request && !request.signal.aborted
            && revision === useAuthStore.getState().sessionRevision;
        try {
            const blob = await chatService.getFile(url, request.signal);
            if (!isCurrent()) return;
            if (!(blob instanceof Blob) || blob.type !== 'application/octet-stream' || !blob.size || blob.size > CHAT_DOCUMENT_MAX_BYTES) {
                throw new Error('첨부 파일 응답을 확인할 수 없어요.');
            }
            saveChatBlob(blob, filename || 'reserve-chat-file');
        } catch (error) {
            if (isCurrent()) message.error(error?.message || '첨부 파일을 내려받지 못했어요.');
        } finally {
            if (activeRequest.current === request) {
                activeRequest.current = null;
                setStatus({ scope, busy: false });
            }
        }
    };
    return <button type="button" className="reserve-chat-file-download" onClick={download}
        aria-label={`파일 내려받기: ${name}`} aria-busy={busy || undefined} disabled={busy || !FILE_PATH.test(url)}>
        <FileTextOutlined aria-hidden="true" />
        <span className="reserve-chat-draft-file-copy">
            <span title={name}>{name}</span>
            {size && <small>{size}</small>}
        </span>
        {busy ? <span aria-hidden="true"><SpinIndicator /></span> : <DownloadOutlined aria-hidden="true" />}
    </button>;
}

ChatFileDownload.propTypes = { url: PropTypes.string.isRequired, filename: PropTypes.string, bytes: PropTypes.number };
