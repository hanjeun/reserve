export function installMarketingBackdrop(document, motion) {
    const view = document.defaultView;
    const surfaces = [...document.querySelectorAll('[data-marketing-backdrop]')];
    const homes = surfaces.map(surface => surface.closest('.marketing-home'));
    if (!surfaces.length) return () => {};
    const excluded = 'a,button,input,select,textarea,label,summary,[role="button"],h1,h2,h3,p,[data-marketing-demo],.marketing-device';
    const current = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let drag;
    let frame;
    let lastTime;
    let visible = true;
    const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
    const allowed = node => node instanceof view.Element && node.closest('.marketing-home') && !node.closest(excluded);
    const paint = () => {
        surfaces.forEach(surface => {
            surface.style.setProperty('--mist-x', `${current.x.toFixed(2)}px`);
            surface.style.setProperty('--mist-y', `${current.y.toFixed(2)}px`);
        });
    };
    const stopped = () => motion.matches || document.hidden || !visible;
    const update = now => {
        frame = undefined;
        if (stopped()) return;
        const elapsed = lastTime == null ? 16 : Math.min(64, now - lastTime);
        lastTime = now;
        const blend = 1 - Math.exp(-elapsed / (drag ? 850 : 1250));
        current.x += (target.x - current.x) * blend;
        current.y += (target.y - current.y) * blend;
        paint();
        if (Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.08) frame = view.requestAnimationFrame(update);
        else lastTime = undefined;
    };
    const schedule = () => { if (frame == null && !stopped()) frame = view.requestAnimationFrame(update); };
    const release = () => { drag = undefined; target.x = 0; target.y = 0; schedule(); };
    const pull = (x, y) => {
        target.x = clamp((x - drag.x) * 0.6, Math.min(150, view.innerWidth * 0.2));
        target.y = clamp((y - drag.y) * 0.6, Math.min(120, view.innerHeight * 0.18));
        schedule();
    };
    const pointerDown = event => {
        if (stopped() || event.pointerType === 'touch' || event.button !== 0 || !allowed(event.target)) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: false };
    };
    const pointerMove = event => {
        if (stopped() || event.pointerType === 'touch') return;
        if (drag && !drag.touch && event.buttons === 0) { release(); return; }
        if (drag && !drag.touch && drag.id === event.pointerId) pull(event.clientX, event.clientY);
        else if (!drag && allowed(event.target)) {
            target.x = (event.clientX / view.innerWidth - 0.5) * 30;
            target.y = (event.clientY / view.innerHeight - 0.5) * 22;
            schedule();
        }
    };
    const pointerEnd = event => { if (drag && !drag.touch && event.pointerId === drag.id) release(); };
    const touchStart = event => {
        if (stopped() || event.touches.length !== 1 || !allowed(event.target)) { release(); return; }
        const touch = event.touches[0]; drag = { id: touch.identifier, x: touch.clientX, y: touch.clientY, touch: true };
    };
    const touchMove = event => {
        if (!drag?.touch || stopped()) return;
        if (event.touches.length !== 1) { release(); return; }
        const touch = [...event.touches].find(item => item.identifier === drag.id);
        if (touch) pull(touch.clientX, touch.clientY);
    };
    const touchEnd = event => { if (drag?.touch && ![...event.touches].some(touch => touch.identifier === drag.id)) release(); };
    const sync = () => {
        surfaces.forEach(surface => surface.classList.toggle('is-paused', stopped()));
        if (frame != null) view.cancelAnimationFrame(frame);
        frame = undefined; lastTime = undefined; drag = undefined;
        target.x = 0; target.y = 0;
        if (motion.matches) { current.x = 0; current.y = 0; paint(); }
        else schedule();
    };
    const seen = new Map(homes.map(home => [home, true]));
    const observer = typeof view.IntersectionObserver === 'function' ? new view.IntersectionObserver(entries => {
        entries.forEach(entry => seen.set(entry.target, entry.isIntersecting));
        visible = [...seen.values()].some(Boolean); sync();
    }) : null;
    homes.forEach(home => observer?.observe(home));
    // 터치 스크롤·확대와 입력 조작은 배경 효과가 가로채지 않는다.
    const events = [['pointerdown', pointerDown], ['pointermove', pointerMove], ['pointerup', pointerEnd], ['pointercancel', pointerEnd],
        ['touchstart', touchStart], ['touchmove', touchMove], ['touchend', touchEnd], ['touchcancel', touchEnd], ['blur', release]];
    events.forEach(([name, handler]) => view.addEventListener(name, handler, { passive: true }));
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    sync();
    return () => {
        if (frame != null) view.cancelAnimationFrame(frame);
        observer?.disconnect(); events.forEach(([name, handler]) => view.removeEventListener(name, handler));
        document.removeEventListener('visibilitychange', sync); motion.removeEventListener('change', sync);
        surfaces.forEach(surface => surface.classList.add('is-paused'));
        current.x = 0; current.y = 0; paint();
    };
}
