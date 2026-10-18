import { useRef } from 'react';
import PropTypes from 'prop-types';
import { useMarkSkeletonShown } from '../layout/loadingPresentation';

/** Keep the real text's width, wrapping and line height while showing its skeleton. */
export default function SkeletonText({ children, loading = true, pageLoading = true, className, style }) {
    const elementRef = useRef(null);
    useMarkSkeletonShown(elementRef, loading && pageLoading);
    if (!loading) return children;
    return <span ref={elementRef} aria-hidden="true"
        className={['reserve-skeleton-block', 'reserve-skeleton-text', pageLoading ? '' : 'reserve-skeleton-block--local', className].filter(Boolean).join(' ')}
        style={style}>{children}</span>;
}
SkeletonText.propTypes = {
    children: PropTypes.node,
    loading: PropTypes.bool,
    pageLoading: PropTypes.bool,
    className: PropTypes.string,
    style: PropTypes.object,
};
