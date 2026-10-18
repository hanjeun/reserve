import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Image } from 'antd';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LoadingAntImage from './LoadingAntImage';

const FIRST = '/api/v1/feed/media/101';
const SECOND = '/api/v1/feed/media/102';
const FALLBACK = '/api/v1/feed/media/103';
let observers;
let preflight;
let visibility;
const flush = async () => { await act(async () => {}); };
const enter = (observer = observers.at(-1)) => act(() => observer.callback([{ target: observer.node, isIntersecting: true }]));

beforeEach(() => {
    observers = [];
    visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
        observe(node) { this.node = node; }
        disconnect() {}
    });
    // 실제 rc-image의 detached img.src 설정을 포착한다. jsdom은 HTTP/S3를 읽지 않는다.
    const setter = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;
    preflight = vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function (value) {
        setter.call(this, value);
    });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('withholds protected sources from real AntD preflight until visible, preserving the full preview group', async () => {
    const view = render(<Image.PreviewGroup items={[FIRST, SECOND]}>
        <div className="reserve-feed-media-item"><LoadingAntImage src={FIRST} srcSet={`${FIRST} 1x`} fallback={FALLBACK}
            loading="lazy" alt="첫 사진" width="100%" height="100%" referrerPolicy="no-referrer" decoding="async"
            classNames={{ image: 'test-image', root: 'test-root' }} style={{ aspectRatio: 'auto', objectFit: 'cover' }} /></div>
        <div className="reserve-feed-media-item"><LoadingAntImage src={SECOND} loading="lazy" alt="둘째 사진" /></div>
    </Image.PreviewGroup>);
    await flush();
    expect(preflight).not.toHaveBeenCalled();
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.querySelector('.reserve-skeleton-block--local')).toBeInTheDocument();
    expect(view.container.querySelector('.reserve-feed-media-item > .ant-image')).toBeInTheDocument();
    expect(observers[0].options).toMatchObject({ root: null, rootMargin: '240px 0px' });
    enter(observers[0]);
    const first = await screen.findByAltText('첫 사진');
    expect(first).toHaveAttribute('src', FIRST);
    expect(first).toHaveAttribute('srcset', `${FIRST} 1x`);
    expect(first).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(first).toHaveAttribute('loading', 'lazy');
    expect(first).toHaveClass('test-image');
    expect(first).toHaveStyle({ aspectRatio: 'auto', objectFit: 'cover' });
    expect(preflight.mock.calls.some(([src]) => src === FIRST)).toBe(true);
    expect(preflight.mock.calls.some(([src]) => src === SECOND || src === FALLBACK)).toBe(false);
    expect(screen.queryByAltText('둘째 사진')).toBeNull();
    fireEvent.load(first);
    fireEvent.click(first);
    await waitFor(() => expect(document.querySelector('.ant-image-preview-img')).toHaveAttribute('src', FIRST));
    fireEvent.keyDown(window, { key: 'ArrowRight', keyCode: 39 });
    await waitFor(() => expect(document.querySelector('.ant-image-preview-img')).toHaveAttribute('src', SECOND));
});

it('rechecks a replaced source, including A to B to A, without a fallback request from an empty src', async () => {
    const view = render(<LoadingAntImage src={FIRST} loading="lazy" placeholder={false} fallback={FALLBACK} alt="사진" />);
    const firstObserver = observers[0];
    expect(view.container.querySelector('.reserve-skeleton-block--local')).toBeInTheDocument();
    expect(preflight).not.toHaveBeenCalled();
    enter();
    await screen.findByAltText('사진');
    await flush();
    const count = preflight.mock.calls.length;
    view.rerender(<LoadingAntImage src={SECOND} loading="lazy" placeholder={false} fallback={FALLBACK} alt="사진" />);
    const secondObserver = observers.at(-1);
    enter(firstObserver);
    await flush();
    expect(view.container.querySelector('img')).toBeNull();
    expect(preflight).toHaveBeenCalledTimes(count);
    view.rerender(<LoadingAntImage src={FIRST} loading="lazy" placeholder={false} fallback={FALLBACK} alt="사진" />);
    enter(secondObserver);
    await flush();
    expect(view.container.querySelector('img')).toBeNull();
    expect(preflight).toHaveBeenCalledTimes(count);
    enter();
    expect(await screen.findByAltText('사진')).toHaveAttribute('src', FIRST);
    expect(preflight.mock.calls.some(([src]) => src === SECOND || src === FALLBACK)).toBe(false);
});

it('checks actual horizontal clipping without IO and does not admit sources in a hidden tab', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', undefined);
    let left = 600;
    const rect = (x, width) => ({ top: 0, bottom: 200, left: x, right: x + width, width, height: 200 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        return this.className?.includes?.('reserve-lazy-image-') ? rect(left, 100) : rect(0, 300);
    });
    const view = render(<div style={{ overflowX: 'auto' }}><LoadingAntImage src={FIRST} loading="lazy" alt="사진" /></div>);
    await flush();
    expect(preflight).not.toHaveBeenCalled();
    left = 100;
    visibility.mockReturnValue('hidden');
    fireEvent.scroll(view.container.firstChild);
    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(preflight).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    await flush();
    expect(screen.getByAltText('사진')).toHaveAttribute('src', FIRST);
    expect(preflight.mock.calls.some(([src]) => src === FIRST)).toBe(true);
});

it.each([undefined, 'eager'])('keeps original eager source, geometry and preview behavior for loading=%s', async loading => {
    const view = render(<LoadingAntImage src={FIRST} loading={loading} alt="사진" imageSize={{ width: 600, height: 800 }}
        style={{ height: '360px', objectFit: 'contain' }} rootClassName="original-root" referrerPolicy="no-referrer" />);
    await flush();
    expect(observers).toHaveLength(0);
    expect(screen.getByAltText('사진')).toHaveAttribute('src', FIRST);
    expect(screen.getByAltText('사진')).toHaveStyle({ aspectRatio: 'auto 600 / 800', height: '360px', objectFit: 'contain' });
    expect(screen.getByRole('button', { name: '사진' })).toHaveClass('original-root');
    expect(view.container.querySelector('[class*="reserve-lazy-image-"]')).toBeNull();
    expect(preflight.mock.calls.some(([src]) => src === FIRST)).toBe(true);
});

it('ignores a detached observer after unmount', async () => {
    const view = render(<LoadingAntImage src={FIRST} loading="lazy" alt="사진" />);
    const observer = observers[0];
    view.unmount();
    enter(observer);
    await flush();
    expect(preflight).not.toHaveBeenCalled();
});
