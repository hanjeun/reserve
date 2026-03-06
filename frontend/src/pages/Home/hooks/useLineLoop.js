import { useState, useRef, useEffect } from 'react';
import Hangul from 'hangul-js';

export const LINES = [
    { before: '버튼 ', blue: '클릭 한 번', after: '으로' },
    { before: '더 쉽고 ', blue: '더 놀라운', after: ' 경험을' },
    { before: '', blue: '모든 식당', after: '을 예약하세요' },
    { before: '', blue: '지금 바로', after: ' 시작해보세요' },
];

export function fullText(line) {
    return line.before + line.blue + line.after;
}

function buildTypingSeq(text) {
    const jaso = Hangul.disassemble(text);
    return jaso.map((_, i) => Hangul.assemble(jaso.slice(0, i + 1)));
}
function buildErasingSeq(text) {
    const jaso = Hangul.disassemble(text);
    return jaso.map((_, i) => Hangul.assemble(jaso.slice(0, jaso.length - i - 1)));
}

export function useLineLoop({ typeSpeed = 58, eraseSpeed = 40, pauseMs = 1800, startDelay = 1000 } = {}) {
    const [lineIdx, setLineIdx] = useState(0);
    const [current, setCurrent] = useState(fullText(LINES[0]));
    const idxRef = useRef(0);
    const timerRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        const schedule = (fn, ms) => {
            timerRef.current = setTimeout(() => { if (!cancelled) fn(); }, ms);
        };
        const erase = () => {
            const seq = buildErasingSeq(fullText(LINES[idxRef.current % LINES.length]));
            let j = 0;
            const step = () => {
                if (j < seq.length) { setCurrent(seq[j++]); schedule(step, eraseSpeed); }
                else { idxRef.current++; setLineIdx(idxRef.current % LINES.length); schedule(type, eraseSpeed * 4); }
            };
            step();
        };
        const type = () => {
            const seq = buildTypingSeq(fullText(LINES[idxRef.current % LINES.length]));
            let i = 0;
            const step = () => {
                if (i < seq.length) { setCurrent(seq[i++]); schedule(step, typeSpeed); }
                else { schedule(erase, pauseMs); }
            };
            step();
        };
        schedule(erase, startDelay);
        return () => { cancelled = true; clearTimeout(timerRef.current); };
    }, []);

    return { current, lineIdx };
}
