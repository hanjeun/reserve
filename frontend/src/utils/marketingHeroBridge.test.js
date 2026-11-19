import { afterEach, expect, it, vi } from 'vitest';
import { createHeroPlayback, placeHeroHandoff } from '../../../marketing/src/heroBridge';
import { installMarketingScenes } from '../../../marketing/src/scenes';
import { createPreviewPlayback } from '../../../marketing/service-preview/playback';
import { installServicePreviews } from '../../../marketing/src/servicePreviews';

const cleanups = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

function mediaElement(allowReset = false) {
    const media = document.createElement('video');
    let paused = true, currentTime = 3.5;
    Object.defineProperties(media, {
        paused: { get: () => paused },
        currentTime: { get: () => currentTime, set: value => {
            if (!allowReset || value !== 0) throw new Error('Playback must not seek');
            currentTime = value;
        } },
    });
    media.play = vi.fn(() => { paused = false; return Promise.resolve(); });
    media.pause = vi.fn(() => { paused = true; });
    return media;
}

it('재생 요청을 겹치지 않고 스크롤 중에도 영상 시각을 직접 바꾸지 않아요', async () => {
    const media = mediaElement(), player = createHeroPlayback(media, vi.fn());
    cleanups.push(player.dispose);
    player.setVisible(true); player.setVisible(true); await Promise.resolve(); player.setVisible(true);
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(media.currentTime).toBe(3.5); expect(player.finished).toBe(false);
});

it('숨긴 영상은 쉬고 돌아오면 이어 재생하되 끝난 영상은 반복하지 않아요', async () => {
    const media = mediaElement(), player = createHeroPlayback(media, vi.fn());
    cleanups.push(player.dispose);
    player.setVisible(true); await Promise.resolve(); player.setVisible(false);
    expect(media.pause).toHaveBeenCalledTimes(1);
    player.setVisible(true); await Promise.resolve();
    expect(media.play).toHaveBeenCalledTimes(2);
    media.dispatchEvent(new Event('ended'));
    player.setVisible(false); player.setVisible(true);
    expect(player.finished).toBe(true); expect(media.play).toHaveBeenCalledTimes(2);
});

it('자동 재생 거절은 정적 화면으로 전환하고 재생 요청을 반복하지 않아요', async () => {
    const media = mediaElement(); media.play.mockRejectedValue(new Error('NotAllowed'));
    const changed = vi.fn(), player = createHeroPlayback(media, changed); cleanups.push(player.dispose);
    player.setVisible(true); await Promise.resolve(); player.setVisible(true);
    expect(player.failed).toBe(true); expect(changed).toHaveBeenCalledTimes(1);
    expect(media.play).toHaveBeenCalledTimes(1);
});

it('오래 멈춘 영상과 종료한 재생기는 대기나 타이머를 남기지 않아요', () => {
    vi.useFakeTimers();
    const media = mediaElement(), player = createHeroPlayback(media, vi.fn());
    player.setVisible(true); vi.advanceTimersByTime(7000);
    media.dispatchEvent(new Event('timeupdate')); vi.advanceTimersByTime(7000);
    expect(player.failed).toBe(false);
    vi.advanceTimersByTime(1000); expect(player.failed).toBe(true);
    player.dispose(); expect(vi.getTimerCount()).toBe(0);
});

it.each([
    { width: 1088, height: 720, frame: [400, 40, 310, 310 * 920 / 450] },
    { width: 720, height: 1200, frame: [135, 150, 450, 920] },
])('영상 마지막 기기와 웹 기기의 시작 영역이 정확히 같아요 ($width)', profile => {
    document.body.innerHTML = '<section><video data-hero-video></video><figure class="marketing-device"><div class="marketing-phone" style="width:300px;height:614px"></div></figure></section>';
    const scene = document.querySelector('section'); scene.dataset.heroFrame = JSON.stringify(profile);
    scene.querySelector('video').getBoundingClientRect = () => ({ left: 40, top: 64, width: profile.width, height: profile.height });
    scene.querySelector('figure').getBoundingClientRect = () => ({ left: 100, top: 100 });
    placeHeroHandoff(scene, 0);
    const phone = scene.querySelector('.marketing-phone');
    const [sx, , , sy, x, y] = phone.style.transform.slice(7, -1).split(',').map(Number);
    expect(x + 100).toBeCloseTo(profile.frame[0] + 40);
    expect(y + 100).toBeCloseTo(profile.frame[1] + 64);
    expect(sx * 300).toBeCloseTo(profile.frame[2]); expect(sy * 614).toBeCloseTo(profile.frame[3]);
    placeHeroHandoff(scene, 1); expect(phone.style.transform).toBe('');
});

