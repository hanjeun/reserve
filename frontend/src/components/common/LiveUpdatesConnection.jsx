import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../../store/useAuthStore';
import { currentSession, isCurrentSession } from '../../api/sessionScope';
import { versionedApiUrl } from '../../api/apiVersion';
import { createLiveQueryRefresh, isLiveReadQuery, LIVE_UPDATE_DOMAINS, nextLiveRefreshDelay, nextNewsBoundary, parseLiveUpdate } from '../../hooks/liveUpdateQueries';

/* 쿼리 클라이언트의 계정별 연결 하나를 공유하고 데이터 권한은 조회 API에서 재검증한다. */
export default function LiveUpdatesConnection({ setStatus }) {
    const client = useQueryClient();
    const revision = useAuthStore(state => state.sessionRevision);
    const signedIn = useAuthStore(state => state.isLoggedIn);
    useEffect(() => {
        const session = currentSession().epoch;
        let stopped = false, stream, reconnect, pending, fallback, boundary;
        let failures = 0, retryAt = 0, epoch, lastRevision, queued = [], resync, recovering = false;
        let serverOffset = 0;
        let transport = { connected: false, domains: [] };
        const versions = new Map();
        const current = () => !stopped && isCurrentSession(session)
            && useAuthStore.getState().sessionRevision === revision && !useAuthStore.getState().authRestoring;
        const refreshQueries = createLiveQueryRefresh(client, current, () => transport);
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
            if (!current() || document.hidden || recovering || !navigator.onLine) { poll(); return; }
            const updates = queued; queued = [];
            const mode = resync; resync = undefined;
            if (mode === 'periodic') refreshQueries(updates, true, { periodic: true });
            else refreshQueries(updates, mode === 'full');
            poll();
        };
        const schedule = mode => {
            // 같은 배치의 주기 갱신이 복귀·누락 이벤트 조정을 덮지 않게 한다.
            if (mode && (mode === 'full' || !resync)) resync = mode;
            if (current() && !document.hidden && !pending) pending = setTimeout(flush, 250);
        };
        const poll = () => {
            clearTimeout(fallback); fallback = undefined;
            if (!current() || document.hidden || !navigator.onLine) return;
            const delay = nextLiveRefreshDelay(client, transport);
            if (delay != null) fallback = setTimeout(() => { fallback = undefined; schedule('periodic'); }, delay);
        };
        const available = () => current() && !document.hidden && navigator.onLine;
        const resume = (refreshOnReturn = false) => {
            clearTimeout(reconnect);
            const remaining = retryAt - Date.now();
            if (remaining > 0) {
                reconnect = setTimeout(() => void recover(refreshOnReturn), remaining);
            } else {
                void recover(refreshOnReturn);
            }
        };
        const retry = () => {
            const delay = Math.min(60_000, 5_000 * 2 ** Math.min(failures++, 4));
            retryAt = Date.now() + delay + Math.floor(Math.random() * 1_000);
            resume();
        };
        const recover = async (refreshOnReturn = false) => {
            reconnect = undefined;
            if (!available() || stream || recovering) return;
            recovering = true;
            try {
                // EventSource는 401 상태를 알려주지 않으므로 기존 인증 관문에서 갱신·만료를 확인해요.
                if (signedIn && !await useAuthStore.getState().checkAuth(true, { rethrowTransient: true, timeout: 8000 })) return;
                if (available() && !stream) {
                    if (refreshOnReturn) { schedule('periodic'); scheduleBoundary(); }
                    connect();
                }
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
                const readyRevision = Number.isSafeInteger(ready.revision) && ready.revision >= 0 ? ready.revision : undefined;
                const reconnecting = epoch !== undefined || failures > 0;
                const continuous = ready.revisionTracksGaps === true && readyRevision !== undefined
                    && epoch === ready.epoch && readyRevision === lastRevision;
                if (epoch !== ready.epoch) { epoch = ready.epoch; versions.clear(); }
                lastRevision = readyRevision;
                const serverTime = Date.parse(ready.serverTime);
                if (Number.isFinite(serverTime)) serverOffset = serverTime - Date.now();
                failures = 0;
                retryAt = 0;
                const domains = ready.domains.filter(domain => LIVE_UPDATE_DOMAINS.includes(domain));
                transport = { connected: true, domains };
                setStatus({ connected: true, domains });
                poll();
                if (reconnecting && !continuous) schedule('full');
                else if (queued.length || resync) schedule();
                scheduleBoundary();
            });
            connection.addEventListener('update', message => {
                if (!active()) return;
                const event = parseLiveUpdate(message.data);
                if (!event || event.epoch !== epoch) return;
                lastRevision = Math.max(lastRevision ?? 0, event.revision);
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
                if (!signedIn) { useAuthStore.getState().expireSession(); return; }
                stream = undefined;
                transport = { ...transport, connected: false };
                setStatus(previous => previous.connected ? { ...previous, connected: false } : previous);
                void recover(true);
            });
            connection.onerror = () => {
                if (!active()) return;
                connection.close(); stream = undefined;
                transport = { ...transport, connected: false };
                setStatus(previous => previous.connected ? { ...previous, connected: false } : previous);
                // 누락 이벤트와 서버 시각에 따른 전환을 주기 조회로 보완한다.
                poll();
                retry();
            };
        };
        const visibility = () => {
            clearTimeout(reconnect); clearTimeout(pending); pending = undefined;
            clearTimeout(boundary); boundary = undefined;
            clearTimeout(fallback); fallback = undefined;
            stream?.close(); stream = undefined;
            transport = { ...transport, connected: false };
            setStatus(previous => previous.connected ? { ...previous, connected: false } : previous);
            if (document.hidden) return;
            poll();
            if (recovering) return;
            if (signedIn || failures) resume(true);
            else { schedule('periodic'); scheduleBoundary(); connect(); }
        };
        const unsubscribe = client.getQueryCache().subscribe(event => {
            if (event.type === 'updated' && ['public-promotions', 'store-news'].includes(event.query.queryKey[0])) scheduleBoundary();
            if (isLiveReadQuery(event.query)) poll();
        });
        poll(); connect();
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('online', visibility);
        return () => {
            stopped = true; clearTimeout(reconnect); clearTimeout(pending); clearTimeout(boundary); clearTimeout(fallback); stream?.close(); unsubscribe();
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('online', visibility);
            setStatus(previous => previous.connected || previous.domains.length ? { connected: false, domains: [] } : previous);
        };
    }, [client, revision, signedIn, setStatus]);
    return null;
}

LiveUpdatesConnection.propTypes = { setStatus: PropTypes.func.isRequired };
