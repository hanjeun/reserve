import { transitions } from '../../frontend/src/styles/tokens/spacing.js';

export function installFaqMotion(document, motion) {
    const view = document.defaultView;
    if (!view?.HTMLElement.prototype.animate) return () => {};
    const active = new Map();
    const listeners = [];

    const finish = (item, expanded) => {
        const previous = active.get(item);
        active.delete(item);
        previous?.animation.cancel();
        item.open = expanded;
        item.dataset.expanded = String(expanded);
        item.classList.remove('is-animating');
    };
    const settle = () => {
        for (const [item, { expanded }] of active) finish(item, expanded);
    };
    const toggle = (item, expanded) => {
        const start = item.getBoundingClientRect().height;
        const previous = active.get(item);
        active.delete(item);
        previous?.animation.cancel();
        if (motion.matches) return finish(item, expanded);

        item.open = true;
        item.dataset.expanded = String(expanded);
        const end = expanded ? item.getBoundingClientRect().height : item.querySelector('summary').getBoundingClientRect().height;
        item.classList.add('is-animating');
        const animation = item.animate([{ height: `${start}px` }, { height: `${end}px` }], {
            duration: 250, easing: transitions.easing,
        });
        active.set(item, { animation, expanded });
        animation.onfinish = () => {
            if (active.get(item)?.animation === animation) finish(item, expanded);
        };
    };

    for (const group of document.querySelectorAll('.faq-collapse')) {
        const items = [...group.querySelectorAll('details')];
        for (const item of items) {
            const name = item.getAttribute('name');
            item.removeAttribute('name');
            item.dataset.expanded = String(item.open);
            const summary = item.querySelector('summary');
            const syncNativeToggle = () => {
                if (!active.has(item)) item.dataset.expanded = String(item.open);
            };
            const listener = event => {
                event.preventDefault();
                const expanded = !(active.get(item)?.expanded ?? item.open);
                if (expanded) for (const other of items) {
                    if (other !== item && (active.get(other)?.expanded ?? other.open)) toggle(other, false);
                }
                toggle(item, expanded);
            };
            summary.addEventListener('click', listener);
            item.addEventListener('toggle', syncNativeToggle);
            listeners.push(() => {
                summary.removeEventListener('click', listener);
                item.removeEventListener('toggle', syncNativeToggle);
                if (name != null) item.setAttribute('name', name);
                delete item.dataset.expanded;
            });
        }
    }
    motion.addEventListener('change', settle);
    view.addEventListener('resize', settle);
    view.addEventListener('pagehide', settle);
    return () => {
        settle();
        listeners.forEach(remove => remove());
        motion.removeEventListener('change', settle);
        view.removeEventListener('resize', settle);
        view.removeEventListener('pagehide', settle);
    };
}
