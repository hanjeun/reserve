import { useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Carousel, Image } from 'antd';
import LoadingAntImage from './LoadingAntImage';
import useImagePreviewSwipe, { stepImagePreview } from '../../hooks/useImagePreviewSwipe';
import { photoPreviewClassNames, rememberPhotoPreviewOrigin, withPhotoPreviewHint } from '../../utils/photoPreview';

const PHOTO_DIALOG = '.reserve-store-detail-preview[role="dialog"]';
const FRAME_PHOTO_OPEN = 'data-store-preview-photo-open';

function handleFramePreviewKey(event, dialog) {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Escape' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') dialog.querySelector('.ant-image-preview-close')?.click();
        else stepImagePreview(dialog, event.key === 'ArrowRight');
    } else if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('button:not(:disabled), [tabindex="0"]')]
            .filter(control => control.getAttribute('aria-disabled') !== 'true');
        const first = controls[0];
        const last = controls.at(-1);
        const edge = event.shiftKey ? first : last;
        if (event.target === edge || event.target === dialog || !dialog.contains(event.target)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus({ preventScroll: true });
        }
    }
}

/** 가게 상세·피드·소식이 같은 슬라이드, 확대 보기와 모바일 스와이프를 쓴다. */
export default function PhotoGallery({ label, sources, imageSizes, autoplay = false, wrapperStyle, imageStyle,
    previewEnabled = true, previewDocument = null, dots = true, adaptiveHeight = false, onSlideChange }) {
    const [loadedSources, setLoadedSources] = useState(() => new Set());
    const gallery = useRef(null);
    const carousel = useRef(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const gesture = useRef(null);
    const previewTrigger = useRef(null);
    useImagePreviewSwipe(previewDocument);
    useLayoutEffect(() => () => previewDocument?.documentElement.removeAttribute(FRAME_PHOTO_OPEN), [previewDocument]);
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
        const focused = gallery.current?.ownerDocument.activeElement;
        if (gallery.current?.contains(focused) && focused.closest('.slick-slide')) gallery.current.focus({ preventScroll: true });
    };
    const rememberPreviewTrigger = event => {
        rememberPhotoPreviewOrigin(event);
        if (previewDocument) previewTrigger.current = event.target.closest('.ant-image[role="button"]');
    };
    const onPreviewOpenChange = open => {
        if (open || !previewDocument) setPreviewOpen(open);
        if (open) previewDocument?.documentElement.setAttribute(FRAME_PHOTO_OPEN, '');
    };
    const afterFramePreviewChange = open => {
        if (open) {
            previewDocument.querySelector(PHOTO_DIALOG)?.focus({ preventScroll: true });
            return;
        }
        setPreviewOpen(false);
        previewDocument.documentElement.removeAttribute(FRAME_PHOTO_OPEN);
        const trigger = previewTrigger.current?.isConnected ? previewTrigger.current : gallery.current;
        trigger?.focus({ preventScroll: true });
        previewTrigger.current = null;
    };
    const preview = { onOpenChange: onPreviewOpenChange, ...(previewDocument && {
        getContainer: previewDocument.body,
        focusTrap: false,
        afterOpenChange: afterFramePreviewChange,
    }) };
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
    return <div style={{ position: 'relative' }} data-discovery-swipe-ignore="true" onKeyDownCapture={event => {
        if (previewDocument && previewOpen) {
            // AntD의 전역 키 이벤트는 iframe에서 상위 창으로 전달되지 않는다.
            const dialog = previewDocument.querySelector(PHOTO_DIALOG);
            if (dialog) handleFramePreviewKey(event, dialog);
        } else if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.ant-image[role="button"]')) {
            rememberPreviewTrigger(event);
        }
    }}>
        <div ref={gallery} className="reserve-store-gallery" tabIndex={-1} role="group" aria-label={`${label} 사진`} style={wrapperStyle} onLoadCapture={rememberLoadedImage}
            onPointerDownCapture={event => {
                if (!event.currentTarget.contains(event.target) || !event.isPrimary || event.button !== 0 || event.target.closest('button')) return;
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
                if (!event.currentTarget.contains(event.target)) return;
                if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; return; }
                suppressClick.current = false;
                rememberPreviewTrigger(event);
            }}>
            <Image.PreviewGroup items={sources} classNames={photoPreviewClassNames} preview={preview}>
                <Carousel ref={carousel} className="reserve-carousel" infinite draggable={false} swipe={false} touchMove={false}
                    lazyLoad="ondemand" adaptiveHeight={adaptiveHeight}
                    dots={dots && sources.length > 1} dotPlacement="bottom" autoplay={autoplay && !previewOpen} beforeChange={beforeSlideChange} afterChange={onSlideChange}>
                    {sources.map((src, index) => <div key={`${src}:${index}`}>
                        <LoadingAntImage src={src} alt={`${label} 사진 ${index + 1}`} referrerPolicy="no-referrer"
                            imageSize={imageSizes?.[index]}
                            placeholder={loadedSources.has(src) ? false : undefined}
                            width="100%" style={imageStyle} draggable={false} preview={withPhotoPreviewHint(previewEnabled)} />
                    </div>)}
                </Carousel>
            </Image.PreviewGroup>
        </div>
    </div>;
}
PhotoGallery.propTypes = { label: PropTypes.string.isRequired, sources: PropTypes.arrayOf(PropTypes.string).isRequired,
    imageSizes: PropTypes.arrayOf(PropTypes.shape({ width: PropTypes.number, height: PropTypes.number })),
    autoplay: PropTypes.bool, wrapperStyle: PropTypes.object, imageStyle: PropTypes.object, previewEnabled: PropTypes.bool,
    previewDocument: PropTypes.object, dots: PropTypes.bool, adaptiveHeight: PropTypes.bool, onSlideChange: PropTypes.func };
