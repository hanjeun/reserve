import { useState, useEffect, useRef } from 'react';

/*
 * 닫힘 전환 동안 렌더링을 유지한다. 호출부는 isClosing으로 닫힘 애니메이션을 선택한다.
 */
const useExitAnimation = (open, exitDuration = 200, waitForPaint = false) => {
    const [shouldRender, setShouldRender] = useState(open);
    const [isClosing, setIsClosing] = useState(false);
    const timerRef = useRef(null);
    // 현재 렌더 상태는 비동기 콜백에서도 읽을 수 있도록 ref로 함께 보관한다.

    const renderedRef = useRef(open);

    useEffect(() => {
        // react-hooks/set-state-in-effect 예외:
        // 이 훅의 존재 이유 자체가 "open이 false가 된 뒤에도 타이머가 끝날 때까지 렌더를 유지"하는 것이라,
        // 렌더 상태를 setTimeout이라는 외부 시스템과 동기화하는 setState가 effect 안에 있을 수밖에 없다.
        // (룰이 막으려는 건 props에서 파생 가능한 상태를 effect로 계산하는 경우인데, 여기서는 시간에
        //  의존하는 상태라 파생이 불가능하다.)
        /* eslint-disable react-hooks/set-state-in-effect */
        if (open) {
            if (timerRef.current) clearTimeout(timerRef.current);
            renderedRef.current = true;
            setIsClosing(false);
            setShouldRender(true);
            return undefined;
        }
        // 이미 안 보이는 상태면 닫히는 애니메이션을 새로 재생할 필요 없음
        if (!renderedRef.current) return undefined;
        setIsClosing(true);
        /* eslint-enable react-hooks/set-state-in-effect */
        let firstFrame;
        let secondFrame;
        const startTimer = () => {
            timerRef.current = setTimeout(() => {
                renderedRef.current = false;
                setShouldRender(false);
                setIsClosing(false);
            }, exitDuration);
        };
        // 바쁜 프레임에서도 퇴장 스타일을 먼저 그린 뒤 유지 시간을 계산한다.
        if (waitForPaint && typeof window.requestAnimationFrame === 'function') {
            firstFrame = window.requestAnimationFrame(() => {
                secondFrame = window.requestAnimationFrame(startTimer);
            });
        } else startTimer();
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (firstFrame !== undefined) window.cancelAnimationFrame(firstFrame);
            if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
        };
    }, [open, exitDuration, waitForPaint]);

    return { shouldRender, isClosing };
};

export default useExitAnimation;
