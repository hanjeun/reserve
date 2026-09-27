import { useCallback, useEffect, useRef, useState } from 'react';

const COOLDOWN_MS = 3000;

/** 공통 새로고침과 메신저 헤더의 연타 방지. 회전/요청 중 표시는 호출부의 loading만 따른다. */
export default function useRefreshCooldown(onReload, loading = false) {
    const [cooling, setCooling] = useState(false);
    const coolingRef = useRef(false);
    const timerRef = useRef(null);

    useEffect(() => () => clearTimeout(timerRef.current), []);

    const reload = useCallback(() => {
        if (!onReload || loading || coolingRef.current) return;
        // React가 다음 화면을 커밋하기 전의 연속 호출도 막는다.
        coolingRef.current = true;
        setCooling(true);
        timerRef.current = setTimeout(() => {
            coolingRef.current = false;
            setCooling(false);
        }, COOLDOWN_MS);
        return onReload();
    }, [onReload, loading]);

    return { reload, blocked: loading || cooling };
}
