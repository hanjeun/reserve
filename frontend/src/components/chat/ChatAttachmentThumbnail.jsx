import { useCallback } from 'react';
import PropTypes from 'prop-types';
import useImagePreview from '../../hooks/useImagePreview';
import LoadingImage from '../common/LoadingImage';
import { colors, radius } from '../../styles/tokens';

/** Chat and feed composers share the same attachment size and image preview. */
export default function ChatAttachmentThumbnail({ file, uid, url, gallery, onReady }) {
    const { previewOpen, handlePreview, handleCancel, previewNode } = useImagePreview();
    const imageRef = useCallback(image => {
        if (image?.complete) queueMicrotask(() => onReady?.());
    }, [onReady]);
    return <>
        <button type="button" className="reserve-chat-attachment-preview" aria-label="첨부 사진 크게 보기"
            onKeyDown={event => {
                if (event.key === 'Escape' && previewOpen) { event.stopPropagation(); handleCancel(); }
            }}
            onClick={() => handlePreview({ uid, url, originFileObj: file }, gallery)}>
            <LoadingImage ref={imageRef} src={url} alt="첨부 사진" onLoad={onReady} onError={onReady} style={{ width: 44, height: 44, objectFit: 'cover',
                borderRadius: radius.md, border: `1px solid ${colors.border.light}` }} />
        </button>
        {previewNode}
    </>;
}
ChatAttachmentThumbnail.propTypes = { file: PropTypes.object, uid: PropTypes.string, url: PropTypes.string.isRequired, gallery: PropTypes.array, onReady: PropTypes.func };
