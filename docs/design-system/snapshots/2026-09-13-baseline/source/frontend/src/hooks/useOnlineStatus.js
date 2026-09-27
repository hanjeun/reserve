import { useSyncExternalStore } from 'react';

/**
 * 브라우저의 온라인/오프라인 상태를 구독하는 훅.
 *
 * navigator.onLine 값과 online/offline 이벤트를 useSyncExternalStore로 구독한다.
 * (useState + useEffect 대신 useSyncExternalStore를 쓰면 effect 안 setState lint 룰에도
 *  걸리지 않고, 외부 상태 구독이라는 의도도 더 명확하다.)
 *
 * 주의: navigator.onLine은 "네트워크 인터페이스가 살아있는지"만 보장할 뿐 실제 서버 도달성을
 * 보장하진 않는다(예: 와이파이는 연결됐지만 인터넷이 안 되는 경우 true일 수 있음). 그래도
 * 완전한 오프라인(비행기 모드, 지하철 터널 등)은 정확히 잡아내므로 "오프라인 안내" 용도로는 충분하다.
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
