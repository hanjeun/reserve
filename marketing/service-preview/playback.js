export const isPreviewProgress = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
export const isPreviewMessage = (event, parent, origin) => event.source === parent && event.origin === origin
    && (event.data?.type === 'reserve:service-preview:active' && typeof event.data.active === 'boolean'
        || event.data?.type === 'reserve:service-preview:progress' && isPreviewProgress(event.data.progress));
const ease = value => { const t = Math.max(0, Math.min(1, (value - 0.25) / 0.4)); return t * t * (3 - 2 * t); };

export function loadPreviewFont(document) {
    const href = document.querySelector('script[data-preview-font]')?.dataset.previewFont;
    if (!href) return document.fonts?.ready;
    return new Promise(resolve => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.addEventListener('load', () => {
            const loaded = document.fonts?.load?.('14px "Pretendard Variable"', '예약');
            resolve(loaded?.catch(() => undefined));
        }, { once: true });
        link.addEventListener('error', () => resolve(), { once: true });
        document.head.append(link);
    });
}

export function createPreviewPlayback(view, { scene, transport, client, setQrOpen, fontReady = view.document.fonts?.ready }) {
    const document = view.document, motion = view.matchMedia('(prefers-reduced-motion: reduce)');
    let active = false, manual = false, progress = 0, frame, positioned = false, open = false, pressed, paintFrame, painted = false;
    let fontsReady = !fontReady;
    fontReady?.then(() => { fontsReady = true; schedule(); });
    const cancel = () => { if (frame != null) view.cancelAnimationFrame(frame); frame = undefined; };
    const clearPress = () => { pressed?.removeAttribute('data-preview-press'); pressed = undefined; };
    const updateQr = next => { if (next !== open) { open = next; setQrOpen(next); } };
    const render = () => {
        frame = undefined;
        if (!active || manual) return;
        const phase = motion.matches ? 1 : ease(progress);
        if (scene === 'waiting' && transport.setPlaybackPhase(phase)) void client.invalidateQueries({ queryKey: ['waiting'] });
        if (scene === 'qr') { updateQr(phase > 0.45); return; }
        let target;
        if (scene === 'booking') {
            const panel = document.querySelector('.reserve-store-action-panel form')?.closest('.reserve-store-action-panel');
            if (!panel) return;
            target = panel.getBoundingClientRect().top + view.scrollY - 80 - (motion.matches ? 0 : (1 - phase) * 120);
        } else if (!motion.matches) target = phase * (scene === 'explore' ? 240 : 90);
        if (target != null && !document.querySelector('.ant-modal-wrap:not([style*="display: none"])')) {
            target = Math.max(0, Math.min(target, Math.max(0, document.documentElement.scrollHeight - view.innerHeight)));
            const difference = target - view.scrollY;
            if (!positioned || motion.matches) { view.scrollTo({ top: target, behavior: 'instant' }); positioned = true; }
            else if (Math.abs(difference) > 0.5) { view.scrollTo({ top: view.scrollY + difference * 0.22, behavior: 'instant' }); schedule(); }
        }
        const settled = target != null && Math.abs(target - view.scrollY) <= 0.5;
        if (scene === 'booking' && positioned && settled && fontsReady && !painted && paintFrame == null) {
            paintFrame = view.requestAnimationFrame(() => {
                paintFrame = view.requestAnimationFrame(() => {
                    paintFrame = undefined;
                    if (!active || manual) return;
                    painted = true;
                    view.parent?.postMessage({ type: 'reserve:service-preview:painted' }, new URL(document.baseURI).origin);
                });
            });
        }
        const button = scene === 'explore' ? document.querySelector('.reserve-favorite-button')
            : scene === 'booking' ? document.querySelector('.reserve-store-action-panel button[type="submit"]')
                : [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'QR');
        if (!motion.matches && phase > 0.45 && phase < 0.95 && button && !button.disabled) {
            if (pressed !== button) { clearPress(); pressed = button; pressed.setAttribute('data-preview-press', ''); }
        } else clearPress();
    };
    const schedule = () => { if (active && !manual && frame == null) frame = view.requestAnimationFrame(render); };
    // 직접 조작한 폼·스크롤·모달은 장면 연출이 다시 덮어쓰지 않는다.
    const takeOver = () => { manual = true; cancel(); clearPress(); };
    const observer = new view.MutationObserver(schedule);
    observer.observe(document.getElementById('root'), { childList: true, subtree: true });
    const resize = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : null;
    resize?.observe(document.documentElement);
    for (const name of ['pointerdown', 'touchstart', 'wheel', 'keydown']) view.addEventListener(name, takeOver, { passive: true, capture: true });
    view.addEventListener('load', schedule, true); motion.addEventListener('change', schedule);
    return {
        setActive: next => { active = next; if (next) schedule(); else { cancel(); clearPress(); if (!manual) updateQr(false); } },
        setProgress: value => { if (isPreviewProgress(value)) { progress = value; schedule(); } },
        dispose: () => {
            active = false;
            if (paintFrame != null) view.cancelAnimationFrame(paintFrame);
            cancel(); clearPress(); observer.disconnect(); resize?.disconnect();
            for (const name of ['pointerdown', 'touchstart', 'wheel', 'keydown']) view.removeEventListener(name, takeOver, true);
            view.removeEventListener('load', schedule, true); motion.removeEventListener('change', schedule);
        },
    };
}
