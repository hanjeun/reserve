import { useCallback, useRef } from 'react';

/** A scanner stops once, including when the start promise completes after the screen closes. */
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
