import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/useAuthStore';
import { currentSession, isCurrentSession } from '../../api/sessionScope';
import { versionedApiUrl } from '../../api/apiVersion';
import { createLiveQueryRefresh, LIVE_UPDATE_DOMAINS, nextNewsBoundary, parseLiveUpdate } from '../../hooks/liveUpdateQueries';
import { LiveUpdatesContext } from '../../hooks/useLiveUpdatesStatus';

/* 쿼리 클라이언트의 계정별 연결 하나를 공유하고 데이터 권한은 조회 API에서 재검증한다. */
export default function LiveUpdatesProvider({ children }) {
    const client = useQueryClient();
    const revision = useAuthStore(state => state.sessionRevision);
    const signedIn = useAuthStore(state => state.isLoggedIn);
    const restoring = useAuthStore(state => state.authRestoring);
    const [status, setStatus] = useState({ connected: false, domains: [] });
    useEffect(() => {
        if (restoring) return undefined;
        const session = currentSession().epoch;
        let stopped = false, stream, reconnect, pending, fallback, boundary;
        let failures = 0, epoch, queued = [], resync, recovering = false;
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
            // 같은 배치의 주기 갱신이 복귀·누락 이벤트 조정을 덮지 않게 한다.
            if (mode && (mode === 'full' || !resync)) resync = mode;
            if (current() && !document.hidden && !pending) pending = setTimeout(flush, 250);
        };
        const poll = () => {
            if (!fallback) fallback = setInterval(() => schedule('periodic'), 60_000);
        };
        const available = () => current() && !document.hidden && navigator.onLine;
        const retry = () => {
            clearTimeout(reconnect);
            const delay = Math.min(60_000, 5_000 * 2 ** Math.min(failures++, 4));
            reconnect = setTimeout(recover, delay + Math.floor(Math.random() * 1_000));
        };
        const recover = async () => {
            reconnect = undefined;
            if (!available() || stream || recovering) return;
            recovering = true;
            try {
                // EventSource는 401 상태를 알려주지 않으므로 기존 인증 관문에서 갱신·만료를 확인해요.
                if (signedIn && !await useAuthStore.getState().checkAuth(true, { rethrowTransient: true, timeout: 8000 })) return;
                if (available() && !stream) connect();
            } catch {
                if (available()) retry();
            } finally { recovering = false; }
        };
        const connect = () => {
            if (!available() || stream) return;
            if (typeof EventSource === 'undefined') { poll(); return; }
            let connection;
            try {
                const base = new URL(import.meta.env.VITE_API_BASE_URL || '/', window.location.origin);
                const path = signedIn ? '/api/updates/events' : '/api/updates/public/events';
                connection = new EventSource(new URL(versionedApiUrl(path), base).href, { withCredentials: signedIn });
            } catch { poll(); retry(); return; }
            stream = connection;
            const active = () => current() && stream === connection;
            connection.addEventListener('ready', message => {
                if (!active()) return;
                let ready;
                try { ready = JSON.parse(message.data); } catch { return; }
                if (!ready || typeof ready.epoch !== 'string' || !ready.epoch || ready.epoch.length > 80 || !Array.isArray(ready.domains)) return;
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
                // 누락 이벤트와 서버 시각에 따른 전환을 주기 조회로 보완한다.
                poll();
                retry();
            };
        };
        const visibility = () => {
            clearTimeout(reconnect); clearTimeout(pending); pending = undefined;
            clearTimeout(boundary); boundary = undefined;
            stream?.close(); stream = undefined;
            setStatus(previous => previous.connected ? { ...previous, connected: false } : previous);
            if (document.hidden) return;
            schedule('full'); scheduleBoundary();
            if (recovering) return;
            if (failures) void recover();
            else connect();
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
    }, [client, revision, signedIn, restoring]);
    const value = useMemo(() => ({ present: true, ...status }), [status]);
    return <LiveUpdatesContext.Provider value={value}>{children}</LiveUpdatesContext.Provider>;
}
LiveUpdatesProvider.propTypes = { children: PropTypes.node };
