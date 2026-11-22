import PropTypes from 'prop-types';
import SortableImageUpload from '../common/SortableImageUpload';
import useImagePreview from '../../hooks/useImagePreview';
import { feedMediaUrl } from '../../utils/feed';

export default function CommentAttachments({ images, busy, onRemove, onReorder }) {
    const { handlePreview, previewNode } = useImagePreview();
    const files = images.map((image, index) => ({ uid: image.uid, name: `댓글 사진 ${index + 1}`,
        status: 'done', url: feedMediaUrl(image.url), thumbUrl: feedMediaUrl(image.url), originFileObj: image.file }));
    if (!files.length) return null;
    return <>
        <SortableImageUpload listType="picture-card" fileList={files} openFileDialogOnClick={false} disabled={busy}
            onReorder={order => onReorder(order.map(file => file.uid))} onPreview={file => handlePreview(file, files)}
            onRemove={file => { if (!busy) onRemove(file.uid); return false; }} showUploadList={{ showRemoveIcon: true }} />
        {previewNode}
    </>;
}
CommentAttachments.propTypes = { images: PropTypes.array.isRequired, busy: PropTypes.bool,
    onRemove: PropTypes.func.isRequired, onReorder: PropTypes.func.isRequired };
