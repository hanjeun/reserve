import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import LoadingUpload from './LoadingUpload';

it('renders a freshly selected picture from its local file and keeps the upload callbacks', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:upload-photo');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const onPreview = vi.fn();
    const onRemove = vi.fn();
    const file = new File(['photo'], 'landscape.png', { type: 'image/png' });
    const { unmount } = render(<LoadingUpload listType="picture-card" beforeUpload={() => false}
        aria-label="사진 선택" onPreview={onPreview} onRemove={onRemove}><span>업로드</span></LoadingUpload>);

    try {
        fireEvent.change(screen.getByLabelText('사진 선택'), { target: { files: [file] } });
        const image = await screen.findByRole('img', { name: file.name });
        expect(image).toHaveAttribute('src', 'blob:upload-photo');
        expect(create).toHaveBeenCalledExactlyOnceWith(file);
        expect(image.closest('.ant-upload-list-item')).toBeNull();
        const thumbnail = image.closest('.reserve-photo-upload-thumbnail');
        Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 600 } });
        fireEvent.load(image);
        expect(thumbnail.style.inlineSize).toBe('128px');
        expect(thumbnail.style.aspectRatio).toBe('2 / 1');
        const preview = screen.getByRole('button', { name: 'landscape.png 미리보기' });
        const remove = screen.getByRole('button', { name: 'landscape.png 삭제' });
        expect([...thumbnail.querySelector('.reserve-photo-actions').children]).toEqual([preview, remove]);
        const swipe = (button, x, y) => {
            const start = [{ identifier: 1, clientX: 42, clientY: 20 }];
            const end = [{ identifier: 1, clientX: x, clientY: y }];
            fireEvent.touchStart(button, { touches: start, changedTouches: start });
            expect(fireEvent.touchMove(button, { touches: end, changedTouches: end })).toBe(true);
            fireEvent.touchEnd(button, { touches: [], changedTouches: end });
            expect(fireEvent.click(button, { detail: 1 })).toBe(false);
        };
        swipe(preview, 18, 20);
        swipe(remove, 42, 80);
        expect(onPreview).not.toHaveBeenCalled();
        expect(onRemove).not.toHaveBeenCalled();

        const point = [{ identifier: 2, clientX: 22, clientY: 20 }];
        fireEvent.touchStart(preview, { touches: point, changedTouches: point });
        fireEvent.touchEnd(preview, { touches: [], changedTouches: point });
        fireEvent.click(preview, { detail: 1 });
        expect(onPreview).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ originFileObj: file }));
        fireEvent.touchStart(remove, { touches: point, changedTouches: point });
        fireEvent.touchCancel(remove, { touches: [], changedTouches: point });
        expect(fireEvent.click(remove, { detail: 1 })).toBe(false);
        expect(onRemove).not.toHaveBeenCalled();
        fireEvent.click(remove, { detail: 0 });
        await waitFor(() => expect(onRemove).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ originFileObj: file })));
        await waitFor(() => expect(thumbnail).toHaveAttribute('inert'));
        expect(revoke).not.toHaveBeenCalled();
        await waitFor(() => expect(image).not.toBeInTheDocument(), { timeout: 3000 });
        expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:upload-photo');
    } finally {
        unmount();
        create.mockRestore();
        revoke.mockRestore();
    }
});

it.each([
    { width: 900, height: 1200, ratio: '0.75 / 1' },
    { width: 1206, height: 2622, ratio: '1 / 1' },
    { width: 2400, height: 300, ratio: '1 / 1' },
])('fits a $width × $height photo around the two tools using ratio $ratio', ({ width, height, ratio }) => {
    const file = { uid: 'existing', name: 'photo.png', status: 'done',
        url: 'https://example.test/original.png', thumbUrl: 'https://example.test/thumbnail.png' };
    const onPreview = vi.fn();
    render(<LoadingUpload listType="picture-card" fileList={[file]} onPreview={onPreview} />);
    const image = screen.getByRole('img', { name: file.name });
    Object.defineProperties(image, { naturalWidth: { value: width }, naturalHeight: { value: height } });
    fireEvent.load(image);

    const thumbnail = image.closest('.reserve-photo-upload-thumbnail');
    expect(thumbnail.style.inlineSize).toBe('88px');
    expect(thumbnail.style.aspectRatio).toBe(ratio);
    expect(image).toHaveAttribute('src', file.thumbUrl);
    fireEvent.click(screen.getByRole('button', { name: 'photo.png 미리보기' }));
    expect(onPreview).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: file.url }));
});

it('collapses the same upload trigger at capacity and reopens it after a photo is removed', () => {
    const first = { uid: '1', name: 'first.jpg', status: 'done', url: 'https://example.test/1.jpg' };
    const second = { uid: '2', name: 'second.jpg', status: 'done', url: 'https://example.test/2.jpg' };
    const upload = fileList => <LoadingUpload id="photos" aria-label="사진 선택" listType="picture-card"
        fileList={fileList} maxCount={2} showTrigger={fileList.length < 2}>
        <span>업로드</span>
    </LoadingUpload>;
    const { rerender } = render(upload([first]));
    const picker = screen.getByLabelText('사진 선택');
    const button = screen.getByRole('button', { name: '업로드' });
    const trigger = button.closest('.ant-upload-select');
    const wrapper = trigger.closest('.reserve-picture-upload');
    const click = vi.spyOn(picker, 'click').mockImplementation(() => {});
    try {
        fireEvent.keyDown(button, { key: 'Enter' });
        expect(click).toHaveBeenCalledTimes(1);
        expect(picker).toHaveAttribute('id', 'photos');

        rerender(upload([first, second]));
        expect(wrapper.querySelector('.ant-upload-select')).toBe(trigger);
        expect(wrapper).toHaveClass('reserve-picture-upload--trigger-hidden');
        expect(screen.getByText('업로드').closest('[inert]')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '업로드' })).toBeNull();
        expect(picker).not.toHaveAttribute('id');
        expect(screen.getByRole('button', { name: 'second.jpg 삭제' })).toBeEnabled();
        fireEvent.click(button);
        expect(click).toHaveBeenCalledTimes(1);

        rerender(upload([first]));
        expect(screen.getByRole('button', { name: '업로드' })).toBe(button);
        expect(wrapper).not.toHaveClass('reserve-picture-upload--trigger-hidden');
        expect(trigger.querySelector('[inert]')).toBeNull();
        expect(picker).toHaveAttribute('id', 'photos');
        fireEvent.click(button);
        expect(click).toHaveBeenCalledTimes(2);
    } finally {
        click.mockRestore();
    }
});
