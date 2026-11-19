export function installMarketingTooltips(document) {
    const view = document.defaultView;
    const tooltip = document.createElement('div');
    tooltip.className = 'marketing-tooltip'; tooltip.id = 'marketing-tooltip'; tooltip.role = 'tooltip'; tooltip.hidden = true;
    document.body.append(tooltip);
    let current, timer, description, keyboard = false;
    const triggerOf = target => target instanceof view.Element ? target.closest('[data-marketing-tooltip]') : null;
    const contains = (target, node) => node instanceof view.Node && target.contains(node);
    const close = () => {
        view.clearTimeout(timer); tooltip.hidden = true;
        if (current) {
            if (description == null) current.removeAttribute('aria-describedby');
            else current.setAttribute('aria-describedby', description);
        }
        current = null;
    };
    const show = trigger => {
        if (!trigger.isConnected || !trigger.getClientRects().length || document.hidden) return;
        close(); current = trigger; description = trigger.getAttribute('aria-describedby');
        tooltip.textContent = trigger.dataset.marketingTooltip;
        tooltip.hidden = false;
        trigger.setAttribute('aria-describedby', [description, tooltip.id].filter(Boolean).join(' '));
        const box = trigger.getBoundingClientRect(), width = tooltip.offsetWidth, height = tooltip.offsetHeight;
        let placement = trigger.dataset.tooltipPlacement || 'bottom';
        if (placement === 'bottom' && box.bottom + height + 16 > view.innerHeight) placement = 'top';
        const left = placement === 'left' ? box.left - width - 8 : box.left + box.width / 2 - width / 2;
        const x = Math.max(8, Math.min(view.innerWidth - width - 8, left));
        const top = placement === 'left' ? box.top + box.height / 2 - height / 2 : placement === 'top' ? box.top - height - 8 : box.bottom + 8;
        tooltip.dataset.placement = placement;
        tooltip.style.left = `${x}px`; tooltip.style.top = `${Math.max(8, Math.min(view.innerHeight - height - 8, top))}px`;
        tooltip.style.setProperty('--tip-arrow-x', `${Math.max(12, Math.min(width - 12, box.left + box.width / 2 - x))}px`);
    };
    const over = event => {
        keyboard = false;
        if (event.pointerType === 'touch') return;
        const trigger = triggerOf(event.target);
        if (!trigger || trigger === current || contains(trigger, event.relatedTarget)) return;
        close(); timer = view.setTimeout(() => show(trigger), 200);
    };
    const out = event => {
        const trigger = triggerOf(event.target);
        if (trigger && !contains(trigger, event.relatedTarget)) close();
    };
    const focus = event => { const trigger = triggerOf(event.target); if (keyboard && trigger) show(trigger); };
    const key = event => { if (event.key === 'Tab') keyboard = true; if (event.key === 'Escape') close(); };
    const pointer = () => { keyboard = false; close(); };
    document.addEventListener('pointerover', over); document.addEventListener('pointerout', out);
    document.addEventListener('focusin', focus); document.addEventListener('focusout', close);
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', pointer);
    document.addEventListener('click', close); document.addEventListener('visibilitychange', close);
    view.addEventListener('scroll', close, true); view.addEventListener('resize', close); view.addEventListener('blur', close);
    return () => {
        close(); tooltip.remove();
        document.removeEventListener('pointerover', over); document.removeEventListener('pointerout', out);
        document.removeEventListener('focusin', focus); document.removeEventListener('focusout', close);
        document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', pointer);
        document.removeEventListener('click', close); document.removeEventListener('visibilitychange', close);
        view.removeEventListener('scroll', close, true); view.removeEventListener('resize', close); view.removeEventListener('blur', close);
    };
}
