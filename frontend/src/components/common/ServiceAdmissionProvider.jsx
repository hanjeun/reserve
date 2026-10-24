import { lazy, Suspense, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import service from '../../services/serviceAdmissionService';
import { currentSession, isCurrentSession } from '../../api/sessionScope';
import { subscribeServiceAdmission } from '../../api/serviceAdmissionGate';
import { serviceEntryStatus } from '../../utils/serviceAdmissionStatus';
import { RouteErrorBoundary } from '../layout/AppErrorBoundary';

const Controller = lazy(() => import('./ServiceAdmissionController'));

/** Keep the page tree stable while the optional entry runtime loads independently. */
export default function ServiceAdmissionProvider({ children }) {
    const [active, setActive] = useState(false);
    useEffect(() => {
        const session = currentSession();
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, session.signal]);
        let stopped = false;
        const current = () => !stopped && !signal.aborted && isCurrentSession(session.epoch);
        const activate = () => { if (current()) setActive(true); };
        const unsubscribe = subscribeServiceAdmission(session.epoch, activate);
        service.status(signal).then(value => {
            if (current() && serviceEntryStatus(value).mode !== 'OFF') activate();
        }).catch(() => { /* Bootstrap failure stays quiet; a protected gate still loads the runtime. */ });
        return () => { stopped = true; controller.abort(); unsubscribe(); };
    }, []);
    return <>{children}{active && <RouteErrorBoundary><Suspense fallback={null}><Controller /></Suspense></RouteErrorBoundary>}</>;
}
ServiceAdmissionProvider.propTypes = { children: PropTypes.node };
