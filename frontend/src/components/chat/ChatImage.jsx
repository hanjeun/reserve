import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Image } from 'antd';
import chatService from '../../services/chatService';
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
        chatService.getImage(url, controller.signal).then(blob => {
            if (!alive) return;
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(blob.type) || blob.size > 8 * 1024 * 1024) {
                throw new Error('사진 응답 형식이 올바르지 않습니다.');
            }
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
    const style = { display: 'block', width: '100%', height: 'auto', maxWidth: 240, borderRadius: 10,
        aspectRatio: width && height ? `${width} / ${height}` : '1', objectFit: 'contain' };
    // <output> 은 암묵 role=status 이고 span 과 같은 인라인 요소다.
    if (current?.error) return <output>사진을 불러오지 못했습니다.</output>;
    if (!current?.src) return <Bone width={180} height={140} />;
    return <Image src={current.src} alt="대화에 첨부한 사진" style={style}
        styles={{ root: { width: 240, maxWidth: '100%' } }}
        role="button" tabIndex={0} aria-label="사진 크게 보기"
        onKeyDown={event => {
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
        preview={{ cover: '사진 크게 보기', rootClassName: 'reserve-image-preview',
            open: previewScope === scope, onOpenChange: open => setPreviewScope(open ? scope : null) }} />;
}
ChatImage.propTypes = { url: PropTypes.string.isRequired, width: PropTypes.number, height: PropTypes.number };
