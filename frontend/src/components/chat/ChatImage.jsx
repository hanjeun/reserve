import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Image } from 'antd';
import { getChatImageBlob } from '../../utils/chatImageTransfer';
import useAuthStore from '../../store/useAuthStore';
import Bone from '../common/Bone';

/** 공개 CDN URL 대신 세션 관문을 거친 Blob을 표시한다. 계정 전환/언마운트에서 즉시 폐기한다. */
export default function ChatImage({ url, width, height }) {
    const revision = useAuthStore(state => state.sessionRevision);
    const scope = `${revision}:${url}`;
    const [result, setResult] = useState(null);
    const [previewScope, setPreviewScope] = useState(/** @type {string | null} */ (null));
    useEffect(() => {
        const controller = new AbortController();
        let alive = true;
        let objectUrl;
        getChatImageBlob(url, controller.signal).then(blob => {
            if (!alive) return;
            objectUrl = URL.createObjectURL(blob);
            setResult({ scope, src: objectUrl });
        }).catch(() => { if (alive) setResult({ scope, error: true }); });
        return () => {
            alive = false;
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [scope, url]);
    const current = result?.scope === scope ? result : null;
    const aspectRatio = width > 0 && height > 0 ? `${width} / ${height}` : '1';
    const loaded = current?.loaded === true;
    const style = { display: 'block', width: '100%', height: '100%', borderRadius: 10,
        aspectRatio, objectFit: 'contain', opacity: loaded ? 1 : 0 };
    const settle = (failed = false) => setResult(previous => previous?.scope === scope
        && previous.src === current?.src ? { ...previous, loaded: !failed, error: failed } : previous);
    // <output> 은 암묵 role=status 이고 span 과 같은 인라인 요소다.
    if (current?.error) return <output>사진을 불러오지 못했어요.</output>;
    return <div className="reserve-chat-photo-frame" style={{ width: 240, maxWidth: '100%', aspectRatio }}>
        {!loaded && <output className="reserve-chat-photo-loading" aria-label="사진을 불러오는 중" aria-busy="true">
            <Bone width="100%" height="100%" borderRadius={10} />
        </output>}
        {current?.src && <Image src={current.src} alt="대화에 첨부한 사진" style={style}
        classNames={{ root: 'reserve-chat-photo', image: 'reserve-chat-photo-image' }}
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
        preview={{ cover: false, rootClassName: 'reserve-image-preview',
            open: loaded && previewScope === scope,
            onOpenChange: open => setPreviewScope(open && loaded ? scope : null) }} />}
    </div>;
}
ChatImage.propTypes = { url: PropTypes.string.isRequired, width: PropTypes.number, height: PropTypes.number };
