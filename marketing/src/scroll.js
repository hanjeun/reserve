export function installMarketingScroll(document, motion) {
    const view = document.defaultView;
    const root = document.documentElement;
    let frame;
    let quietTimer;
    let locked = false;
    let direction = 0;
    let distance = 0;
    let touch;

    const headerHeight = () => document.querySelector('.marketing-header')?.getBoundingClientRect().height ?? 64;
    const maximum = () => Math.max(0, root.scrollHeight - view.innerHeight);
    const clamp = value => Math.max(0, Math.min(maximum(), value));
    const cancel = () => {
        if (frame != null) view.cancelAnimationFrame(frame);
        frame = undefined;
        root.classList.remove('marketing-scrolling');
    };
    const resetGesture = () => { locked = false; direction = 0; distance = 0; };
    const afterQuiet = () => {
        view.clearTimeout(quietTimer);
        quietTimer = view.setTimeout(resetGesture, 160);
    };
    const settle = () => { cancel(); view.clearTimeout(quietTimer); resetGesture(); touch = undefined; };
    const scrollTo = (target, duration = 420) => {
        cancel();
        const end = clamp(target);
        const start = view.scrollY;
        root.classList.add('marketing-scrolling');
        if (motion.matches || Math.abs(end - start) < 1) {
            view.scrollTo(0, end);
            root.classList.remove('marketing-scrolling');
            return;
        }
        let began;
        const step = now => {
            began ??= now;
            const progress = Math.min(1, (now - began) / duration);
            const eased = 1 - (1 - progress) ** 3;
            view.scrollTo(0, start + (end - start) * eased);
            if (progress < 1) frame = view.requestAnimationFrame(step);
            else { frame = undefined; root.classList.remove('marketing-scrolling'); afterQuiet(); }
        };
        frame = view.requestAnimationFrame(step);
    };

    const stepTarget = (nextDirection, position = view.scrollY) => {
        const available = view.innerHeight - headerHeight();
        const scenes = [...document.querySelectorAll('.marketing-scene, footer')]
            .filter(node => node.getClientRects().length)
            .map(node => ({ start: clamp(node.getBoundingClientRect().top + view.scrollY - headerHeight()), height: node.getBoundingClientRect().height }));
        const index = scenes.findLastIndex(scene => scene.start <= position + 8);
        const current = scenes[index];
        if (!current) return undefined;
        if (nextDirection > 0) {
            if (current.height > available + 2 && position < current.start + current.height - available - 8) return undefined;
            return scenes[index + 1]?.start;
        }
        if (position > current.start + 8) return current.height > available + 2 ? undefined : current.start;
        return scenes[index - 1]?.start;
    };
    const nativeScroll = (target, nextDirection) => {
        if (!(target instanceof view.Element)) return true;
        if (target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="listbox"], [role="menu"]')) return true;
        for (let node = target; node && node !== document.body; node = node.parentElement) {
            if (!/auto|scroll/.test(view.getComputedStyle(node).overflowY) || node.scrollHeight <= node.clientHeight + 1) continue;
            if (nextDirection > 0 ? node.scrollTop + node.clientHeight < node.scrollHeight - 1 : node.scrollTop > 0) return true;
        }
        return false;
    };
    const wheel = event => {
        if (motion.matches || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey
            || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
        const nextDirection = Math.sign(event.deltaY);
        if (nativeScroll(event.target, nextDirection)) return;
        if (direction && direction !== nextDirection) settle();
        if ((locked || frame != null) && direction === nextDirection) {
            event.preventDefault(); afterQuiet(); return;
        }
        const target = stepTarget(nextDirection);
        if (target == null) return;
        event.preventDefault();
        direction = nextDirection;
        distance += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.innerHeight : 1);
        afterQuiet();
        if (Math.abs(distance) < 24) return;
        locked = true;
        scrollTo(target);
    };
    const click = event => {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const control = event.target.closest?.('[data-scroll-top], [data-scroll-target]');
        if (!control) return;
        const top = control.hasAttribute('data-scroll-top');
        const section = top ? null : document.getElementById(control.dataset.scrollTarget);
        if (!top && !section) return;
        event.preventDefault();
        settle();
        scrollTo(top ? 0 : section.getBoundingClientRect().top + view.scrollY - headerHeight());
    };
    const touchStart = event => {
        settle();
        if (motion.matches || event.touches.length !== 1) return;
        const point = event.touches[0];
        touch = { x: point.clientX, y: point.clientY, scroll: view.scrollY, target: event.target };
    };
    const touchEnd = event => {
        const start = touch;
        touch = undefined;
        const point = event.changedTouches[0];
        if (!start || !point || motion.matches) return;
        const delta = start.y - point.clientY;
        if (Math.abs(delta) < 48 || Math.abs(delta) <= Math.abs(start.x - point.clientX)) return;
        const nextDirection = Math.sign(delta);
        if (nativeScroll(start.target, nextDirection)) return;
        const target = stepTarget(nextDirection, start.scroll);
        if (target != null) scrollTo(target);
    };
    const keydown = event => {
        if (['Escape', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) settle();
    };
    document.addEventListener('wheel', wheel, { passive: false });
    document.addEventListener('click', click);
    document.addEventListener('keydown', keydown);
    document.addEventListener('touchstart', touchStart, { passive: true });
    document.addEventListener('touchend', touchEnd, { passive: true });
    document.addEventListener('touchcancel', settle);
    motion.addEventListener('change', settle);
    view.addEventListener('resize', settle);
    view.addEventListener('pagehide', settle);
    return () => {
        settle();
        document.removeEventListener('wheel', wheel);
        document.removeEventListener('click', click);
        document.removeEventListener('keydown', keydown);
        document.removeEventListener('touchstart', touchStart);
        document.removeEventListener('touchend', touchEnd);
        document.removeEventListener('touchcancel', settle);
        motion.removeEventListener('change', settle);
        view.removeEventListener('resize', settle);
        view.removeEventListener('pagehide', settle);
    };
}
