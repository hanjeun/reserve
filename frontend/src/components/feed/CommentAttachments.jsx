import PropTypes from 'prop-types';
import ChatAttachmentThumbnail from '../chat/ChatAttachmentThumbnail';
import { CloseOutlined } from '../common/icons';
import SortableImageUpload from '../common/SortableImageUpload';
import { feedMediaUrl } from '../../utils/feed';

export default function CommentAttachments({ images, busy, onRemove, onReorder }) {
    const files = images.map((image, index) => ({ uid: image.uid, name: `댓글 사진 ${index + 1}`,
        status: 'done', url: feedMediaUrl(image.url), thumbUrl: feedMediaUrl(image.url), originFileObj: image.file }));
    if (!files.length) return null;
    return <SortableImageUpload className="reserve-feed-comment-attachments" listType="picture-card" fileList={files}
        openFileDialogOnClick={false} disabled={busy}
        onReorder={order => onReorder(order.map(file => file.uid))}
        itemRender={(_, file) => <div className="reserve-chat-attachment reserve-feed-comment-attachment">
            <ChatAttachmentThumbnail uid={file.uid} url={file.url} file={file.originFileObj} gallery={files} />
            <button type="button" className="reserve-chat-tool" aria-label={`댓글 사진 제거: ${file.name}`}
                disabled={busy} onClick={() => onRemove(file.uid)}><CloseOutlined /></button>
        </div>} />;
}
CommentAttachments.propTypes = { images: PropTypes.array.isRequired, busy: PropTypes.bool,
    onRemove: PropTypes.func.isRequired, onReorder: PropTypes.func.isRequired };
