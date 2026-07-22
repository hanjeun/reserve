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

    useEffect(() => {
        if (open) {
            if (timerRef.current) clearTimeout(timerRef.current);
            setIsClosing(false);
            setShouldRender(true);
            return undefined;
        }
        // 이미 안 보이는 상태면 닫히는 애니메이션을 새로 재생할 필요 없음
        setShouldRender((prev) => {
            if (!prev) return prev;
            setIsClosing(true);
            timerRef.current = setTimeout(() => {
                setShouldRender(false);
                setIsClosing(false);
            }, exitDuration);
            return prev;
        });
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return { shouldRender, isClosing };
};

export default useExitAnimation;
