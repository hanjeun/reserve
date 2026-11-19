export function installServicePreviews(document) {
    const view = document.defaultView;
    const frames = [...document.querySelectorAll('iframe[data-service-preview]')];
    const visible = new Map(), progress = new Map(), sent = new Map(), activity = new Map();
    const available = frame => !frame.closest('[data-hero-handoff]') || frame.closest('[data-hero-handoff]').dataset.ready === 'true';
    const activeFrame = frame => {
        const handoff = frame.closest('[data-hero-handoff]');
        return !document.hidden && visible.get(frame) === true && available(frame) && (!handoff?.inert || handoff.dataset.renderActive === 'true');
    };
    const notify = frame => {
        const active = activeFrame(frame);
        activity.set(frame, active);
        frame.contentWindow?.postMessage({ type: 'reserve:service-preview:active', active }, '*');
        if (active && progress.has(frame)) { frame.contentWindow?.postMessage({ type: 'reserve:service-preview:progress', progress: progress.get(frame) }, '*'); sent.set(frame, progress.get(frame)); }
    };
    const load = frame => {
        if (!frame.dataset.started) {
            frame.dataset.started = 'true';
            // 명시적 가시성 검사 뒤에는 브라우저의 지연 로딩을 겹치지 않아요.
            frame.loading = 'eager';
            frame.src = frame.dataset.previewSrc;
        }
        notify(frame);
    };
    const loaded = event => notify(event.currentTarget);
    const ready = event => {
        if (event.origin !== 'null' || !['reserve:service-preview:ready', 'reserve:service-preview:painted'].includes(event.data?.type)) return;
        const frame = frames.find(candidate => candidate.contentWindow === event.source);
        if (frame) {
            frame.dataset.previewReady = 'true';
            if (event.data.type === 'reserve:service-preview:painted') frame.dataset.previewPainted = 'true';
            notify(frame);
            document.dispatchEvent(new view.Event('reserve:service-preview-ready'));
        }
    };
    const visibility = () => frames.forEach(notify);
    frames.forEach(frame => frame.addEventListener('load', loaded));
    const observer = typeof view.IntersectionObserver === 'function' ? new view.IntersectionObserver(entries => {
        for (const entry of entries) { visible.set(entry.target, entry.isIntersecting); if (entry.isIntersecting && available(entry.target)) load(entry.target); else notify(entry.target); }
    }, { threshold: 0.01 }) : null;
    if (observer) frames.forEach(frame => observer.observe(frame));
    else frames.filter(frame => frame.getClientRects().length).forEach(frame => { visible.set(frame, true); load(frame); });
    document.addEventListener('visibilitychange', visibility);
    view.addEventListener('message', ready);
    return {
        progress: (scene, value) => {
            const frame = scene.querySelector('iframe[data-service-preview]');
            if (!frame || !Number.isFinite(value)) return;
            const next = Math.max(0, Math.min(1, value)), previous = sent.get(frame);
            progress.set(frame, next);
            if (!document.hidden && visible.get(frame) && available(frame)) {
                if (!frame.dataset.started) load(frame);
                else if (activity.get(frame) !== activeFrame(frame) || previous == null || Math.abs(previous - next) >= 0.004) notify(frame);
            }
        },
        dispose: () => { observer?.disconnect(); document.removeEventListener('visibilitychange', visibility); view.removeEventListener('message', ready); frames.forEach(frame => frame.removeEventListener('load', loaded)); },
    };
}
