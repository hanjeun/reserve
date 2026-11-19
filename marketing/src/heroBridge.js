// 재생 중 스크롤로 탐색하지 않고 첫 장면으로 돌아올 때만 되감아요.
export function createHeroPlayback(media, changed) {
    const view = media.ownerDocument.defaultView;
    let visible = false, started = false, finished = false, failed = false, pending = false, disposed = false, timer, generation = 0;
    const clear = () => { view.clearTimeout(timer); timer = undefined; };
    const fail = () => { if (disposed) return; failed = true; clear(); media.pause(); changed(); };
    const watch = () => { clear(); if (visible && !finished && !failed) timer = view.setTimeout(fail, 8000); };
    const ended = () => { if (started) { finished = true; clear(); changed(); } };
    const playing = () => { watch(); changed(); };
    media.addEventListener('ended', ended);
    media.addEventListener('playing', playing);
    media.addEventListener('timeupdate', watch);
    media.addEventListener('error', fail);
    const setVisible = next => {
        if (disposed) return;
        if (!next) {
            if (visible) { visible = false; pending = false; generation++; clear(); media.pause(); }
            return;
        }
        visible = true;
        if (finished || failed || pending || !media.paused) return;
        const request = ++generation;
        started = true; pending = true; watch();
        try {
            Promise.resolve(media.play()).then(() => {
                if (request === generation && !disposed) pending = false;
            }, () => { if (request === generation && visible && !disposed) fail(); });
        } catch { fail(); }
    };
    return {
        get finished() { return finished; },
        get failed() { return failed; },
        get state() { return failed ? 'unavailable' : finished ? 'ended' : visible ? 'playing' : 'paused'; },
        setVisible,
        reset: () => {
            if (disposed) return;
            setVisible(false);
            if (!started) return;
            started = false; finished = false;
            if (media.currentTime > 0) media.currentTime = 0;
        },
        dispose: () => {
            disposed = true; generation++; clear(); media.pause();
            media.removeEventListener('ended', ended);
            media.removeEventListener('playing', playing);
            media.removeEventListener('timeupdate', watch);
            media.removeEventListener('error', fail);
        },
    };
}

// 영상 마지막 기기의 사각형과 웹 기기의 시작 사각형을 같은 좌표로 맞춰요.
export function placeHeroHandoff(scene, progress) {
    const phone = scene.querySelector('.marketing-phone'), video = scene.querySelector('[data-hero-video]');
    if (!phone || !video) return;
    if (progress >= 1) { phone.style.removeProperty('transform'); return; }
    const view = scene.ownerDocument.defaultView, profile = JSON.parse(scene.dataset.heroFrame);
    const bounds = video.getBoundingClientRect(), origin = phone.closest('.marketing-device').getBoundingClientRect();
    const css = view.getComputedStyle(phone), width = parseFloat(css.width), height = parseFloat(css.height);
    if (!(width > 0 && height > 0 && bounds.width > 0 && bounds.height > 0)) return;
    const scale = Math.min(bounds.width / profile.width, bounds.height / profile.height);
    const [x, y, w, h] = profile.frame, rest = 1 - progress;
    const left = bounds.left + (bounds.width - profile.width * scale) / 2 + x * scale - origin.left;
    const top = bounds.top + (bounds.height - profile.height * scale) / 2 + y * scale - origin.top;
    phone.style.transform = 'matrix(' + [1 + (w * scale / width - 1) * rest, 0, 0, 1 + (h * scale / height - 1) * rest, left * rest, top * rest].join(',') + ')';
}
