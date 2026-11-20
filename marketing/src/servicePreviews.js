const PREVIEW_TIMEOUT_MS = 8000;

export function installServicePreviews(document) {
    const view = document.defaultView;
    const frames = [...document.querySelectorAll('iframe[data-service-preview]')];
    const visible = new Map(), progress = new Map(), sent = new Map(), activity = new Map();
    const timers = new Map();
    const screens = frames.map(frame => frame.closest('.marketing-phone-screen')).filter(Boolean);
    const measure = () => {
        for (const screen of screens) {
            const scale = Math.min(screen.clientWidth / 402, screen.clientHeight / 874);
            if (!(scale > 0)) continue;
            screen.style.setProperty('--phone-scale', String(scale));
            screen.dataset.sizeReady = 'true';
        }
    };
    const available = frame => {
        const handoff = frame.closest('[data-hero-handoff]');
        return !handoff || handoff.dataset.ready === 'true';
    };
    const activeFrame = frame => {
        const handoff = frame.closest('[data-hero-handoff]');
        return !document.hidden && visible.get(frame) === true && available(frame) && (!handoff?.inert || handoff.dataset.renderActive === 'true');
    };
    const stopTimer = frame => {
        view.clearTimeout(timers.get(frame));
        timers.delete(frame);
    };
    const fail = frame => {
        stopTimer(frame);
        frame.dataset.previewFailed = 'true';
    };
    const notify = frame => {
        const active = activeFrame(frame);
        activity.set(frame, active);
        if (active && frame.dataset.started && !frame.dataset.previewReady && !frame.dataset.previewFailed) {
            if (!timers.has(frame)) timers.set(frame, view.setTimeout(() => fail(frame), PREVIEW_TIMEOUT_MS));
        } else stopTimer(frame);
        frame.contentWindow?.postMessage({ type: 'reserve:service-preview:active', active }, '*');
        if (active && progress.has(frame)) {
            const value = progress.get(frame);
            frame.contentWindow?.postMessage({ type: 'reserve:service-preview:progress', progress: value }, '*');
            sent.set(frame, value);
        }
    };
    const load = frame => {
        if (activeFrame(frame) && !frame.dataset.started) {
            frame.dataset.started = 'true';
            // 명시적 가시성 검사 뒤에는 브라우저의 지연 로딩을 겹치지 않아요.
            frame.loading = 'eager';
            frame.src = frame.dataset.previewSrc;
        }
        notify(frame);
    };
    const loaded = event => notify(event.currentTarget);
    const ready = event => {
        const type = event.data?.type;
        if (event.origin !== 'null' || !['reserve:service-preview:ready', 'reserve:service-preview:painted', 'reserve:service-preview:unavailable'].includes(type)) return;
        const frame = frames.find(candidate => candidate.contentWindow === event.source);
        if (!frame) return;
        if (type === 'reserve:service-preview:unavailable') { fail(frame); return; }
        delete frame.dataset.previewFailed;
        frame.dataset.previewReady = 'true';
        if (type === 'reserve:service-preview:painted') frame.dataset.previewPainted = 'true';
        notify(frame);
        document.dispatchEvent(new view.Event('reserve:service-preview-ready'));
    };
    const retry = event => {
        const button = event.target.closest?.('[data-service-preview-retry]');
        const frame = button?.closest('.marketing-phone-content')?.querySelector('iframe[data-service-preview]');
        if (!frame?.dataset.previewFailed) return;
        delete frame.dataset.previewFailed;
        delete frame.dataset.started;
        load(frame);
    };
    const visibility = () => frames.forEach(load);
    const observer = typeof view.IntersectionObserver === 'function' ? new view.IntersectionObserver(entries => {
        for (const entry of entries) {
            visible.set(entry.target, entry.isIntersecting);
            load(entry.target);
        }
    }, { threshold: 0.01 }) : null;
    const checkVisibility = () => {
        const height = view.visualViewport?.height ?? view.innerHeight;
        for (const frame of frames) {
            const bounds = frame.getBoundingClientRect();
            const intersecting = bounds.height > 0 && bounds.top < height && bounds.bottom > 0;
            if (visible.get(frame) === intersecting) continue;
            visible.set(frame, intersecting);
            load(frame);
        }
    };
    const resize = () => {
        measure();
        if (!observer) checkVisibility();
    };
    const sizeObserver = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(measure) : null;
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('click', retry);
    view.addEventListener('message', ready);
    view.addEventListener('pageshow', visibility);
    view.addEventListener('resize', resize);
    if (!observer) view.addEventListener('scroll', checkVisibility, { passive: true });
    for (const frame of frames) {
        frame.addEventListener('load', loaded);
        observer?.observe(frame);
    }
    screens.forEach(screen => sizeObserver?.observe(screen));
    resize();
    return {
        progress: (scene, value) => {
            const frame = scene.querySelector('iframe[data-service-preview]');
            if (!frame || !Number.isFinite(value)) return;
            const next = Math.max(0, Math.min(1, value)), previous = sent.get(frame);
            progress.set(frame, next);
            if (activeFrame(frame)) {
                if (!frame.dataset.started) load(frame);
                else if (activity.get(frame) !== activeFrame(frame) || previous == null || Math.abs(previous - next) >= 0.004) notify(frame);
            }
        },
        dispose: () => {
            observer?.disconnect();
            sizeObserver?.disconnect();
            document.removeEventListener('visibilitychange', visibility);
            document.removeEventListener('click', retry);
            view.removeEventListener('message', ready);
            view.removeEventListener('pageshow', visibility);
            view.removeEventListener('resize', resize);
            view.removeEventListener('scroll', checkVisibility);
            for (const frame of frames) {
                stopTimer(frame);
                frame.removeEventListener('load', loaded);
            }
        },
    };
}
