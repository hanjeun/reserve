import { useRef } from 'react';
import PropTypes from 'prop-types';
import { Upload } from 'antd';
import SortableImageUpload from '../common/SortableImageUpload';
import ImageUploadButton from '../common/ImageUploadButton';
import useImagePreview from '../../hooks/useImagePreview';
import { feedMediaUrl } from '../../utils/feed';

export default function PhotoAttachControl({ images, onSelect, onRemove, onReorder, maxImages, maxBytes, busy, enabled, required = false, label = '사진' }) {
    const selecting = useRef(false);
    const { handlePreview, previewNode, suppressLinkNavigation } = useImagePreview();
    const selectionDisabled = busy || !enabled;
    const files = images.map((image, index) => ({ uid: image.uid, name: `${label} ${index + 1}`, status: 'done',
        url: feedMediaUrl(image.url), thumbUrl: feedMediaUrl(image.url), originFileObj: image.file,
        type: image.file?.type || 'image/jpeg' }));
    const selectFiles = async (file, batch) => {
        // AntD는 한 선택 묶음을 파일마다 호출한다. 기존 변환·검증에는 묶음을 한 번만 전달한다.
        if (selectionDisabled || selecting.current || file !== batch[0]) return Upload.LIST_IGNORE;
        selecting.current = true;
        try { await onSelect([...batch]); }
        finally { selecting.current = false; }
        // 선택한 파일의 저장은 작성기의 암호화 업로드 경로가 맡는다.
        return Upload.LIST_IGNORE;
    };
    return <div className="reserve-feed-photo-upload" data-discovery-swipe-ignore="true">
        <p className="reserve-feed-photo-upload-label">{label}{required && ' (필수)'}</p>
        <SortableImageUpload listType="picture-card" fileList={files} maxCount={maxImages} multiple
            accept="image/jpeg,image/png,image/webp" aria-label={`${label} 선택`} disabled={busy}
            openFileDialogOnClick={!selectionDisabled}
            beforeUpload={selectFiles} onClickCapture={suppressLinkNavigation}
            onPreview={file => handlePreview(file, files)}
            onRemove={file => { if (!busy) onRemove(file.uid); return false; }}
            onReorder={next => { if (!busy) onReorder(next.map(file => file.uid)); }}
            showUploadList={{ showPreviewIcon: true, showRemoveIcon: !busy, showDownloadIcon: false }}>
            {enabled && images.length < maxImages && <ImageUploadButton />}
        </SortableImageUpload>
        <p className="reserve-feed-note">{images.length}/{maxImages}장 · 한 장당 {Math.floor(maxBytes / 1024 / 1024)}MB 이하</p>
        {!enabled && <p className="reserve-feed-note" role="status">사진 업로드를 준비하고 있어요.{required && ' 사진 업로드가 준비되면 신청할 수 있어요.'}</p>}
        {previewNode}
    </div>;
}
PhotoAttachControl.propTypes = { images: PropTypes.arrayOf(PropTypes.object).isRequired,
    onSelect: PropTypes.func.isRequired, onRemove: PropTypes.func.isRequired, onReorder: PropTypes.func.isRequired,
    maxImages: PropTypes.number.isRequired, maxBytes: PropTypes.number.isRequired, busy: PropTypes.bool,
    enabled: PropTypes.bool, required: PropTypes.bool, label: PropTypes.string };
