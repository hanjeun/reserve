import { useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Carousel, Image } from 'antd';
import LoadingAntImage from './LoadingAntImage';
import { photoPreviewClassNames, rememberPhotoPreviewOrigin } from '../../utils/photoPreview';

/** 가게 상세·피드·소식이 같은 슬라이드, 확대 보기와 모바일 스와이프를 쓴다. */
export default function PhotoGallery({ label, sources, imageSizes, autoplay = false, wrapperStyle, imageStyle, previewEnabled = true, dots = true, adaptiveHeight = false, onSlideChange }) {
    const [loadedSources, setLoadedSources] = useState(() => new Set());
    const gallery = useRef(null);
    const carousel = useRef(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const gesture = useRef(null);
    useLayoutEffect(() => {
        const node = gallery.current;
        if (!node) return undefined;
        const updateSlides = () => node.querySelectorAll('.slick-slide').forEach(slide => { slide.inert = slide.getAttribute('aria-hidden') === 'true'; });
        updateSlides();
        const observer = new MutationObserver(updateSlides);
        observer.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-hidden'] });
        return () => observer.disconnect();
    }, [sources.length]);
    const beforeSlideChange = () => {
        const focused = document.activeElement;
        if (gallery.current?.contains(focused) && focused.closest('.slick-slide')) gallery.current.focus({ preventScroll: true });
    };
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
        <div ref={gallery} className="reserve-store-gallery" tabIndex={-1} role="group" aria-label={`${label} 사진`} style={wrapperStyle} onLoadCapture={rememberLoadedImage}
            onPointerDownCapture={event => {
                if (!event.isPrimary || event.button !== 0 || event.target.closest('button')) return;
                suppressClick.current = false;
                gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            }}
            onPointerMoveCapture={event => {
                const start = gesture.current;
                if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) suppressClick.current = true;
            }}
            onPointerUpCapture={event => {
                const start = gesture.current;
                gesture.current = null;
                if (start?.id !== event.pointerId) return;
                const dx = event.clientX - start.x;
                const dy = event.clientY - start.y;
                if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.25 || sources.length < 2) return;
                suppressClick.current = true;
                if (dx < 0) carousel.current?.next();
                else carousel.current?.prev();
            }}
            onPointerCancelCapture={() => { gesture.current = null; suppressClick.current = true; }}
            onClickCapture={event => {
                if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; return; }
                suppressClick.current = false;
                rememberPhotoPreviewOrigin(event);
            }}>
            <Image.PreviewGroup items={sources} classNames={photoPreviewClassNames} preview={{ onOpenChange: setPreviewOpen }}>
                <Carousel ref={carousel} className="reserve-carousel" infinite draggable={false} swipe={false} touchMove={false}
                    lazyLoad="ondemand" adaptiveHeight={adaptiveHeight}
                    dots={dots && sources.length > 1} dotPlacement="bottom" autoplay={autoplay && !previewOpen} beforeChange={beforeSlideChange} afterChange={onSlideChange}>
                    {sources.map((src, index) => <div key={`${src}:${index}`}>
                        <LoadingAntImage src={src} alt={`${label} 사진 ${index + 1}`} referrerPolicy="no-referrer"
                            imageSize={imageSizes?.[index]}
                            placeholder={loadedSources.has(src) ? false : undefined}
                            width="100%" style={imageStyle} draggable={false}
                            aria-label={previewEnabled ? `${label} 사진 ${index + 1} 크게 보기` : undefined}
                            preview={previewEnabled ? { cover: '' } : false} />
                    </div>)}
                </Carousel>
            </Image.PreviewGroup>
        </div>
    </div>;
}
PhotoGallery.propTypes = { label: PropTypes.string.isRequired, sources: PropTypes.arrayOf(PropTypes.string).isRequired,
    imageSizes: PropTypes.arrayOf(PropTypes.shape({ width: PropTypes.number, height: PropTypes.number })),
    autoplay: PropTypes.bool, wrapperStyle: PropTypes.object, imageStyle: PropTypes.object, previewEnabled: PropTypes.bool, dots: PropTypes.bool, adaptiveHeight: PropTypes.bool, onSlideChange: PropTypes.func };
