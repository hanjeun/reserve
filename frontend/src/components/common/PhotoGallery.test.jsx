import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { transitionEndName } from '@rc-component/motion/es/util/motion';
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

it('opens the gallery preview in the iframe and keeps its keyboard and focus in that document', async () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const frameDocument = iframe.contentDocument;
    const frameWindow = frameDocument.defaultView;
    Object.defineProperties(frameWindow, {
        innerWidth: { value: 402, configurable: true },
        innerHeight: { value: 780, configurable: true },
    });
    const finishMotion = dialog => fireEvent(dialog, new frameWindow.Event(transitionEndName));
    const view = render(<PhotoGallery label="합성 가게" sources={['/one.png', '/two.png']} previewDocument={frameDocument} />,
        { container: frameDocument.body });
    try {
        const inFrame = within(frameDocument.body);
        const trigger = inFrame.getByRole('button', { name: '합성 가게 사진 1 크게 보기' });
        expect(trigger.querySelector('.ant-image-cover')).toBeInTheDocument();
        const parentOrigin = document.documentElement.style.getPropertyValue('--reserve-store-preview-origin-x');
        fireEvent.click(trigger);
        const dialog = await inFrame.findByRole('dialog');
        expect(document.querySelector('.ant-image-preview')).toBeNull();
        expect(frameDocument.documentElement).toHaveAttribute('data-store-preview-photo-open');
        expect(frameDocument.body.style.getPropertyValue('--reserve-store-preview-origin-x')).toBe('0px');
        expect(document.documentElement.style.getPropertyValue('--reserve-store-preview-origin-x')).toBe(parentOrigin);
        await waitFor(() => expect(dialog.className).toMatch(/ant-image-preview-fade-(appear|enter)-active/));
        finishMotion(dialog);
        await waitFor(() => expect(frameDocument.activeElement).toBe(dialog));

        fireEvent.keyDown(dialog, { key: 'ArrowRight' });
        await waitFor(() => expect(dialog.querySelector('img')).toHaveAttribute('src', '/two.png'));
        const enlargedPhoto = dialog.querySelector('img');
        Object.defineProperties(enlargedPhoto, {
            width: { value: 200, configurable: true },
            height: { value: 160, configurable: true },
            offsetLeft: { value: 101, configurable: true },
            offsetTop: { value: 310, configurable: true },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'zoomIn' }));
        await waitFor(() => expect(enlargedPhoto.style.transform).toContain('translate3d(0px, 0px, 0) scale3d(1.5, 1.5, 1)'));
        fireEvent.mouseDown(enlargedPhoto, { button: 0, clientX: 130, clientY: 170 });
        fireEvent.mouseMove(frameWindow, { clientX: 155, clientY: 180 });
        await waitFor(() => expect(enlargedPhoto.style.transform).toContain('translate3d(25px, 10px, 0)'));
        fireEvent.mouseUp(frameWindow);

        fireEvent.keyDown(dialog, { key: 'Escape' });
        await waitFor(() => expect(dialog).toHaveClass('ant-image-preview-fade-leave-active'));
        finishMotion(dialog);
        await waitFor(() => {
            expect(frameDocument.documentElement).not.toHaveAttribute('data-store-preview-photo-open');
            expect(frameDocument.activeElement).toBe(trigger);
        });
    } finally {
        view.unmount();
        iframe.remove();
    }
});
