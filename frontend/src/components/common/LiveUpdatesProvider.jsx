import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/useAuthStore';
import { currentSession, isCurrentSession } from '../../api/sessionScope';
import { versionedApiUrl } from '../../api/apiVersion';
import { createLiveQueryRefresh, LIVE_UPDATE_DOMAINS, nextNewsBoundary, parseLiveUpdate } from '../../hooks/liveUpdateQueries';
import { LiveUpdatesContext } from '../../hooks/useLiveUpdatesStatus';

/** One account-scoped connection per query client. All changes are authorized again by existing read APIs. */
export default function LiveUpdatesProvider({ children }) {
    const client = useQueryClient();
    const revision = useAuthStore(state => state.sessionRevision);
    const signedIn = useAuthStore(state => state.isLoggedIn);
    const [status, setStatus] = useState({ connected: false, domains: [] });
    useEffect(() => {
        const session = currentSession().epoch;
        let stopped = false, stream, reconnect, pending, fallback, boundary;
        let failures = 0, epoch, queued = [], resync;
        let serverOffset = 0;
        const versions = new Map();
        const current = () => !stopped && isCurrentSession(session)
            && useAuthStore.getState().sessionRevision === revision;
        const refreshQueries = createLiveQueryRefresh(client, current);
        const scheduleBoundary = () => {
            clearTimeout(boundary); boundary = undefined;
            if (!current() || document.hidden) return;
            const now = Date.now() + serverOffset;
            const next = nextNewsBoundary(client, now);
            if (next != null) boundary = setTimeout(() => {
                if (current() && !document.hidden) refreshQueries([{ domain: 'NEWS', entityId: 0 }]);
            }, Math.min(86_400_000, Math.max(250, next - now + 150)));
        };
        const flush = () => {
            pending = undefined;
            if (!current() || document.hidden) return;
            const updates = queued; queued = [];
            const mode = resync; resync = undefined;
            if (mode === 'periodic') refreshQueries(updates, true, { periodic: true });
            else refreshQueries(updates, mode === 'full');
        };
        const schedule = mode => {
            // A ready/return or overflow reconciliation must survive a periodic tick in the same batch.
            if (mode && (mode === 'full' || !resync)) resync = mode;
            if (current() && !document.hidden && !pending) pending = setTimeout(flush, 250);
        };
        const poll = () => {
            if (!fallback) fallback = setInterval(() => schedule('periodic'), 60_000);
        };
        const connect = () => {
            if (!current() || document.hidden || !navigator.onLine) return;
            if (typeof EventSource === 'undefined') { poll(); return; }
            const base = new URL(import.meta.env.VITE_API_BASE_URL || '/', window.location.origin);
            const path = signedIn ? '/api/updates/events' : '/api/updates/public/events';
            const connection = new EventSource(new URL(versionedApiUrl(path), base).href, { withCredentials: true });
            stream = connection;
            const active = () => current() && stream === connection;
            connection.addEventListener('ready', message => {
                if (!active()) return;
                let ready;
                try { ready = JSON.parse(message.data); } catch { return; }
                if (typeof ready.epoch !== 'string' || ready.epoch.length > 80 || !Array.isArray(ready.domains)) return;
                if (epoch !== ready.epoch) { epoch = ready.epoch; versions.clear(); }
                const serverTime = Date.parse(ready.serverTime);
                if (Number.isFinite(serverTime)) serverOffset = serverTime - Date.now();
                failures = 0;
                const domains = ready.domains.filter(domain => LIVE_UPDATE_DOMAINS.includes(domain));
                setStatus({ connected: true, domains });
                schedule('full'); scheduleBoundary();
            });
            connection.addEventListener('update', message => {
                if (!active()) return;
                const event = parseLiveUpdate(message.data);
                if (!event || event.epoch !== epoch) return;
                const key = `${event.domain}:${event.targetType || ''}:${event.entityId}`;
                if (event.revision <= (versions.get(key) || 0)) return;
                versions.delete(key); versions.set(key, event.revision);
                if (versions.size > 512) versions.delete(versions.keys().next().value);
                queued.push(event);
                if (queued.length > 128) { queued = []; resync = 'full'; }
                schedule();
            });
            connection.addEventListener('session-ended', () => {
                if (!active()) return;
                connection.close();
                useAuthStore.getState().expireSession();
            });
            connection.onerror = () => {
                if (!active()) return;
                connection.close(); stream = undefined;
                setStatus(previous => previous.connected ? { ...previous, connected: false } : previous);
                // Periodic reconciliation also covers undelivered events and server-only time transitions.
                poll();
                const delay = Math.min(60_000, 5_000 * 2 ** Math.min(failures++, 4));
                reconnect = setTimeout(connect, delay + Math.floor(Math.random() * 1_000));
            };
        };
        const visibility = () => {
            clearTimeout(reconnect); clearTimeout(pending); pending = undefined;
            clearTimeout(boundary); boundary = undefined;
            stream?.close(); stream = undefined;
            setStatus(previous => previous.connected ? { ...previous, connected: false } : previous);
            if (document.hidden) return;
            schedule('full'); scheduleBoundary(); connect();
        };
        const unsubscribe = client.getQueryCache().subscribe(event => {
            if (event.type === 'updated' && ['public-promotions', 'store-news'].includes(event.query.queryKey[0])) scheduleBoundary();
        });
        poll(); connect();
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('online', visibility);
        return () => {
            stopped = true; clearTimeout(reconnect); clearTimeout(pending); clearTimeout(boundary); clearInterval(fallback); stream?.close(); unsubscribe();
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('online', visibility);
        };
    }, [client, revision, signedIn]);
    const value = useMemo(() => ({ present: true, ...status }), [status]);
    return <LiveUpdatesContext.Provider value={value}>{children}</LiveUpdatesContext.Provider>;
}
LiveUpdatesProvider.propTypes = { children: PropTypes.node };
