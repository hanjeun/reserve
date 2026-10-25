import { useCallback, useRef } from 'react';

/* 시작 완료가 화면 닫힘보다 늦어도 스캐너는 한 번만 중지한다. */
export default function useQrCameraLifecycle() {
    const starts = useRef(new WeakMap());
    const stops = useRef(new WeakMap());
    const trackStartup = useCallback((scanner, startup) => { starts.current.set(scanner, startup); }, []);
    const stopCamera = useCallback(scanner => {
        if (!scanner) return Promise.resolve();
        const existing = stops.current.get(scanner);
        if (existing) return existing;
        const stop = Promise.resolve(starts.current.get(scanner)).catch(() => {}).then(() => scanner.stop()).catch(() => {});
        stops.current.set(scanner, stop);
        return stop;
    }, []);
    return { stopCamera, trackStartup };
}
