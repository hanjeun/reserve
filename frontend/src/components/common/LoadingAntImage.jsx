import PropTypes from 'prop-types';
import { Image } from 'antd';
import Bone from './Bone';
import { imageDimensions } from '../../utils/imageDimensions';
import useLazyAntImageSource from '../../hooks/useLazyAntImageSource';
import { PHOTO_PREVIEW_LABEL, withPhotoPreviewHint } from '../../utils/photoPreview';

/* AntD 미리보기·출처 교체·캐시 이미지 처리를 같은 관문에 둔다. */
export default function LoadingAntImage({ placeholder, style, imageSize, src, srcSet, loading, fallback, preview, rootClassName, ...props }) {
    const size = imageDimensions(imageSize);
    const { ready, rootClassName: lazyClass } = useLazyAntImageSource(`${src ?? ''}\u0000${srcSet ?? ''}`, loading === 'lazy');
    const bone = <Bone width="100%" height="100%" borderRadius="inherit" pageLoading={false} />;
    return <Image {...props} src={ready ? src : undefined} srcSet={ready ? srcSet : undefined} loading={loading}
        fallback={ready ? fallback : ''} preview={ready ? withPhotoPreviewHint(preview) : false}
        aria-label={props['aria-label'] ?? (ready && preview !== false ? `${props.alt || '사진'} ${PHOTO_PREVIEW_LABEL}` : undefined)}
        rootClassName={[rootClassName, lazyClass, preview !== false && 'reserve-photo-preview-trigger'].filter(Boolean).join(' ') || undefined}
        style={{ aspectRatio: size ? `auto ${size.width} / ${size.height}` : 'auto 1 / 1', ...style }}
        placeholder={ready ? placeholder ?? bone : placeholder || bone} />;
}
LoadingAntImage.propTypes = { placeholder: PropTypes.node, style: PropTypes.object,
    src: PropTypes.string, srcSet: PropTypes.string, loading: PropTypes.oneOf(['eager', 'lazy']),
    fallback: PropTypes.string, preview: PropTypes.oneOfType([PropTypes.bool, PropTypes.object]), rootClassName: PropTypes.string,
    imageSize: PropTypes.shape({ width: PropTypes.number, height: PropTypes.number }) };
