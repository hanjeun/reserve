import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';

/* 이미지의 배치·요청 우선순위를 유지하며 로딩 배경만 제어한다. */
export default function LoadingImage({ src, srcSet, className, onLoad, onError, ref, ...props }) {
    const sourceKey = `${src ?? ''}\u0000${srcSet ?? ''}`;
    const [settledSource, setSettledSource] = useState(null);
    const loading = Boolean(src) && settledSource !== sourceKey;
    const imageRef = useCallback(image => {
        const cleanup = typeof ref === 'function' ? ref(image) : undefined;
        if (ref && typeof ref !== 'function') ref.current = image;
        // 캐시된 성공·실패는 React 이벤트 연결 전에 끝날 수 있다.
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
            // 같은 이미지 노드에서 대체 출처를 다시 시도할 수 있다.
            // 대체 출처도 실패하면 골격 표시를 끝낸다.
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
