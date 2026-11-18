import { lazy, Suspense, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import useAuthStore from '../../store/useAuthStore';
import { LiveUpdatesContext } from '../../hooks/useLiveUpdatesStatus';

const LiveUpdatesConnection = lazy(() => import('./LiveUpdatesConnection'));
const DISCONNECTED = { connected: false, domains: [] };

export default function LiveUpdatesProvider({ children, enabled = true }) {
    const restoring = useAuthStore(state => state.authRestoring);
    const [status, setStatus] = useState(DISCONNECTED);
    const connecting = enabled && !restoring;
    const value = useMemo(() => ({ present: true, ...(connecting ? status : DISCONNECTED) }), [connecting, status]);
    return <LiveUpdatesContext.Provider value={value}>
        {children}
        {connecting && <Suspense fallback={null}><LiveUpdatesConnection setStatus={setStatus} /></Suspense>}
    </LiveUpdatesContext.Provider>;
}

LiveUpdatesProvider.propTypes = { children: PropTypes.node, enabled: PropTypes.bool };
