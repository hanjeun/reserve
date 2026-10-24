import { useEffect, useRef, useState } from 'react';
import useReducedMotion from './useReducedMotion';
import { SEARCH_MOTION_DURATION_MS } from '../components/layout/searchTransition';

/** 검색창과 본문의 진입·닫힘을 전용 검색과 메신저에서 함께 사용한다. */
export default function useSearchTransition({ inputRef, animateEntry = true, active = true } = {}) {
    const reducedMotion = useReducedMotion();
    const [isClosing, setIsClosing] = useState(false);
    const [hasLeft, setHasLeft] = useState(false);
    const closingRef = useRef(false);
    const exitTimerRef = useRef(null);
    useEffect(() => () => window.clearTimeout(exitTimerRef.current), []);
    useEffect(() => {
        if (active) return;
        window.clearTimeout(exitTimerRef.current);
        closingRef.current = false;
        // A search kept behind a conversation must finish its previous exit before it can reopen.
        setIsClosing(false); // eslint-disable-line react-hooks/set-state-in-effect
    }, [active]);

    const leaveSearch = leave => {
        if (closingRef.current) return;
        closingRef.current = true;
        setHasLeft(true);
        inputRef?.current?.blur();
        if (reducedMotion) {
            leave();
            return;
        }
        setIsClosing(true);
        exitTimerRef.current = window.setTimeout(leave, SEARCH_MOTION_DURATION_MS);
    };

    let motionClass = '';
    if (isClosing) motionClass = ' reserve-search-page--leaving';
    else if (!reducedMotion && !hasLeft && animateEntry) motionClass = ' reserve-search-page--entering';
    return { isClosing, leaveSearch, motionClass };
}
