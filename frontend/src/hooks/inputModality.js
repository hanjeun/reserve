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

/* 화면 너비로 터치를 가정하지 않고 실제 입력 이벤트를 공유한다. */
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
