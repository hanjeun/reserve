import LoadingStatus from '../common/LoadingStatus';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { getRouteSkeletonKind, resolveRouteSkeletonLocation } from './routeSkeletonKind';
import { usePageSkeletonModule } from './routeSkeletonLoader';
import { useMarkSkeletonShown } from './loadingPresentation';

export function RouteSkeletonPreview({ pathname, search = '' }) {
    const module = usePageSkeletonModule();
    const location = resolveRouteSkeletonLocation(pathname, search);
    const normalizedPath = location.pathname;
    const kind = getRouteSkeletonKind(normalizedPath);
    const Skeleton = module?.default;
    useMarkSkeletonShown(undefined, Boolean(Skeleton));
    return (
        <LoadingStatus as="section" className={`reserve-route-skeleton reserve-route-skeleton--${kind}`} aria-label="화면을 불러오는 중" aria-busy="true">
            <div aria-hidden="true" inert>
                {Skeleton
                    ? <Skeleton kind={kind} pathname={normalizedPath} search={location.search} />
                    : <div style={{ minHeight: 'calc(100svh - 64px)' }} />}
            </div>
        </LoadingStatus>
    );
}
RouteSkeletonPreview.propTypes = { pathname: PropTypes.string.isRequired, search: PropTypes.string };

export default function RouteLoadingSkeleton() {
    const { pathname, search } = useLocation();
    return <RouteSkeletonPreview pathname={pathname} search={search} />;
}
