import PropTypes from 'prop-types';
import { WaitingPageSkeleton } from './WaitingPageSkeleton';
import { WAITING_STORE_STATUSES, WAITING_STORE_SORTS } from './waitingDirectoryFilters';
import { resolveViewMode } from '../../utils/viewMode';

const selected = (options, value, fallback) => (options.some((option) => option.value === value) ? value : fallback);
export default function WaitingRouteSkeleton({ pathname = '/waiting', search = '' }) {
    const params = new URLSearchParams(search);
    return (
        <WaitingPageSkeleton
            view={resolveViewMode(pathname, params, 'cards')}
            status={selected(WAITING_STORE_STATUSES, params.get('status'), 'ALL')}
            sort={selected(WAITING_STORE_SORTS, params.get('sort'), 'recommended')}
        />
    );
}
WaitingRouteSkeleton.propTypes = { pathname: PropTypes.string, search: PropTypes.string };
