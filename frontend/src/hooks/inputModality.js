let modality = 'pointer';
const listeners = new Set();

const update = next => {
    if (modality === next) return;
    modality = next;
    listeners.forEach(listener => listener());
};
const pointer = event => update(event.pointerType === 'touch' ? 'touch' : 'pointer');
const touch = () => update('touch');
const keyboard = () => update('keyboard');

export const getInputModality = () => modality;

/** Share actual input events rather than equating a narrow viewport with touch. */
export const subscribeInputModality = listener => {
    if (!listeners.size) {
        document.addEventListener('pointerdown', pointer, true);
        document.addEventListener('pointermove', pointer, true);
        document.addEventListener('touchstart', touch, { capture: true, passive: true });
        document.addEventListener('keydown', keyboard, true);
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (!listeners.size) {
            document.removeEventListener('pointerdown', pointer, true);
            document.removeEventListener('pointermove', pointer, true);
            document.removeEventListener('touchstart', touch, true);
            document.removeEventListener('keydown', keyboard, true);
            modality = 'pointer';
        }
    };
};
