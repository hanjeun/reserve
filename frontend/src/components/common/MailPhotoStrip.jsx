import PropTypes from 'prop-types';
import ChatAttachmentThumbnail from '../chat/ChatAttachmentThumbnail';
import { FormField } from './FormModal';

export default function MailPhotoStrip({ photos }) {
    if (!photos.length) return null;
    return <FormField label="첨부 사진">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {photos.map(photo => <ChatAttachmentThumbnail key={photo.uid} uid={photo.uid} url={photo.url} gallery={photos} />)}
        </div>
    </FormField>;
}

MailPhotoStrip.propTypes = {
    photos: PropTypes.arrayOf(PropTypes.shape({ uid: PropTypes.string.isRequired, url: PropTypes.string.isRequired })).isRequired,
};
