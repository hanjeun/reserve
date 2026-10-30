import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { withPhotoPreviewHint } from '../../utils/photoPreview';
import { Image } from 'antd';
import { requestChatImageBlob } from '../../utils/chatImageRequests';
import useChatImageVisibility from '../../hooks/useChatImageVisibility';
import useAuthStore from '../../store/useAuthStore';
import Bone from '../common/Bone';

const RETRY_DELAYS_MS = [500, 1500];
const canRetry = error => {
    if (error?.isSessionExpired || error?.isStaleSession || error?.code === 'CHAT_IMAGE_INVALID'
        || error?.code === 'ERR_CANCELED' || error?.name === 'AbortError') return false;
    const status = error?.status ?? error?.response?.status;
    return status == null || status === 429 || status >= 500 && status < 600;
};

/** 비공개 사진은 권한 확인 후 표시하고 개별 Object URL은 화면 종료 때 해제한다. */
export default function ChatImage({ url, roomId, width, height }) {
    const revision = useAuthStore(state => state.sessionRevision);
    const scope = `${revision}:${roomId ?? ''}:${url}`;
    const [result, setResult] = useState(null);
    const [previewScope, setPreviewScope] = useState(/** @type {string | null} */ (null));
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
            requestChatImageBlob(url, controller.signal, isCurrent, `${revision}:${roomId ?? ''}`).then(blob => {
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
    }, [near, scope, url, revision, roomId, canLoad]);
    const current = result?.scope === scope ? result : null;
    const aspectRatio = width > 0 && height > 0 ? `${width} / ${height}` : '1';
    const loaded = current?.loaded === true;
    const style = { display: 'block', width: '100%', height: '100%', borderRadius: 10,
        aspectRatio, objectFit: 'contain', opacity: loaded ? 1 : 0 };
    const settle = (failed = false) => setResult(previous => previous?.scope === scope
        && previous.src === current?.src ? { ...previous, loaded: !failed, error: failed } : previous);
    // <output> 은 암묵 role=status 이고 span 과 같은 인라인 요소다.
    return <div ref={frameRef} className="reserve-chat-photo-frame" style={{ width: 240, maxWidth: '100%', aspectRatio }}>
        {current?.error ? <output>사진을 불러오지 못했어요.</output> : !loaded && <output className="reserve-chat-photo-loading" aria-label="사진을 불러오는 중" aria-busy="true">
            <Bone width="100%" height="100%" borderRadius={10} />
        </output>}
        {!current?.error && current?.src && <Image src={current.src} alt="대화에 첨부한 사진" style={style}
        classNames={{ root: 'reserve-chat-photo reserve-photo-preview-trigger', image: 'reserve-chat-photo-image', popup: { root: 'reserve-image-preview' } }}
        styles={{ root: { width: '100%', height: '100%' } }}
        onLoad={() => settle()} onError={() => settle(true)}
        role={loaded ? 'button' : undefined} tabIndex={loaded ? 0 : -1} aria-hidden={!loaded}
        aria-label="사진 크게 보기"
        onKeyDown={event => {
            if (!loaded) return;
            // 확대 후 초점이 원래 사진에 남아 있어도 Escape는 사진만 닫는다.
            if (event.key === 'Escape' && previewScope === scope) {
                event.stopPropagation();
                setPreviewScope(null);
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setPreviewScope(scope);
            }
        }}
        preview={withPhotoPreviewHint({ cover: false,
            open: loaded && previewScope === scope,
            onOpenChange: open => setPreviewScope(open && loaded ? scope : null) })} />}
    </div>;
}
ChatImage.propTypes = { url: PropTypes.string.isRequired, roomId: PropTypes.number, width: PropTypes.number, height: PropTypes.number };