function heroStory() {
    document.body.innerHTML = '<header class="marketing-header"></header><section class="marketing-scene" data-hero-story>'
        + '<div class="marketing-hero-content"></div><div data-hero-handoff inert><div data-scene-index><figure class="marketing-device">'
        + '<div class="marketing-phone" style="width:300px;height:614px"><iframe></iframe></div></figure></div></div></section>';
    const scene = document.querySelector('section'), media = mediaElement(true), idle = mediaElement();
    media.dataset.heroVideo = ''; idle.dataset.heroIdle = ''; scene.append(idle, media);
    scene.dataset.heroFrame = JSON.stringify({ width: 1088, height: 720, frame: [400, 40, 310, 310 * 920 / 450] });
    const available = window.innerHeight - 64;
    scene.getClientRects = () => [{}];
    let phase = 0;
    scene.getBoundingClientRect = () => ({ top: 64 - available * phase, bottom: 64 + available * (2 - phase), height: available * 2 });
    document.querySelector('header').getBoundingClientRect = () => ({ height: 64 });
    media.getBoundingClientRect = () => ({ left: 0, top: 64, width: 1088, height: 720 });
    scene.querySelector('figure').getBoundingClientRect = () => ({ left: 100, top: 100 });
    let now = 0, next = 0; const frames = new Map();
    vi.spyOn(window.performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++next, callback); return next; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id));
    const step = (elapsed = 50) => { now += elapsed; const work = [...frames.values()]; frames.clear(); work.forEach(callback => callback(now)); };
    const scroll = value => { phase = value; window.dispatchEvent(new Event('scroll')); step(); };
    cleanups.push(installMarketingScenes(document, Object.assign(new EventTarget(), { matches: false })));
    const handoff = scene.querySelector('[data-hero-handoff]'), iframe = scene.querySelector('iframe');
    return { scene, media, idle, handoff, iframe, step, scroll };
}

it('대기 영상만 반복하고 스크롤 후 종료·그리기를 기다리며 위로 돌아오면 같은 체험을 보존해요', () => {
    const { scene, media, idle, handoff, iframe, step, scroll } = heroStory();
    step(); expect(handoff.dataset.ready).toBe('false');
    expect(scene.dataset.playbackState).toBe('idle');
    expect(idle.play).toHaveBeenCalledTimes(1);
    expect(media.play).not.toHaveBeenCalled();
    scroll(.99);
    expect(handoff.dataset.ready).toBe('true'); expect(handoff.inert).toBe(true);
    expect(idle.pause).toHaveBeenCalledTimes(1); expect(media.play).toHaveBeenCalledTimes(1);
    expect(scene.style.getPropertyValue('--hero-film-opacity')).toBe('1.0000');
    media.dispatchEvent(new Event('ended')); step();
    expect(handoff.dataset.ready).toBe('true'); expect(handoff.inert).toBe(true);
    iframe.dataset.previewReady = 'true';
    document.dispatchEvent(new Event('reserve:service-preview-ready')); step();
    expect(scene.style.getPropertyValue('--hero-film-opacity')).toBe('1.0000');
    iframe.dataset.previewPainted = 'true';
    document.dispatchEvent(new Event('reserve:service-preview-ready')); step();
    expect(scene.style.getPropertyValue('--hero-handoff')).toBe('0.0000');
    for (let i = 0; i < 16; i++) step();
    expect(scene.style.getPropertyValue('--hero-film-opacity')).toBe('0.0000');
    expect(handoff.inert).toBe(false); expect(handoff.dataset.present).toBe('true');
    expect(scene.querySelectorAll('iframe')).toHaveLength(1); expect(media.play).toHaveBeenCalledTimes(1);
    scroll(0);
    expect(scene.dataset.playbackState).toBe('idle');
    expect(scene.style.getPropertyValue('--hero-reveal-opacity')).toBe('0');
    expect(scene.style.getPropertyValue('--hero-film-opacity')).toBe('1.0000');
    expect(media.currentTime).toBe(0); expect(handoff.inert).toBe(true);
    expect(idle.play).toHaveBeenCalledTimes(2);
    media.dispatchEvent(new Event('ended'));
    scroll(.99);
    expect(media.play).toHaveBeenCalledTimes(2);
    expect(handoff.inert).toBe(true); expect(scene.querySelector('iframe')).toBe(iframe);
    expect(iframe.dataset.previewPainted).toBe('true');
});

