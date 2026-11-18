import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { requestChatImageBlob } from '../../utils/chatImageRequests';
import useChatImageVisibility from '../../hooks/useChatImageVisibility';
import useImagePreview from '../../hooks/useImagePreview';
import useAuthStore from '../../store/useAuthStore';
import Bone from '../common/Bone';
import { SpinIndicator } from '../common/Loading';
import { PictureOutlined } from '../common/icons';

const RETRY_DELAYS_MS = [500, 1500];
const canRetry = error => {
    if (error?.isSessionExpired || error?.isStaleSession || error?.code === 'CHAT_IMAGE_INVALID'
        || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') return false;
    const status = error?.status ?? error?.response?.status;
    return status == null || status === 429 || status >= 500 && status < 600;
};

function ChatPhoto({ src, original, roomScope, revision, loaded, onLoad, onError }) {
    const { previewOpen, handlePreview, handleCancel, previewNode } = useImagePreview();
    const active = useRef(null);
    const [status, setStatus] = useState('idle');
    useLayoutEffect(() => () => { active.current?.abort(); active.current = null; }, []);
    const open = async () => {
        if (!loaded || previewOpen || active.current) return;
        if (!original) { handlePreview({ url: src }); return; }
        const controller = new AbortController();
        active.current = controller;
        const isCurrent = () => active.current === controller && !controller.signal.aborted
            && useAuthStore.getState().sessionRevision === revision;
        setStatus('loading');
        try {
            const blob = await requestChatImageBlob(original, controller.signal, isCurrent, roomScope);
            if (isCurrent()) {
                handlePreview({ originFileObj: blob });
                setStatus('idle');
            }
        } catch {
            if (isCurrent()) setStatus('error');
        } finally {
            if (active.current === controller) active.current = null;
        }
    };
    return <>
        <button type="button" className="reserve-chat-photo reserve-photo-preview-trigger" disabled={!loaded}
            aria-hidden={!loaded} aria-label="사진 크게 보기" aria-haspopup="dialog" aria-expanded={previewOpen}
            aria-busy={status === 'loading'} aria-disabled={status === 'loading' || undefined} onClick={open}
            onKeyDown={event => {
                if (event.key !== 'Escape' || (!previewOpen && !active.current)) return;
                event.stopPropagation();
                if (previewOpen) handleCancel();
                else { active.current.abort(); active.current = null; setStatus('idle'); }
            }}>
            {src ? <img src={src} alt="대화에 첨부한 사진" className="reserve-chat-photo-image" draggable={false}
                onLoad={onLoad} onError={onError} /> : <PictureOutlined aria-hidden="true" />}
        </button>
        {status === 'loading' && <output className="reserve-chat-photo-progress" aria-label="원본 사진을 불러오는 중">
            <SpinIndicator />
        </output>}
        {status === 'error' && <output className="reserve-chat-photo-error">다시 눌러 사진 보기</output>}
        {previewNode}
    </>;
}

ChatPhoto.propTypes = { src: PropTypes.string, original: PropTypes.string, roomScope: PropTypes.string.isRequired,
    revision: PropTypes.number, loaded: PropTypes.bool.isRequired,
    onLoad: PropTypes.func.isRequired, onError: PropTypes.func.isRequired };

/** 비공개 사진은 권한 확인 후 표시하고 개별 Object URL은 화면 종료 때 해제한다. */
export default function ChatImage({ url, thumbnailUrl, roomId, width, height, compact = false }) {
    const revision = useAuthStore(state => state.sessionRevision);
    const roomScope = `${revision}:${roomId ?? ''}`;
    const source = thumbnailUrl || url;
    const scope = `${roomScope}:${url}:${source}`;
    const [result, setResult] = useState(null);
    const activeRef = useRef(null);
    const { frameRef, near, canLoad } = useChatImageVisibility(scope);
    useLayoutEffect(() => {
        const active = { failures: 0, finished: false, controller: null, objectUrl: null };
        activeRef.current = active;
        return () => {
            if (activeRef.current === active) activeRef.current = null;
            active.controller?.abort();
            if (active.objectUrl) URL.revokeObjectURL(active.objectUrl);
        };
    }, [scope]);
    useEffect(() => {
        const active = activeRef.current;
        if (!near || !active || active.finished) return undefined;
        let cancelled = false;
        let timer;
        const isCurrent = () => !cancelled && activeRef.current === active
            && useAuthStore.getState().sessionRevision === revision && canLoad();
        const attempt = () => {
            if (!isCurrent()) return;
            const controller = new AbortController();
            active.controller = controller;
            requestChatImageBlob(source, controller.signal, isCurrent, roomScope).then(blob => {
                if (!isCurrent() || controller.signal.aborted) return;
                active.objectUrl = URL.createObjectURL(blob);
                active.finished = true;
                setResult({ scope, src: active.objectUrl });
            }).catch(error => {
                if (!isCurrent() || controller.signal.aborted) return;
                if (canRetry(error) && active.failures < RETRY_DELAYS_MS.length) {
                    timer = setTimeout(attempt, RETRY_DELAYS_MS[active.failures]);
                    active.failures += 1;
                    return;
                }
                active.finished = true;
                setResult({ scope, error: true });
            });
        };
        attempt();
        return () => {
            cancelled = true;
            clearTimeout(timer);
            active.controller?.abort();
        };
    }, [near, scope, source, revision, roomScope, canLoad]);
    const current = result?.scope === scope ? result : null;
    const pictureWidth = current?.width || width;
    const pictureHeight = current?.height || height;
    const ratio = pictureWidth > 0 && pictureHeight > 0 ? pictureWidth / pictureHeight : 1;
    const aspectRatio = pictureWidth > 0 && pictureHeight > 0 ? `${pictureWidth} / ${pictureHeight}` : '1';
    const frame = compact
        ? { width: 76 * Math.min(1, ratio), height: 76 * Math.min(1, 1 / ratio) }
        : { width: 240, aspectRatio };
    const loaded = current?.loaded === true;
    const fallback = Boolean(current?.error && thumbnailUrl);
    const settle = (failed, node) => setResult(previous => previous?.scope === scope
        && previous.src === current?.src ? { ...previous, loaded: !failed, error: failed,
            width: compact ? node?.naturalWidth : undefined, height: compact ? node?.naturalHeight : undefined } : previous);
    // <output> 은 암묵 role=status 이고 span 과 같은 인라인 요소다.
    return <div ref={frameRef} className={compact ? 'reserve-chat-photo-frame is-thumbnail' : 'reserve-chat-photo-frame'}
        style={{ ...frame, maxWidth: '100%' }}>
        {current?.error && !fallback ? <output>사진을 불러오지 못했어요.</output> : !loaded && !fallback && <output className="reserve-chat-photo-loading" aria-label="사진을 불러오는 중" aria-busy="true">
            <Bone width="100%" height="100%" borderRadius={10} />
        </output>}
        {(fallback || !current?.error && current?.src) && <ChatPhoto key={scope} src={fallback ? undefined : current.src}
            original={thumbnailUrl ? url : undefined} roomScope={roomScope} revision={revision} loaded={loaded || fallback}
            onLoad={event => settle(false, event.currentTarget)} onError={() => settle(true)} />}
    </div>;
}
ChatImage.propTypes = { url: PropTypes.string.isRequired, thumbnailUrl: PropTypes.string, roomId: PropTypes.number,
    width: PropTypes.number, height: PropTypes.number, compact: PropTypes.bool };
