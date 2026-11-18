import { useId, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import FeedMediaStrip from '../feed/FeedMediaStrip';
import LoadingImage from '../common/LoadingImage';
import UnderlinedTextButton from '../common/UnderlinedTextButton';
import useExitAnimation from '../../hooks/useExitAnimation';
import useImagePreview from '../../hooks/useImagePreview';
import useReducedMotion from '../../hooks/useReducedMotion';
import { rememberPhotoPreviewOrigin } from '../../utils/photoPreview';

export default function ReviewPhotos({ photos, label = '리뷰' }) {
    if (!photos?.length) return null;
    return <FeedMediaStrip images={photos.map(photo => ({ ...photo, src: photo.url }))} label={label} />;
}

const photoList = PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, url: PropTypes.string, width: PropTypes.number, height: PropTypes.number }));
ReviewPhotos.propTypes = { photos: photoList, label: PropTypes.string };

const previewFile = photo => ({ uid: String(photo.id), url: photo.url });

export function ReviewPhotoOverview({ photos, isPC }) {
    const [open, setOpen] = useState(false);
    const [columns, setColumns] = useState(3);
    const grid = useRef(null);
    const extraId = useId();
    const { handlePreview, previewNode } = useImagePreview();
    useLayoutEffect(() => {
        const node = grid.current;
        if (!isPC || !node) return undefined;
        const measure = () => {
            const style = node.ownerDocument.defaultView.getComputedStyle(node);
            const minimum = parseFloat(style.getPropertyValue('--review-photo-min-width'));
            const gap = parseFloat(style.columnGap) || 0;
            const width = node.getBoundingClientRect().width;
            if (width > 0 && minimum > 0) setColumns(Math.max(1, Math.floor((width + gap) / (minimum + gap))));
        };
        measure();
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
        observer?.observe(node);
        return () => observer?.disconnect();
    }, [isPC, photos.length]);
    const limit = isPC ? columns : 2;
    const hasMore = photos.length > limit;
    const expanded = open && hasMore;
    const reduced = useReducedMotion();
    const { shouldRender } = useExitAnimation(expanded, reduced ? 0 : 200, !reduced);
    const firstPhotos = photos.slice(0, limit);
    const visiblePhotos = expanded || !reduced && shouldRender ? photos : firstPhotos;
    if (!photos.length) return null;
    return <section className={'reserve-review-photo-overview' + (isPC ? ' is-desktop' : '')} aria-label="리뷰 사진 모아보기">
        <header>
            <h4>리뷰 사진</h4>
            {hasMore && <UnderlinedTextButton aria-expanded={expanded} aria-controls={extraId} onClick={() => setOpen(value => !value)}>
                {expanded ? '사진 접기' : '사진 더 보기'}
            </UnderlinedTextButton>}
        </header>
        <div ref={grid} className="reserve-review-photo-grid" id={extraId}
            style={isPC ? { '--review-photo-columns': Math.min(columns, photos.length) } : undefined}>
            {visiblePhotos.map((photo, index) => {
                const extra = index >= limit;
                const closing = extra && !expanded;
                return <button key={photo.id} type="button" className="reserve-review-photo-tile"
                    data-extra={extra || undefined} inert={closing || undefined} aria-hidden={closing || undefined}
                    style={{ aspectRatio: photo.width > 0 && photo.height > 0 ? photo.width + ' / ' + photo.height : '4 / 3' }}
                    aria-label={'리뷰 사진 ' + (index + 1) + ' 크게 보기'} onClick={event => {
                        rememberPhotoPreviewOrigin(event);
                        handlePreview(previewFile(photo), (expanded ? photos : firstPhotos).map(previewFile));
                    }}>
                    <LoadingImage src={photo.url} alt="" loading="lazy" decoding="async" draggable={false} />
                </button>;
            })}
        </div>
        {previewNode}
    </section>;
}
ReviewPhotoOverview.propTypes = { photos: photoList.isRequired, isPC: PropTypes.bool };
