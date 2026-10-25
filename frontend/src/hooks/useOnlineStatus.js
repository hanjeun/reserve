import { useSyncExternalStore } from 'react';

/*
 * 브라우저의 네트워크 연결 상태를 구독한다. navigator.onLine은 서버 도달 여부까지 보장하지 않는다.
 */
const subscribe = (callback) => {
    globalThis.addEventListener('online', callback);
    globalThis.addEventListener('offline', callback);
    return () => {
        globalThis.removeEventListener('online', callback);
        globalThis.removeEventListener('offline', callback);
    };
};

const getSnapshot = () => globalThis.navigator?.onLine ?? true;

// SSR/비브라우저 환경에서는 항상 온라인으로 간주(현재는 CSR이라 실질적으로 쓰이진 않음)
const getServerSnapshot = () => true;

const useOnlineStatus = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export default useOnlineStatus;
