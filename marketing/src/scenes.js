import { createHeroPlayback, placeHeroHandoff } from './heroBridge';

const clamp = value => Math.max(0, Math.min(1, value));
const ease = (from, to, value) => { const t = clamp((value - from) / (to - from)); return t * t * (3 - 2 * t); };

export function installMarketingScenes(document, motion, onProgress = () => {}) {
    const view = document.defaultView;
    const scenes = [...document.querySelectorAll('.marketing-scene')];
    const navigation = [...document.querySelectorAll('[data-marketing-scene-nav]')];
    const videos = [...document.querySelectorAll('[data-hero-idle], [data-hero-video]')];
    const players = new Map(), transitions = new Map();
    const setInteractive = (element, enabled) => {
        if (!element) return;
        const changed = element.inert === enabled;
        element.inert = !enabled;
        element.setAttribute('aria-hidden', String(!enabled));
        if (changed) element.dispatchEvent(new view.Event('reserve:marketing-stage-change', { bubbles: true }));
    };
    let frame;
    const update = () => {
        frame = undefined;
        const now = view.performance.now();
        const header = document.querySelector('.marketing-header')?.getBoundingClientRect().height ?? 64;
        const viewportHeight = view.visualViewport?.scale === 1 ? view.visualViewport.height : view.innerHeight;
        const available = Math.max(1, viewportHeight - header);
        let current, centerMatch, heroTarget, closest = Infinity;
        for (const scene of scenes) {
            if (!scene.getClientRects().length) {
                for (const video of scene.querySelectorAll('[data-hero-idle], [data-hero-video]')) players.get(video)?.setVisible(false);
                const transition = transitions.get(scene);
                if (transition) {
                    view.clearTimeout(transition.timer);
                    transition.waiting = transition.timer = undefined;
                    transition.started = false;
                }
                continue;
            }
            const bounds = scene.getBoundingClientRect();
            const progress = motion.matches ? 0.5 : Math.max(0, Math.min(1, (available - (bounds.top - header)) / (available + bounds.height)));
            scene.style.setProperty('--scene-progress', progress.toFixed(4));
            const distance = Math.abs(bounds.top + bounds.height / 2 - header - available / 2);
            if (distance < closest) { closest = distance; current = scene; }
            if (bounds.top <= header + available / 2 && bounds.bottom > header + available / 2) centerMatch = scene;
            if (scene.hasAttribute('data-hero-story')) {
                const phase = clamp((header - bounds.top) / Math.max(1, bounds.height - available));
                const phone = scene.querySelector('[data-hero-handoff]');
                const prepared = phone?.querySelector('iframe')?.dataset.previewPainted === 'true';
                const player = players.get(scene.querySelector('[data-hero-video]'));
                const idle = players.get(scene.querySelector('[data-hero-idle]'));
                const staticStory = motion.matches;
                const visible = !document.hidden && bounds.bottom > header && bounds.top < view.innerHeight;
                const requested = !staticStory && phase >= 0.5;
                if (requested) player?.setVisible(visible);
                else player?.reset();
                idle?.setVisible(visible && !staticStory && !requested);
                const transition = transitions.get(scene) || { value: 0, last: now, started: false };
                transitions.set(scene, transition);
                if (!requested) transition.value = 0;
                if (requested && player?.finished && !prepared && visible) {
                    if (transition.waiting == null) {
                        transition.waiting = now;
                        transition.timer = view.setTimeout(schedule, 12_050);
                    }
                } else {
                    view.clearTimeout(transition.timer);
                    transition.waiting = transition.timer = undefined;
                }
                const timedOut = transition.waiting != null && now - transition.waiting >= 12_000;
                const fallback = staticStory || requested && (!player || player.failed || timedOut);
                if (fallback) transition.value = 1;
                if (!fallback && requested && player?.finished && prepared && visible) {
                    if (transition.started) transition.value = Math.min(1, transition.value + Math.min(50, now - transition.last) / 650);
                    else transition.started = true;
                    if (transition.value < 1) schedule();
                } else transition.started = false;
                transition.last = now;
                const value = transition.value;
                const fade = ease(0, .25, value), pose = ease(.25, 1, value);
                scene.style.setProperty('--hero-handoff', fade.toFixed(4));
                scene.style.setProperty('--hero-film-opacity', (1 - fade).toFixed(4));
                scene.style.setProperty('--hero-reveal-opacity', requested && !fallback ? '1' : '0');
                scene.dataset.playbackState = fallback ? 'unavailable' : !requested ? 'idle'
                    : player.finished ? value >= 1 ? 'ready' : prepared ? 'transition' : 'preparing' : player.state;
                const copyOpacity = staticStory ? 1 : 1 - ease(0.24, 0.42, phase);
                scene.style.setProperty('--hero-copy-opacity', copyOpacity.toFixed(4));
                const revealed = fallback || requested && prepared && value >= 1;
                if (phone) {
                    phone.dataset.ready = String(staticStory || requested);
                    phone.dataset.renderActive = String(staticStory || requested);
                    phone.dataset.present = String(revealed);
                    setInteractive(phone, revealed);
                    if (phase >= 0.94 && revealed) heroTarget = phone.querySelector('[data-scene-index]');
                }
                const copy = scene.querySelector('.marketing-hero-content');
                setInteractive(copy, copyOpacity > 0.01);
                const arrow = scene.querySelector('.bounce-arrow');
                setInteractive(arrow, copyOpacity > 0.01);
                placeHeroHandoff(scene, pose);
                onProgress(scene, 0);
            } else {
                onProgress(scene, progress);
            }
        }
        current = centerMatch || current;
        if (current?.hasAttribute('data-hero-story') && heroTarget) current = heroTarget;
        const footer = document.querySelector('footer')?.getBoundingClientRect();
        const footerActive = Boolean(footer && footer.top <= header + available / 2);
        for (const rail of navigation) {
            rail.toggleAttribute('data-footer-active', footerActive);
            for (const item of rail.querySelectorAll('[data-scroll-target], [data-scene-mark]')) {
                const active = (item.dataset.scrollTarget || item.dataset.sceneMark) === current?.id;
                item.toggleAttribute('data-current', active);
                if (item.tagName === 'BUTTON') { if (active) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current'); }
            }
        }
    };
    const schedule = () => { if (frame == null) frame = view.requestAnimationFrame(update); };
    const metadata = () => schedule();
    videos.forEach(video => {
        video.muted = true;
        players.set(video, createHeroPlayback(video, schedule));
        video.addEventListener('loadedmetadata', metadata);
    });
    view.addEventListener('scroll', schedule, { passive: true });
    view.addEventListener('resize', schedule);
    document.addEventListener('reserve:service-preview-ready', schedule);
    document.addEventListener('visibilitychange', schedule);
    motion.addEventListener('change', schedule);
    schedule();
    return () => {
        if (frame != null) view.cancelAnimationFrame(frame);
        view.removeEventListener('scroll', schedule);
        view.removeEventListener('resize', schedule);
        document.removeEventListener('reserve:service-preview-ready', schedule);
        document.removeEventListener('visibilitychange', schedule);
        motion.removeEventListener('change', schedule);
        players.forEach(player => player.dispose());
        transitions.forEach(transition => view.clearTimeout(transition.timer));
        videos.forEach(video => video.removeEventListener('loadedmetadata', metadata));
    };
}
