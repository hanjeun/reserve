export function installMarketingScroll(document, motion) {
    const view = document.defaultView;
    const root = document.documentElement;
    let frame;
    let quietTimer;
    let locked = false;
    let direction = 0;
    let distance = 0;
    let touchPoint;

    const headerHeight = () => document.querySelector('.marketing-header')?.getBoundingClientRect().height ?? 64;
    const maximum = () => Math.max(0, root.scrollHeight - view.innerHeight);
    const clamp = value => Math.max(0, Math.min(maximum(), value));
    const heroReady = hero => hero.querySelector('[data-hero-handoff][data-present="true"] [data-marketing-section-title]')?.dataset.typingState === 'complete';
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
    const settle = () => { cancel(); view.clearTimeout(quietTimer); resetGesture(); };
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
            .map(node => ({ node, start: clamp(node.getBoundingClientRect().top + view.scrollY - headerHeight()), height: node.getBoundingClientRect().height }));
        const index = scenes.findLastIndex(scene => scene.start <= position + 8);
        const current = scenes[index];
        if (!current) return undefined;
        if (nextDirection > 0 && current.node.hasAttribute('data-hero-story') && heroReady(current.node)) return scenes[index + 1]?.start;
        if (current.node.hasAttribute('data-hero-story')) {
            if (nextDirection < 0 && position > current.start + 8) return current.start;
            if (nextDirection > 0 && position < current.start + current.height - available - 8) return undefined;
        }
        if (nextDirection > 0) {
            if (current.height > available + 2 && position < current.start + current.height - available - 8) {
                const screen = current.node.querySelector('[data-marketing-scroll-stop]');
                if (!screen || screen.getBoundingClientRect().height > available) return undefined;
                const bounds = screen.getBoundingClientRect();
                const stop = clamp(bounds.top + view.scrollY + bounds.height / 2 - headerHeight() - available / 2);
                return stop > position + 8 ? stop : scenes[index + 1]?.start;
            }
            return scenes[index + 1]?.start;
        }
        if (position > current.start + 8) return current.height > available + 2 && !current.node.querySelector('[data-marketing-scroll-stop]') ? undefined : current.start;
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
    const typingPending = () => {
        if (motion.matches || document.hidden) return false;
        const header = headerHeight();
        return [...document.querySelectorAll('[data-marketing-section-title][data-typing-state]')].some(heading => {
            if (!['pending', 'typing'].includes(heading.dataset.typingState) || heading.closest('[inert]') || !heading.getClientRects().length) return false;
            if (view.getComputedStyle(heading).visibility === 'hidden') return false;
            const bounds = heading.getBoundingClientRect();
            return bounds.height > 0 && Math.max(0, Math.min(bounds.bottom, view.innerHeight) - Math.max(bounds.top, header)) / bounds.height >= 0.6;
        });
    };
    const heroLanding = delta => {
        if (delta <= 0) return undefined;
        for (const hero of document.querySelectorAll('[data-hero-story]')) {
            if (!hero.getClientRects().length) continue;
            if (heroReady(hero)) continue;
            const bounds = hero.getBoundingClientRect();
            if (bounds.top > headerHeight() + 1 || bounds.bottom < view.innerHeight - 1) continue;
            const end = clamp(bounds.bottom + view.scrollY - view.innerHeight);
            if (view.scrollY < end - 1) return end;
        }
        return undefined;
    };
    const heroPending = () => !motion.matches && !document.hidden && [...document.querySelectorAll('[data-hero-story]')].some(hero => {
        if (!['playing', 'preparing', 'transition'].includes(hero.dataset.playbackState) || !hero.getClientRects().length) return false;
        const bounds = hero.getBoundingClientRect();
        return bounds.top <= headerHeight() && bounds.bottom <= view.innerHeight + 2 && bounds.bottom >= headerHeight();
    });
    const forwardPending = () => typingPending() || heroPending();
    const holdForward = event => {
        event.preventDefault();
        direction = 1; distance = 0; locked = true; afterQuiet();
    };
    const wheel = event => {
        if (motion.matches || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey
            || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
        const nextDirection = Math.sign(event.deltaY);
        if (nativeScroll(event.target, nextDirection)) return;
        if (nextDirection > 0 && forwardPending()) { holdForward(event); return; }
        if (direction && direction !== nextDirection) settle();
        if ((locked || frame != null) && direction === nextDirection) {
            event.preventDefault(); afterQuiet(); return;
        }
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.innerHeight : 1);
        // 첫 전진 입력은 예약 장면의 전환 지점에 정착해요.
        const target = heroLanding(delta) ?? stepTarget(nextDirection);
        if (target == null) return;
        event.preventDefault();
        direction = nextDirection;
        distance += delta;
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
        const hero = section?.closest('[data-hero-story]');
        const embedded = hero && section !== hero && !motion.matches;
        const target = embedded ? hero.getBoundingClientRect().bottom + view.scrollY - view.innerHeight
            : section?.getBoundingClientRect().top + view.scrollY - headerHeight();
        if (!top && target > view.scrollY + 1 && forwardPending()) { holdForward(event); return; }
        event.preventDefault();
        settle();
        scrollTo(top ? 0 : target);
    };
    const touchStart = event => {
        settle();
        const touch = event.touches.length === 1 ? event.touches[0] : null;
        touchPoint = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const touchMove = event => {
        const touch = event.touches.length === 1 ? event.touches[0] : null;
        if (!touch || !touchPoint) { touchPoint = null; return; }
        const delta = touchPoint.y - touch.clientY, sideways = touchPoint.x - touch.clientX;
        touchPoint = { x: touch.clientX, y: touch.clientY };
        if (!motion.matches && event.cancelable && delta > 0 && Math.abs(delta) > Math.abs(sideways)
            && !nativeScroll(event.target, 1) && forwardPending()) event.preventDefault();
    };
    const touchEnd = () => { touchPoint = null; };
    const touchCancel = () => { touchEnd(); settle(); };
    const keydown = event => {
        const forward = ['ArrowDown', 'PageDown', ' '].includes(event.key) && !event.shiftKey;
        const activatesControl = event.key === ' ' && event.target.closest?.('button, a, summary, [role="button"]');
        if (!motion.matches && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey
            && forward && !activatesControl && !nativeScroll(event.target, 1)) {
            if (forwardPending()) { holdForward(event); return; }
            const landing = heroLanding(event.key === 'ArrowDown' ? 40 : view.innerHeight * 0.9);
            if (landing != null) { event.preventDefault(); settle(); scrollTo(landing); return; }
        }
        if (['Escape', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) settle();
    };
    document.addEventListener('wheel', wheel, { passive: false });
    document.addEventListener('click', click);
    document.addEventListener('keydown', keydown);
    document.addEventListener('touchstart', touchStart, { passive: true });
    document.addEventListener('touchmove', touchMove, { passive: false });
    document.addEventListener('touchend', touchEnd, { passive: true });
    document.addEventListener('touchcancel', touchCancel);
    motion.addEventListener('change', settle);
    view.addEventListener('resize', settle);
    view.addEventListener('pagehide', settle);
    return () => {
        settle();
        document.removeEventListener('wheel', wheel);
        document.removeEventListener('click', click);
        document.removeEventListener('keydown', keydown);
        document.removeEventListener('touchstart', touchStart);
        document.removeEventListener('touchmove', touchMove);
        document.removeEventListener('touchend', touchEnd);
        document.removeEventListener('touchcancel', touchCancel);
        motion.removeEventListener('change', settle);
        view.removeEventListener('resize', settle);
        view.removeEventListener('pagehide', settle);
    };
}
