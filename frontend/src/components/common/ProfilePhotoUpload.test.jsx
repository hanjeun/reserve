import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePhotoUpload from './ProfilePhotoUpload';

const LABEL = '프로필 사진';
const file = (name = 'profile.png', type = 'image/png') => new File(['image fixture'], name, { type });
const choose = files => fireEvent.change(screen.getByLabelText(LABEL), { target: { files } });
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

describe('shared profile photo selection boundary', () => {
    let send;
    let fetch;
    beforeEach(() => {
        // 업로더가 실행돼도 실제 요청은 차단한다.
        send = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => {});
        fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
    });
    afterEach(() => {
        expect(send).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
        vi.restoreAllMocks();
    });

    it('hides the add slot for a registered photo and restores it after owner removal', async () => {
        const onRemove = vi.fn();
        const onSelect = vi.fn();
        const view = render(<ProfilePhotoUpload src="/profile.png" onSelect={onSelect} onRemove={onRemove} />);
        expect(screen.queryByRole('button', { name: `${LABEL} 선택` })).toBeNull();
        expect(screen.getByTitle('Preview file')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Remove file' }));
        await waitFor(() => expect(onRemove).toHaveBeenCalledOnce());
        view.rerender(<ProfilePhotoUpload onSelect={onSelect} onRemove={onRemove} />);
        expect(screen.getByRole('button', { name: `${LABEL} 선택` })).toBeEnabled();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('blocks disabled removal without hiding the registered photo preview', () => {
        const onRemove = vi.fn();
        render(<ProfilePhotoUpload src="/profile.png" disabled onSelect={vi.fn()} onRemove={onRemove} />);
        const remove = screen.getByRole('button', { name: 'Remove file' });
        expect(remove).toBeDisabled();
        fireEvent.click(remove);
        expect(onRemove).not.toHaveBeenCalled();
        expect(screen.getByTitle('Preview file')).toBeInTheDocument();
    });

    it('opens the common photo viewer without navigating or removing the photo', async () => {
        const onRemove = vi.fn();
        render(<ProfilePhotoUpload src="/profile.png" onSelect={vi.fn()} onRemove={onRemove} />);

        expect(fireEvent.click(screen.getByTitle('Preview file'))).toBe(false);

        const viewer = await screen.findByRole('dialog');
        expect(viewer.querySelector('img')).toHaveAttribute('src', '/profile.png');
        expect(onRemove).not.toHaveBeenCalled();
    });

    it('opens file selection from its accessible button without submitting the surrounding form', () => {
        const onSelect = vi.fn();
        const onSubmit = vi.fn(event => event.preventDefault());
        render(<form onSubmit={onSubmit}><ProfilePhotoUpload onSelect={onSelect} /></form>);
        const input = screen.getByLabelText(LABEL);
        const openFileDialog = vi.spyOn(input, 'click').mockImplementation(() => {});
        const button = screen.getByRole('button', { name: `${LABEL} 선택` });
        expect(button).toHaveAttribute('type', 'button');

        fireEvent.click(button);

        expect(openFileDialog).toHaveBeenCalledOnce();
        expect(onSubmit).not.toHaveBeenCalled();
        expect(onSelect).not.toHaveBeenCalled();
    });

    it.each([
        ['notes.txt', 'text/plain'],
        ['photo.svg', 'image/svg+xml'],
        ['photo.png', 'text/plain'],
    ])('rejects unsupported or mismatched %s without passing it to the owner', async (name, type) => {
        const onSelect = vi.fn();
        render(<ProfilePhotoUpload onSelect={onSelect} />);

        choose([file(name, type)]);

        expect(await screen.findByRole('alert')).toHaveTextContent('JPG · PNG · WEBP · GIF 이미지만 업로드할 수 있어요.');
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('rejects over 5MiB and accepts the exact limit without uploading automatically', async () => {
        const onSelect = vi.fn().mockResolvedValue(undefined);
        render(<ProfilePhotoUpload onSelect={onSelect} />);
        const oversized = file('large.png');
        Object.defineProperty(oversized, 'size', { value: 5 * 1024 * 1024 + 1 });

        choose([oversized]);

        expect(await screen.findByRole('alert')).toHaveTextContent('파일 크기는 5MB 이하여야 해요.');
        expect(onSelect).not.toHaveBeenCalled();
        const exactLimit = file('limit.png');
        Object.defineProperty(exactLimit, 'size', { value: 5 * 1024 * 1024 });

        choose([exactLimit]);

        await waitFor(() => expect(onSelect).toHaveBeenCalledWith(exactLimit));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(send).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
        ['profile.jpg', 'image/jpeg'],
        ['profile.png', 'image/png'],
        ['profile.webp', 'image/webp'],
        ['profile.gif', 'image/gif'],
    ])('passes one original supported %s file to the owner', async (name, type) => {
        const onSelect = vi.fn().mockResolvedValue(undefined);
        render(<ProfilePhotoUpload onSelect={onSelect} />);
        const input = screen.getByLabelText(LABEL);
        expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif');
        expect(input).not.toHaveAttribute('multiple');
        const selected = file(name, type);

        choose([selected]);

        await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
        expect(onSelect).toHaveBeenCalledWith(selected);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('passes only one file when a selection unexpectedly contains several files', async () => {
        const pending = deferred();
        const onSelect = vi.fn().mockReturnValue(pending.promise);
        render(<ProfilePhotoUpload onSelect={onSelect} />);
        const first = file('first.png');
        const second = file('second.png');

        choose([first, second]);

        await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
        expect(onSelect).toHaveBeenCalledWith(first);
        await act(async () => { pending.resolve(); await pending.promise; });
        expect(onSelect).toHaveBeenCalledOnce();
    });

    it('blocks repeated choices while the owner is saving and permits choosing the same file again afterwards', async () => {
        const pending = deferred();
        const onSelect = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
        render(<ProfilePhotoUpload onSelect={onSelect} />);
        const selected = file();
        choose([selected]);
        await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());

        choose([selected]);
        await act(async () => {});
        expect(onSelect).toHaveBeenCalledOnce();
        await act(async () => { pending.resolve(); await pending.promise; });

        choose([selected]);

        await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2));
        expect(onSelect.mock.calls).toEqual([[selected], [selected]]);
    });

    it('releases the selection lock after a rejected owner save so the same file can be retried', async () => {
        const onSelect = vi.fn().mockRejectedValueOnce(new Error('save fixture')).mockResolvedValue(undefined);
        render(<ProfilePhotoUpload onSelect={onSelect} />);
        const selected = file();
        choose([selected]);
        await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
        await act(async () => {});

        choose([selected]);

        await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2));
    });

    it('blocks selections while disabled and allows selection once the owner finishes saving', async () => {
        const onSelect = vi.fn().mockResolvedValue(undefined);
        const view = render(<ProfilePhotoUpload disabled onSelect={onSelect} />);
        expect(screen.getByLabelText(LABEL)).toBeDisabled();

        choose([file()]);
        await act(async () => {});

        expect(onSelect).not.toHaveBeenCalled();
        view.rerender(<ProfilePhotoUpload onSelect={onSelect} />);
        const selected = file();
        choose([selected]);
        await waitFor(() => expect(onSelect).toHaveBeenCalledWith(selected));
    });
});
