import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { getRouteSkeletonKind, normalizeRouteSkeletonPath } from './routeSkeletonKind';
import { usePageSkeletonModule } from './routeSkeletonLoader';

export function RouteSkeletonPreview({ pathname, search = '' }) {
    const module = usePageSkeletonModule();
    const normalizedPath = normalizeRouteSkeletonPath(pathname);
    const kind = getRouteSkeletonKind(normalizedPath);
    const Skeleton = module?.default;
    return (
        <section className={`reserve-route-skeleton reserve-route-skeleton--${kind}`} role="status" aria-label="화면을 불러오는 중" aria-busy="true">
            <div aria-hidden="true" inert>
                {Skeleton
                    ? <Skeleton kind={kind} pathname={normalizedPath} search={search} />
                    : <div style={{ minHeight: 'calc(100svh - 64px)' }} />}
            </div>
        </section>
    );
}
RouteSkeletonPreview.propTypes = { pathname: PropTypes.string.isRequired, search: PropTypes.string };

export default function RouteLoadingSkeleton() {
    const { pathname, search } = useLocation();
    return <RouteSkeletonPreview pathname={pathname} search={search} />;
}
