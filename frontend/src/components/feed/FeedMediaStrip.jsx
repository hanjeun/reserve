import PropTypes from 'prop-types';
import { Image } from 'antd';
import LoadingAntImage from '../common/LoadingAntImage';
import PhotoPreviewImage from '../common/PhotoPreviewImage';
import { photoPreviewClassNames, rememberPhotoPreviewOrigin } from '../../utils/photoPreview';
import useMediaStripDrag from '../../hooks/useMediaStripDrag';

/** 목록 사진은 원본 비율의 작은 가로 묶음, 확대는 가게 상세와 같은 뷰어다. */
export default function FeedMediaStrip({ images, label = '게시물' }) {
    const drag = useMediaStripDrag('.reserve-feed-media-item');
    if (!images.length) return null;
    return <div {...drag} className={`reserve-feed-media-strip${images.length === 1 ? ' is-single' : ''}`} data-discovery-swipe-ignore="true"
        role="group" tabIndex={images.length > 1 ? 0 : undefined} aria-label={`${label} 사진 ${images.length}장${images.length > 1 ? ', 좌우로 넘겨보세요.' : ''}`}
        onClickCapture={event => {
            drag.onClickCapture(event);
            if (!event.defaultPrevented) rememberPhotoPreviewOrigin(event);
        }}>
        <Image.PreviewGroup items={images.map(image => image.previewSrc ?? image.src)} classNames={photoPreviewClassNames}
            preview={images.some(image => image.previewSrc)
                ? { imageRender: image => <PhotoPreviewImage key={image.props.src} image={image} /> } : undefined}>
            {images.map((image, index) => <div key={image.id || `${image.src}:${index}`} className="reserve-feed-media-item"
                style={{ '--feed-media-ratio': image.width > 0 && image.height > 0 ? image.width / image.height : 4 / 3 }}>
                <LoadingAntImage src={image.src} alt={`${label} 사진 ${index + 1}`} width="100%" height="100%" draggable={false} loading="lazy" decoding="async"
                    referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', aspectRatio: 'auto', objectFit: 'cover', display: 'block' }}
                    preview={{ mask: false, src: image.previewSrc }} />
            </div>)}
        </Image.PreviewGroup>
    </div>;
}
FeedMediaStrip.propTypes = { images: PropTypes.arrayOf(PropTypes.object).isRequired, label: PropTypes.string };
