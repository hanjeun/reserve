import { useRef } from 'react';
import PropTypes from 'prop-types';
import { useMarkSkeletonShown } from '../layout/loadingPresentation';

/* 실제 텍스트의 너비·줄바꿈·행 높이를 골격에서도 유지한다. */
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
