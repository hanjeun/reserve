import { useLayoutEffect, useRef } from 'react';
import useReducedMotion from './useReducedMotion';

export default function useListSelectionMotion(ref, { selection, view, ids, ready = true }) {
    const previous = useRef(null);
    const reduced = useReducedMotion();
    const order = JSON.stringify(ids);

    useLayoutEffect(() => {
        const node = ref.current;
        const before = previous.current;
        previous.current = ready && node ? { node, selection, view, order } : null;
        if (!ready || reduced || !node || before?.node !== node || before.view !== view
            || before.selection === selection || before.order === order || typeof node.animate !== 'function') return undefined;

        const animation = node.animate([{ opacity: 0.78 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
        return () => animation.cancel();
    }, [ref, selection, view, order, ready, reduced]);
}
