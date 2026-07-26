import { useState, useEffect, useRef } from 'react';

/**
 * 조건부 렌더링 요소({open && <div style={{animation: animation.slideUpIn}}>...})가
 * "열릴 때는 애니메이션이 재생되는데 닫힐 때는 즉시 사라지는" 문제를 해결하기 위한 훅.
 *
 * 원인: open이 false가 되는 순간 React가 그 자리에서 바로 언마운트해버려서, 애니메이션이
 * 재생될 시간 자체가 없다(닫히는 CSS 애니메이션을 걸어놔도 재생 전에 DOM에서 사라짐).
 *
 * 이 훅은 open이 false로 바뀐 뒤에도 exitDuration(ms) 동안은 계속 렌더링을 유지하면서
 * isClosing 플래그만 true로 올려주고, 그 시간이 지난 뒤에야 실제로 shouldRender를 내린다 —
 * 그동안 호출부에서 style={{ animation: isClosing ? animation.slideUpOut : animation.slideUpIn }}
 * 같은 식으로 "닫히는" 애니메이션을 재생시킬 수 있다.
 *
 * 사용법:
 *   const { shouldRender, isClosing } = useExitAnimation(open, 200); // 200 = slideUpOut 재생 시간(ms)
 *   {shouldRender && (
 *     <div style={{ animation: isClosing ? animation.slideUpOut : animation.slideUpIn }}>...</div>
 *   )}
 */
const useExitAnimation = (open, exitDuration = 200) => {
    const [shouldRender, setShouldRender] = useState(open);
    const [isClosing, setIsClosing] = useState(false);
    const timerRef = useRef(null);
    // 현재 렌더 여부를 effect 밖에서 동기적으로 읽기 위한 ref 미러.
    // (예전엔 setShouldRender(prev => ...)의 업데이터 안에서 prev를 읽어 분기했는데,
    //  그 업데이터가 어느 분기에서도 prev를 그대로 반환해 "항상 같은 값을 반환"하는
    //  안티패턴이 됐다 — state 업데이터를 사이드이펙트 용도로 쓰지 않도록 ref로 분리)
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
        timerRef.current = setTimeout(() => {
            renderedRef.current = false;
            setShouldRender(false);
            setIsClosing(false);
        }, exitDuration);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [open, exitDuration]);

    return { shouldRender, isClosing };
};

export default useExitAnimation;
