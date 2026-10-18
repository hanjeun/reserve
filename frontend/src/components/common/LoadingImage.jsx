import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';

/** The native image keeps its layout and request priority; only its loading background changes. */
export default function LoadingImage({ src, srcSet, className, onLoad, onError, ref, ...props }) {
    const sourceKey = `${src ?? ''}\u0000${srcSet ?? ''}`;
    const [settledSource, setSettledSource] = useState(null);
    const loading = Boolean(src) && settledSource !== sourceKey;
    const imageRef = useCallback(image => {
        const cleanup = typeof ref === 'function' ? ref(image) : undefined;
        if (ref && typeof ref !== 'function') ref.current = image;
        // Cached successes and failures may finish before React attaches load/error handlers.
        if (image?.complete) setSettledSource(sourceKey);
        return typeof cleanup === 'function' ? cleanup : undefined;
    }, [ref, sourceKey]);
    return <img {...props} src={src} srcSet={srcSet} ref={imageRef}
        className={[className, loading && 'reserve-skeleton-block reserve-skeleton-block--local reserve-loading-image'].filter(Boolean).join(' ')}
        aria-busy={loading || undefined}
        onLoad={event => { setSettledSource(sourceKey); onLoad?.(event); }}
        onError={event => {
            const failedSource = event.currentTarget.getAttribute('src');
            onError?.(event);
            // Existing callers may replace the failed source with a fallback on this same node.
            // If that fallback also fails without another replacement, end its skeleton as well.
            if (event.currentTarget.getAttribute('src') === failedSource) setSettledSource(sourceKey);
            else setSettledSource(null);
        }} />;
}
LoadingImage.propTypes = {
    src: PropTypes.string,
    srcSet: PropTypes.string,
    className: PropTypes.string,
    onLoad: PropTypes.func,
    onError: PropTypes.func,
    ref: PropTypes.oneOfType([PropTypes.func, PropTypes.shape({ current: PropTypes.any })]),
};
