import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { animation } from '../../styles/tokens';
import useTouchTapGuard from '../../hooks/useTouchTapGuard';
import { PHOTO_SORT_HOLD_MS } from '../../utils/photoPreview';
import LoadingImage from './LoadingImage';
import { DeleteOutlined, EyeOutlined } from './icons';

const TOOL_TARGET = 44;
const PREFERRED_HEIGHT = 64;
const MAX_WIDTH = 156;
const MAX_HEIGHT = 132;
const MIN_WIDTH = TOOL_TARGET * 2;

export default function PhotoUploadThumbnail({ src, file, alt, crossOrigin, className, active = true, animate = false,
    onPreview, onPreviewKeyDown, onRemove, removeDisabled, previewLabel = `${alt} 미리보기`, removeLabel = `${alt} 삭제` }) {
    const tap = useTouchTapGuard(PHOTO_SORT_HOLD_MS);
    const [local, setLocal] = useState(null);
    const [loadedPhoto, setLoadedPhoto] = useState(null);
    useEffect(() => {
        if (src || !file) return undefined;
        const url = URL.createObjectURL(file);
        let mounted = true;
        queueMicrotask(() => { if (mounted) setLocal({ file, url }); });
        return () => { mounted = false; URL.revokeObjectURL(url); };
    }, [src, file]);
    const url = src || (local?.file === file ? local?.url : undefined);
    const measure = useCallback(image => {
        const { naturalWidth, naturalHeight } = image;
        const ratio = naturalHeight > 0 ? naturalWidth / naturalHeight : 0;
        setLoadedPhoto(previous => previous?.url === url && previous?.ratio === ratio ? previous : { url, ratio });
    }, [url]);
    const imageRef = useCallback(image => {
        if (image?.complete && image.naturalWidth > 0) measure(image);
    }, [measure]);

    const canPreview = Boolean(url && onPreview);
    const hasTools = canPreview || Boolean(onRemove);
    const settled = Boolean(url) && loadedPhoto?.url === url;
    const ratio = settled ? loadedPhoto.ratio : 0;
    // 사진 위에 44px 조작 영역 두 개를 놓을 수 있도록 썸네일 비율을 정한다.
    const aspectRatio = ratio >= MIN_WIDTH / MAX_HEIGHT && ratio <= MAX_WIDTH / TOOL_TARGET ? ratio : 1;
    const inlineSize = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, PREFERRED_HEIGHT * aspectRatio));
    let motion;
    if (animate) {
        if (!active) motion = animation.slideUpOut;
        else if (settled) motion = animation.slideUpIn;
    }

    return <div className={['reserve-photo-upload-thumbnail', className].filter(Boolean).join(' ')}
        inert={!active || undefined} style={{ inlineSize, aspectRatio, animation: motion }}>
        {url && <div className="reserve-photo-upload-media"><LoadingImage ref={imageRef} src={url}
            alt={active ? alt : ''} crossOrigin={crossOrigin} draggable={false} className="reserve-photo-upload-image"
            onLoad={event => measure(event.currentTarget)} onError={() => setLoadedPhoto({ url, ratio: 0 })} /></div>}
        {hasTools && <div {...tap} className="reserve-photo-actions" aria-hidden={!active || undefined}>
            {canPreview && <button type="button" aria-label={previewLabel} disabled={!active}
                onClick={() => onPreview(url)} onKeyDown={onPreviewKeyDown}><EyeOutlined aria-hidden="true" /></button>}
            {onRemove && <button type="button" aria-label={removeLabel} disabled={removeDisabled || !active}
                onClick={onRemove}><DeleteOutlined aria-hidden="true" /></button>}
        </div>}
    </div>;
}

PhotoUploadThumbnail.propTypes = {
    src: PropTypes.string, file: PropTypes.object, alt: PropTypes.string.isRequired, crossOrigin: PropTypes.string,
    className: PropTypes.string, active: PropTypes.bool, animate: PropTypes.bool, onPreview: PropTypes.func,
    onPreviewKeyDown: PropTypes.func, onRemove: PropTypes.func, removeDisabled: PropTypes.bool,
    previewLabel: PropTypes.string, removeLabel: PropTypes.string,
};
