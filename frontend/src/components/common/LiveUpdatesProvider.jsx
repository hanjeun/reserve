import { lazy, Suspense, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import useAuthStore from '../../store/useAuthStore';
import { LiveUpdatesContext } from '../../hooks/useLiveUpdatesStatus';

const LiveUpdatesConnection = lazy(() => import('./LiveUpdatesConnection'));

export default function LiveUpdatesProvider({ children }) {
    const restoring = useAuthStore(state => state.authRestoring);
    const [status, setStatus] = useState({ connected: false, domains: [] });
    const value = useMemo(() => ({ present: true, ...status }), [status]);
    return <LiveUpdatesContext.Provider value={value}>
        {children}
        {!restoring && <Suspense fallback={null}><LiveUpdatesConnection setStatus={setStatus} /></Suspense>}
    </LiveUpdatesContext.Provider>;
}

LiveUpdatesProvider.propTypes = { children: PropTypes.node };
