import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PhotoGallery from './PhotoGallery';

beforeEach(() => {
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
        constructor(type, options = {}) {
            super(type, options);
            Object.defineProperties(this, { pointerId: { value: options.pointerId ?? 1 }, isPrimary: { value: options.isPrimary ?? true } });
        }
    });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const renderGallery = props => render(<PhotoGallery label="합성 가게" sources={['/one.png','/two.png']} {...props} />);
const current = node => node.querySelector('.slick-active').getAttribute('data-index');
it('horizontal pointer swipe changes one photo while vertical scroll leaves the photo unchanged', async () => {
    const { container } = renderGallery();
    const gallery = container.querySelector('.reserve-store-gallery');
    fireEvent.pointerDown(gallery, { clientX: 150, clientY: 40, button: 0 });
    fireEvent.pointerMove(gallery, { clientX: 146, clientY: 145 });
    fireEvent.pointerUp(gallery, { clientX: 146, clientY: 145 });
    expect(current(container)).toBe('0');
    fireEvent.pointerDown(gallery, { clientX: 150, clientY: 40, button: 0 });
    fireEvent.pointerMove(gallery, { clientX: 50, clientY: 43 });
    fireEvent.pointerUp(gallery, { clientX: 50, clientY: 43 });
    await waitFor(() => expect(current(container)).toBe('1'));
});
it('hands focus out of the outgoing photo before its slide becomes hidden', async () => {
    const slideChanged = vi.fn();
    const { container } = renderGallery({ onSlideChange: slideChanged });
    await waitFor(() => expect(slideChanged).toHaveBeenCalledWith(0));
    const gallery = container.querySelector('.reserve-store-gallery');
    const photo = container.querySelector('.slick-active .ant-image');
    photo.tabIndex = 0;
    photo.focus();
    expect(document.activeElement).toBe(photo);
    fireEvent.click(container.querySelectorAll('.slick-dots button')[1]);
    expect(document.activeElement).toBe(gallery);
    await waitFor(() => expect(container.querySelector('.slick-slide[data-index="0"]').inert).toBe(true));
});
it('does not cancel a non-cancelable touchend event', () => {
    const { container } = renderGallery();
    const event = new Event('touchend', { bubbles: true, cancelable: false });
    Object.defineProperty(event, 'changedTouches', { value: [{ clientX: 0, clientY: 0 }] });
    const cancel = vi.spyOn(event, 'preventDefault');
    act(() => container.querySelector('.slick-list').dispatchEvent(event));
    expect(cancel).not.toHaveBeenCalled();
});