it('체험 준비가 지연돼도 마지막 영상에 갇히지 않고 위로 돌아오면 인물 장면을 열어요', () => {
    const { scene, media, handoff, step, scroll } = heroStory();
    scroll(.99);
    media.dispatchEvent(new Event('ended')); step();
    expect(scene.dataset.playbackState).toBe('preparing');
    window.dispatchEvent(new Event('scroll')); step(12_100);
    expect(handoff.inert).toBe(false);
    expect(scene.dataset.playbackState).toBe('unavailable');
    expect(scene.style.getPropertyValue('--hero-film-opacity')).toBe('0.0000');
    scroll(0);
    expect(scene.dataset.playbackState).toBe('idle');
    expect(handoff.inert).toBe(true);
});

it('레이아웃 전환으로 감춰진 대기 영상은 멈춰요', () => {
    const { scene, idle, media, step } = heroStory();
    step();
    expect(idle.play).toHaveBeenCalledTimes(1);
    scene.getClientRects = () => [];
    window.dispatchEvent(new Event('resize')); step();
    expect(idle.pause).toHaveBeenCalledTimes(1);
    expect(media.play).not.toHaveBeenCalled();
});

it('시연 문서가 보낸 준비 신호가 도착해야 골격을 내리고 예약 장면은 그리기 신호를 기다려요', () => {
    document.body.innerHTML = '<div data-hero-handoff data-ready="true"><iframe data-service-preview="booking" data-preview-src="/service-preview/index.html?scene=booking"></iframe></div>';
    const iframe = document.querySelector('iframe'), previews = installServicePreviews(document); cleanups.push(previews.dispose);
    const send = (origin, source, stage) => window.dispatchEvent(new MessageEvent('message', {
        origin, source, data: { type: `reserve:service-preview:${stage}` },
    }));
    iframe.dispatchEvent(new Event('load'));
    send('https://other.invalid', iframe.contentWindow, 'ready');
    send('null', window, 'painted');
    expect(iframe.dataset.previewReady).toBeUndefined();
    send('null', iframe.contentWindow, 'ready');
    expect(iframe.dataset.previewReady).toBe('true');
    expect(iframe.dataset.previewPainted).toBeUndefined();
    send('null', iframe.contentWindow, 'painted');
    expect(iframe.dataset.previewPainted).toBe('true');
});

it('글꼴과 예약 폼의 시작 위치를 맞춘 뒤에만 실제 그리기 신호를 보내요', async () => {
    document.body.innerHTML = '<div id="root"><section class="reserve-store-action-panel"><form></form></section></div>';
    let resolveFonts, position = 0, next = 0; const frames = new Map();
    const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise(resolve => { resolveFonts = resolve; }) } });
    cleanups.push(() => { if (previousFonts) Object.defineProperty(document, 'fonts', previousFonts); else delete document.fonts; });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });
    cleanups.push(() => { delete document.documentElement.scrollHeight; });
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => position);
    vi.spyOn(window, 'scrollTo').mockImplementation(({ top }) => { position = top; });
    document.querySelector('section').getBoundingClientRect = () => ({ top: 300 - position });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++next, callback); return next; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id));
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const run = () => { const work = [...frames.values()]; frames.clear(); work.forEach(callback => callback(0)); };
    const playback = createPreviewPlayback(window, { scene: 'booking', transport: {}, client: {}, setQrOpen: vi.fn() }); cleanups.push(playback.dispose);
    playback.setActive(true); run();
    expect(position).toBe(100); expect(post).not.toHaveBeenCalled();
    resolveFonts(); await Promise.resolve(); run(); run(); run();
    expect(post).toHaveBeenCalledExactlyOnceWith({ type: 'reserve:service-preview:painted' }, new URL(document.baseURI).origin);
});
