import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useAuthStore from '../store/useAuthStore';
import { API_ENDPOINTS } from '../constants/api';
import { versionedApiUrl } from '../api/apiVersion';
import useLiveUpdatesStatus from './useLiveUpdatesStatus';

/** 인증된 화면에만 연결한다. SSE는 개인정보 없는 무효화 신호이고 실제 값은 기존 API로 조회한다. */
export default function useWaitingEvents(enabled = true) {
    const revision = useAuthStore(state => state.sessionRevision);
    const loggedIn = useAuthStore(state => state.isLoggedIn);
    const client = useQueryClient();
    const live = useLiveUpdatesStatus();
    useEffect(() => {
        if (!enabled || live.present || !loggedIn || typeof EventSource === 'undefined') return undefined;
        let stopped = false;
        let stream;
        let timer;
        let failures = 0;
        const current = () => !stopped && useAuthStore.getState().sessionRevision === revision
            && useAuthStore.getState().isLoggedIn;
        const refresh = () => {
            if (!current()) return;
            void client.invalidateQueries({ queryKey: ['waiting', revision] });
            void client.invalidateQueries({ queryKey: ['waiting-stores'] });
        };
        const connect = () => {
            if (!current() || document.hidden) return;
            const base = new URL(import.meta.env.VITE_API_BASE_URL || '/', window.location.origin);
            const connection = new EventSource(new URL(versionedApiUrl(API_ENDPOINTS.WAITING.EVENTS), base).href, { withCredentials: true });
            stream = connection;
            const active = () => current() && stream === connection;
            connection.addEventListener('ready', () => { if (active()) { failures = 0; refresh(); } });
            connection.addEventListener('waiting-changed', () => { if (active()) refresh(); });
            connection.addEventListener('session-ended', () => {
                if (!active()) return;
                stopped = true;
                clearTimeout(timer);
                connection.close();
                stream = undefined;
                useAuthStore.getState().expireSession();
            });
            connection.onerror = () => {
                if (!active()) return;
                connection.close();
                stream = undefined;
                refresh(); // 401 재발급도 기존 axios 경로에서 처리한다.
                if (current() && !document.hidden) {
                    timer = setTimeout(connect, Math.min(30_000, 5_000 * 2 ** Math.min(failures++, 3)));
                }
            };
        };
        const visibility = () => {
            clearTimeout(timer);
            stream?.close();
            stream = undefined;
            if (!document.hidden) connect();
        };
        connect();
        document.addEventListener('visibilitychange', visibility);
        return () => { stopped = true; clearTimeout(timer); stream?.close(); document.removeEventListener('visibilitychange', visibility); };
    }, [client, enabled, loggedIn, revision, live.present]);
}
