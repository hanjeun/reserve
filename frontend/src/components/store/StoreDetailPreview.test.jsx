import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StoreDetailPreview from './StoreDetailPreview';

vi.mock('../../pages/store/StoreDetail', () => ({
    StoreDetailPCLayout: () => <div>PC 상세 화면<button type="button">상세 도구</button></div>,
    StoreDetailMobileLayout: () => <div>모바일 상세 화면<button type="button">상세 도구</button></div>,
}));
vi.mock('../layout/Header', () => ({ default: () => <header>RESERVE</header> }));

afterEach(() => vi.restoreAllMocks());

function openPreview(device, width, touch) {
    const matchMedia = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...matchMedia(query), matches: query === '(pointer: coarse)' && touch }));
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
    const onDeviceChange = vi.fn();
    const renderPreview = value => <StoreDetailPreview device={value} store={{ name: '예시 가게' }} onDeviceChange={onDeviceChange}
        infoContent={<button type="button">수정</button>} />;
    const view = render(renderPreview(device));
    const frame = screen.getByTitle(`${device === 'pc' ? 'PC' : '모바일'} 가게 상세 미리보기`);
    fireEvent.load(frame);
    const frameDocument = frame.contentDocument;
    const root = frameDocument.documentElement;
    root.scrollTo = ({ top }) => { root.scrollTop = top; };
    Object.defineProperty(frameDocument, 'scrollingElement', { value: root });
    return { view, frame, frameDocument, onDeviceChange, renderPreview, host: frame.closest('[data-zoomed]') };
}

function point(target, type, timeStamp, { clientX = 120, clientY = 200, pointerType = 'touch', pointerId = 1, isPrimary = true } = {}) {
    const event = new target.ownerDocument.defaultView.Event(type, { bubbles: true, cancelable: true });
    Object.entries({ timeStamp, clientX, clientY, pointerType, pointerId, isPrimary }).forEach(([key, value]) => {
        Object.defineProperty(event, key, { value });
    });
    fireEvent(target, event);
}

function tap(target, time, options) {
    point(target, 'pointerdown', time, options);
    point(target, 'pointerup', time + 30, options);
}

it('uses the available desktop width and keeps the same iframe when switching to the iPhone', () => {
    const { view, frame, frameDocument, onDeviceChange, renderPreview, host } = openPreview('pc', 1000, false);
    expect(frame).toHaveAttribute('width', '1000');
    expect(host).not.toHaveAttribute('aria-keyshortcuts');
    expect(screen.queryByRole('button', { name: /확대|화면 맞춤/ })).not.toBeInTheDocument();
    tap(frameDocument.body, 0);
    tap(frameDocument.body, 120);
    expect(host).toHaveAttribute('data-zoomed', 'false');

    fireEvent.click(screen.getByRole('radio', { name: '모바일' }));
    expect(onDeviceChange).toHaveBeenCalledWith('mobile');
    view.rerender(renderPreview('mobile'));
    expect(screen.getByTitle('모바일 가게 상세 미리보기')).toBe(frame);
    expect(frame).toHaveAttribute('width', '402');
    expect(frame).toHaveAttribute('height', '780');
    expect(frameDocument.documentElement).toHaveAttribute('data-store-preview-device', 'mobile');
    expect(view.container.querySelector('.reserve-onboarding-phone-hardware')).toHaveAttribute('width', '450');
    expect(view.container.querySelector('.reserve-onboarding-preview-stage')).toHaveStyle({ width: '312px' });
    expect(frameDocument.body.querySelector('[inert] header')).toHaveTextContent('RESERVE');
    expect(frameDocument.body).not.toHaveTextContent('수정');
    fireEvent.click(screen.getByText('가게 설정 수정'));
    expect(screen.getByRole('button', { name: '수정', exact: true })).toBeVisible();
});

it.each(['mobile', 'pc'])('zooms a touch preview in both directions around the tapped content (%s)', device => {
    const { frameDocument, host } = openPreview(device, 360, true);
    const initialScroll = 100;
    frameDocument.scrollingElement.scrollTop = initialScroll;
    tap(frameDocument.body, 0);
    expect(host).toHaveAttribute('data-zoomed', 'false');
    tap(frameDocument.body, 120);
    expect(host).toHaveAttribute('data-zoomed', 'true');
    const fitScale = 360 / (device === 'mobile' ? 450 : 900);
    expect(frameDocument.scrollingElement.scrollTop).toBeCloseTo(initialScroll + 200 * (1 - fitScale));

    const fittedPoint = { clientX: 120 * fitScale, clientY: 200 * fitScale };
    tap(frameDocument.body, 500, fittedPoint);
    tap(frameDocument.body, 620, fittedPoint);
    expect(host).toHaveAttribute('data-zoomed', 'false');
    expect(frameDocument.scrollingElement.scrollTop).toBeCloseTo(initialScroll);
});

it('leaves drags, multi-touch, mouse input and controls to the preview', () => {
    const { frameDocument, host } = openPreview('mobile', 360, true);
    const content = frameDocument.body;
    tap(content, 0);
    point(content, 'pointerdown', 90);
    point(content, 'pointermove', 100, { clientY: 240 });
    point(content, 'pointerup', 120, { clientY: 240 });
    tap(content, 140);
    point(content, 'pointerdown', 220);
    point(content, 'pointerdown', 240, { pointerId: 2, isPrimary: false });
    point(content, 'pointerup', 250);
    tap(content, 420, { pointerType: 'mouse' });
    tap(content, 540, { pointerType: 'mouse' });
    const button = content.querySelector('button');
    tap(button, 650);
    tap(button, 770);
    expect(host).toHaveAttribute('data-zoomed', 'false');

    act(() => host.focus());
    fireEvent.keyDown(host, { key: 'Enter' });
    expect(host).toHaveAttribute('data-zoomed', 'true');
});
