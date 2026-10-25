import { lazy, Suspense, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import service from '../../services/serviceAdmissionService';
import { currentSession, isCurrentSession } from '../../api/sessionScope';
import { subscribeServiceAdmission } from '../../api/serviceAdmissionGate';
import { serviceEntryStatus } from '../../utils/serviceAdmissionStatus';
import { RouteErrorBoundary } from '../layout/AppErrorBoundary';

const Controller = lazy(() => import('./ServiceAdmissionController'));

/* 입장 기능이 지연 로드되는 동안 페이지 트리를 유지한다. */
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
        }).catch(() => { /* 초기 로드 오류는 화면을 막지 않으며 보호 관문에서 다시 로드한다. */ });
        return () => { stopped = true; controller.abort(); unsubscribe(); };
    }, []);
    return <>{children}{active && <RouteErrorBoundary><Suspense fallback={null}><Controller /></Suspense></RouteErrorBoundary>}</>;
}
ServiceAdmissionProvider.propTypes = { children: PropTypes.node };
