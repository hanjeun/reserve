import { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Image } from 'antd';
import LoadingAntImage from '../common/LoadingAntImage';
import { photoPreviewClassNames, rememberPhotoPreviewOrigin } from '../../utils/photoPreview';
import useReducedMotion from '../../hooks/useReducedMotion';

/** 목록 사진은 원본 비율의 작은 가로 묶음, 확대는 가게 상세와 같은 뷰어다. */
export default function FeedMediaStrip({ images, label = '게시물' }) {
    const gesture = useRef(null);
    const stripRef = useRef(null);
    const frame = useRef(0);
    const ignoreClickUntil = useRef(0);
    const reducedMotion = useReducedMotion();
    const stopMotion = useCallback(() => {
        const drag = gesture.current;
        const node = stripRef.current;
        gesture.current = null;
        cancelAnimationFrame(frame.current); frame.current = 0;
        if (drag?.dragging) ignoreClickUntil.current = Date.now() + 350;
        if (drag && node?.hasPointerCapture(drag.id)) node.releasePointerCapture(drag.id);
        node?.style.removeProperty('scroll-snap-type');
        node?.classList.remove('is-dragging');
    }, []);
    useEffect(() => stopMotion, [stopMotion]);
    const bounds = node => Math.max(0, node.scrollWidth - node.clientWidth);
    const clamp = (node, value) => Math.max(0, Math.min(bounds(node), value));
    const glide = (node, target) => {
        const from = node.scrollLeft;
        if (reducedMotion || Math.abs(target - from) < 1) { node.scrollLeft = target; stopMotion(); return; }
        const start = performance.now();
        const duration = Math.min(300, 180 + Math.abs(target - from) * 0.15);
        const step = now => {
            const progress = Math.min(1, (now - start) / duration);
            node.scrollLeft = from + (target - from) * (1 - (1 - progress) ** 3);
            if (progress < 1) frame.current = requestAnimationFrame(step);
            else stopMotion();
        };
        frame.current = requestAnimationFrame(step);
    };
    const finish = (event, cancelled = false) => {
        const drag = gesture.current;
        if (drag?.id !== event.pointerId) return;
        const node = event.currentTarget;
        cancelAnimationFrame(frame.current); frame.current = 0;
        gesture.current = null;
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
        if (drag.dragging) ignoreClickUntil.current = Date.now() + 350;
        if (!drag.dragging || cancelled) { stopMotion(); return; }
        node.scrollLeft = clamp(node, drag.target);
        const velocity = event.timeStamp - drag.time < 80 ? drag.velocity : 0;
        const projected = clamp(node, node.scrollLeft + Math.max(-node.clientWidth, Math.min(node.clientWidth, velocity * 160)));
        const left = node.getBoundingClientRect().left;
        const points = [0, ...Array.from(node.querySelectorAll('.reserve-feed-media-item'), item => clamp(node, item.getBoundingClientRect().left - left + node.scrollLeft)), bounds(node)];
        const target = points.reduce((closest, point) => Math.abs(point - projected) < Math.abs(closest - projected) ? point : closest, points[0]);
        node.classList.remove('is-dragging');
        glide(node, target);
    };
    if (!images.length) return null;
    return <div ref={stripRef} className={`reserve-feed-media-strip${images.length === 1 ? ' is-single' : ''}`} data-discovery-swipe-ignore="true"
        role="group" tabIndex={images.length > 1 ? 0 : undefined} aria-label={`${label} 사진 ${images.length}장${images.length > 1 ? ', 좌우로 넘겨보세요.' : ''}`}
        onKeyDown={event => {
            if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const node = event.currentTarget;
            stopMotion();
            const behavior = reducedMotion ? 'auto' : 'smooth';
            if (event.key === 'Home' || event.key === 'End') node.scrollTo({ left: event.key === 'Home' ? 0 : node.scrollWidth, behavior });
            else node.scrollBy({ left: node.clientWidth * (event.key === 'ArrowRight' ? 0.8 : -0.8), behavior });
        }}
        onWheel={stopMotion}
        onPointerDown={event => {
            stopMotion();
            if (images.length < 2 || event.pointerType !== 'mouse' || event.button !== 0) return;
            gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, time: event.timeStamp,
                left: event.currentTarget.scrollLeft, target: event.currentTarget.scrollLeft, velocity: 0, dragging: false };
        }}
        onPointerMove={event => {
            const drag = gesture.current;
            if (!drag || drag.id !== event.pointerId) return;
            if (!event.buttons) { finish(event, true); return; }
            const x = event.clientX - drag.x;
            if (!drag.dragging && Math.abs(x) > 8 && Math.abs(x) > Math.abs(event.clientY - drag.y)) {
                drag.dragging = true;
                event.currentTarget.style.scrollSnapType = 'none';
                event.currentTarget.classList.add('is-dragging');
                event.currentTarget.setPointerCapture(event.pointerId);
            }
            if (drag.dragging) {
                event.preventDefault();
                const node = event.currentTarget;
                const elapsed = Math.max(1, event.timeStamp - drag.time);
                drag.velocity = elapsed > 80 ? 0 : 0.7 * (drag.lastX - event.clientX) / elapsed + 0.3 * drag.velocity;
                drag.lastX = event.clientX; drag.time = event.timeStamp;
                drag.target = clamp(node, drag.left - x);
                if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; if (gesture.current === drag) node.scrollLeft = drag.target; });
            }
        }}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => finish(event, true)}
        onPointerLeave={() => { if (!gesture.current?.dragging) gesture.current = null; }}
        onClickCapture={event => {
            if (Date.now() < ignoreClickUntil.current || gesture.current?.dragging) { event.preventDefault(); event.stopPropagation(); return; }
            rememberPhotoPreviewOrigin(event);
        }}>
        <Image.PreviewGroup items={images.map(image => image.src)} classNames={photoPreviewClassNames}>
            {images.map((image, index) => <div key={image.id || `${image.src}:${index}`} className="reserve-feed-media-item"
                style={{ '--feed-media-ratio': image.width > 0 && image.height > 0 ? image.width / image.height : 4 / 3 }}>
                <LoadingAntImage src={image.src} alt={`${label} 사진 ${index + 1}`} width="100%" height="100%" draggable={false} loading="lazy" decoding="async"
                    referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', aspectRatio: 'auto', objectFit: 'cover', display: 'block' }}
                    preview={{ mask: false }} />
            </div>)}
        </Image.PreviewGroup>
    </div>;
}
FeedMediaStrip.propTypes = { images: PropTypes.arrayOf(PropTypes.object).isRequired, label: PropTypes.string };
