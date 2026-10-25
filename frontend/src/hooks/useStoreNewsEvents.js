import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../store/useAuthStore';
import { versionedApiUrl } from '../api/apiVersion';
import { invalidateStoreNews } from './storeNewsQueries';
import useLiveUpdatesStatus from './useLiveUpdatesStatus';

/* 이벤트는 식별자만 전달하고 권한 있는 쿼리를 무효화한다. */
export default function useStoreNewsEvents(enabled, managed = false) {
    const client = useQueryClient();
    const live = useLiveUpdatesStatus();
    const revision = useAuthStore(state => state.sessionRevision);
    useEffect(() => {
        if (!enabled || live.present) return undefined;
        let stopped = false, stream, reconnect, pending, fallback;
        let failures = 0;
        const current = () => !stopped && useAuthStore.getState().sessionRevision === revision;
        const refresh = () => {
            if (!current() || document.hidden || pending) return;
            pending = setTimeout(() => { pending = undefined; if (current()) void invalidateStoreNews(client, { metadata: false }); }, 250);
        };
        const poll = () => { if (current() && !document.hidden && !fallback) fallback = setInterval(refresh, 60_000); };
        const connect = () => {
            if (!current() || document.hidden) return;
            if (typeof EventSource === 'undefined') { poll(); return; }
            const path = managed ? '/api/store-news/events' : '/api/promotions/public/events';
            const base = new URL(import.meta.env.VITE_API_BASE_URL || '/', window.location.origin);
            const connection = new EventSource(new URL(versionedApiUrl(path), base).href, { withCredentials: true });
            stream = connection;
            connection.addEventListener('ready', () => {
                if (!current() || stream !== connection) return;
                failures = 0; clearInterval(fallback); fallback = undefined; refresh();
            });
            connection.addEventListener('news-changed', () => { if (stream === connection) refresh(); });
            connection.onerror = () => {
                if (!current() || stream !== connection) return;
                connection.close(); stream = undefined; poll();
                if (current() && !document.hidden) reconnect = setTimeout(connect, Math.min(30_000, 5_000 * 2 ** Math.min(failures++, 3)));
            };
        };
        const visibility = () => {
            clearTimeout(reconnect); clearTimeout(pending); pending = undefined;
            clearInterval(fallback); fallback = undefined; stream?.close(); stream = undefined;
            if (!document.hidden) connect();
        };
        connect(); document.addEventListener('visibilitychange', visibility);
        return () => {
            stopped = true; clearTimeout(reconnect); clearTimeout(pending); clearInterval(fallback); stream?.close();
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [client, enabled, managed, revision, live.present]);
}
