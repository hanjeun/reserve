import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Carousel, Image } from 'antd';
import LoadingAntImage from './LoadingAntImage';
import { photoPreviewClassNames, rememberPhotoPreviewOrigin } from '../../utils/photoPreview';

/** 가게 상세·피드·소식이 같은 슬라이드, 확대 보기와 모바일 스와이프를 쓴다. */
export default function PhotoGallery({ label, sources, imageSizes, autoplay = false, wrapperStyle, imageStyle, previewEnabled = true, dots = true, onSlideChange }) {
    const [loadedSources, setLoadedSources] = useState(() => new Set());
    const gesture = useRef(null);
    const suppressClick = useRef(false);
    const rememberLoadedImage = event => {
        const image = event.target;
        const src = image?.getAttribute?.('src');
        if (!src || !image.naturalWidth || !sources.includes(src)) return;
        setLoadedSources(previous => {
            if (previous.has(src)) return previous;
            const next = new Set(previous);
            next.add(src);
            if (next.size > 64) next.delete(next.values().next().value);
            return next;
        });
    };
    if (!sources.length) return null;
    return <div style={{ position: 'relative' }} data-discovery-swipe-ignore="true">
        <div className="reserve-store-gallery" style={wrapperStyle} onLoadCapture={rememberLoadedImage}
            onPointerDownCapture={event => {
                if (!event.isPrimary || event.button !== 0) return;
                suppressClick.current = false;
                gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            }}
            onPointerMoveCapture={event => {
                const start = gesture.current;
                if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) suppressClick.current = true;
            }}
            onPointerUpCapture={() => { gesture.current = null; }}
            onPointerCancelCapture={() => { gesture.current = null; suppressClick.current = true; }}
            onClickCapture={event => {
                if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; return; }
                suppressClick.current = false;
                rememberPhotoPreviewOrigin(event);
            }}>
            <Image.PreviewGroup items={sources} classNames={photoPreviewClassNames}>
                <Carousel className="reserve-carousel" infinite draggable swipe touchMove swipeToSlide touchThreshold={12}
                    lazyLoad="ondemand"
                    dots={dots && sources.length > 1} dotPlacement="bottom" autoplay={autoplay} afterChange={onSlideChange}>
                    {sources.map((src, index) => <div key={`${src}:${index}`}>
                        <LoadingAntImage src={src} alt={`${label} 사진 ${index + 1}`} referrerPolicy="no-referrer"
                            imageSize={imageSizes?.[index]}
                            placeholder={loadedSources.has(src) ? false : undefined}
                            width="100%" style={imageStyle} draggable={false} preview={previewEnabled ? { mask: '크게 보기' } : false} />
                    </div>)}
                </Carousel>
            </Image.PreviewGroup>
        </div>
    </div>;
}
PhotoGallery.propTypes = { label: PropTypes.string.isRequired, sources: PropTypes.arrayOf(PropTypes.string).isRequired,
    imageSizes: PropTypes.arrayOf(PropTypes.shape({ width: PropTypes.number, height: PropTypes.number })),
    autoplay: PropTypes.bool, wrapperStyle: PropTypes.object, imageStyle: PropTypes.object, previewEnabled: PropTypes.bool, dots: PropTypes.bool, onSlideChange: PropTypes.func };
