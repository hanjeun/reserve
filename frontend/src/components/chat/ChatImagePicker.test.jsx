import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatImagePicker from './ChatImagePicker';

describe('chat photo picker', () => {
    it('disables the affordance until the server is configured', () => {
        render(<ChatImagePicker enabled={false} onChange={vi.fn()} />);
        expect(screen.queryByRole('button', { name: '사진 첨부' })).toBeNull();
    });
    it('shows inline validation without sending unsupported or oversized files', () => {
        const onChange = vi.fn();
        render(<ChatImagePicker enabled onChange={onChange} />);
        const input = screen.getByLabelText('첨부할 사진 선택');
        fireEvent.change(input, { target: { files: [new File(['text'], 'file.svg', { type: 'image/svg+xml' })] } });
        expect(screen.getByRole('alert')).toHaveTextContent('JPG, PNG');
        const oversized = new File(['x'], 'large.png', { type: 'image/png' });
        Object.defineProperty(oversized, 'size', { value: 8 * 1024 * 1024 + 1 });
        fireEvent.change(input, { target: { files: [oversized] } });
        expect(screen.getByRole('alert')).toHaveTextContent('8MB 이하');
        expect(onChange).not.toHaveBeenCalled();
        const file = new File(['image'], 'photo.png', { type: 'image/png' });
        fireEvent.change(input, { target: { files: [file] } });
        expect(onChange).toHaveBeenCalledWith(file);
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('revokes the local preview when it leaves the composer', async () => {
        const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const file = new File(['image'], 'photo.png', { type: 'image/png' });
        const view = render(<ChatImagePicker enabled file={file} onChange={vi.fn()} />);
        await act(async () => {});
        expect(screen.getByAltText('전송할 사진')).toHaveAttribute('src', 'blob:preview');
        view.unmount();
        expect(revoke).toHaveBeenCalledWith('blob:preview');
        create.mockRestore(); revoke.mockRestore();
    });
    it('opens the shared preview and revokes all photo URLs on removal', async () => {
        const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:attachment');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const file = new File(['image'], 'photo.png', { type: 'image/png' });
        const view = render(<ChatImagePicker enabled file={file} onChange={vi.fn()} />);
        fireEvent.click(await screen.findByRole('button', { name: '첨부 사진 크게 보기' }));
        await waitFor(() => expect(document.querySelector('.reserve-image-preview')).not.toBeNull());
        view.rerender(<ChatImagePicker enabled file={null} onChange={vi.fn()} />);
        expect(revoke).toHaveBeenCalledWith('blob:attachment');
        await waitFor(() => expect(document.querySelector('.reserve-image-preview')).toBeNull());
        create.mockRestore(); revoke.mockRestore();
    });
    it('keeps Escape from closing the chat behind an attachment preview', async () => {
        const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:attachment');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const keyDown = vi.fn();
        const file = new File(['image'], 'photo.png', { type: 'image/png' });
        const view = render(<div onKeyDown={keyDown}><ChatImagePicker enabled file={file} onChange={vi.fn()} /></div>);
        const thumbnail = await screen.findByRole('button', { name: '첨부 사진 크게 보기' });
        fireEvent.click(thumbnail);
        await waitFor(() => expect(document.querySelector('.reserve-image-preview')).not.toBeNull());

        fireEvent.keyDown(thumbnail, { key: 'Escape' });

        expect(keyDown).not.toHaveBeenCalled();
        view.unmount();
        create.mockRestore(); revoke.mockRestore();
    });
    it('keeps only an inert thumbnail for the shared exit animation and then releases it', async () => {
        const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:exit');
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const file = new File(['image'], 'photo.png', { type: 'image/png' });
        const view = render(<ChatImagePicker enabled file={file} onChange={vi.fn()} />);
        await screen.findByRole('button', { name: '첨부 사진 크게 보기' });
        view.rerender(<ChatImagePicker enabled file={null} onChange={vi.fn()} />);
        const exiting = view.container.querySelector('.reserve-chat-attachment');
        expect(exiting).toHaveAttribute('inert');
        expect(exiting.style.animation).toContain('slideUpOut');
        expect(screen.queryByRole('button', { name: '첨부 사진 크게 보기' })).toBeNull();
        expect(revoke).not.toHaveBeenCalled();
        await waitFor(() => expect(view.container.querySelector('.reserve-chat-attachment')).toBeNull());
        expect(revoke).toHaveBeenCalledWith('blob:exit');
        create.mockRestore(); revoke.mockRestore();
    });
});
