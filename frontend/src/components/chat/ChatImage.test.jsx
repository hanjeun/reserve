import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ChatImage from './ChatImage';
import chatService from '../../services/chatService';
import { downloadChatImage, getChatImageBlob } from '../../utils/chatImageTransfer';

const state = vi.hoisted(() => ({ revision: 1 }));
vi.mock('../../store/useAuthStore', () => ({ default: selector => selector({ sessionRevision: state.revision }) }));
vi.mock('../../services/chatService', () => ({ default: { getImage: vi.fn() } }));
vi.mock('antd', () => ({ Image: props => <button aria-label={props['aria-label']}
    aria-hidden={props['aria-hidden']} aria-expanded={props.preview.open} onKeyDown={props.onKeyDown}
    onClick={() => props.preview.onOpenChange(true)}><img src={props.src} alt={props.alt} style={props.style}
        onLoad={props.onLoad} onError={props.onError} /></button> }));
const NativeURL = URL;
beforeEach(() => {
    state.revision = 1;
    const urls = class extends NativeURL {};
    urls.createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    urls.revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', urls);
    chatService.getImage.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('revokes the old account photo, closes its preview and aborts its request on account change', async () => {
    const { rerender, unmount } = render(<ChatImage url="/api/chat/images/1" />);
    fireEvent.load(await screen.findByAltText('대화에 첨부한 사진'));
    fireEvent.keyDown(await screen.findByRole('button', { name: '사진 크게 보기' }), { key: 'Enter' });
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    const signal = chatService.getImage.mock.calls[0][1];
    state.revision = 2;
    await act(async () => { rerender(<ChatImage url="/api/chat/images/1" />); });
    await waitFor(() => expect(screen.getByAltText('대화에 첨부한 사진')).toHaveAttribute('src', 'blob:second'));
    fireEvent.load(screen.getByAltText('대화에 첨부한 사진'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    expect(signal.aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
});

it('keeps the supplied photo ratio while fetching and decoding without showing a second grey image box', async () => {
    let resolve;
    chatService.getImage.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = render(<ChatImage url="/api/chat/images/44" width={600} height={200} />);
    const frame = view.container.querySelector('.reserve-chat-photo-frame');
    expect(frame).toHaveStyle({ width: '240px', aspectRatio: '600 / 200' });
    expect(screen.getByLabelText('사진을 불러오는 중')).toBeInTheDocument();
    await act(async () => resolve(new Blob(['png'], { type: 'image/png' })));
    expect(screen.getByLabelText('사진을 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사진 크게 보기' })).toBeNull();
    fireEvent.load(screen.getByAltText('대화에 첨부한 사진'));
    expect(screen.queryByLabelText('사진을 불러오는 중')).toBeNull();
    expect(screen.getByRole('button', { name: '사진 크게 보기' })).toBeInTheDocument();
    expect(frame).toHaveStyle({ aspectRatio: '600 / 200' });
    expect(screen.getByRole('img')).toHaveStyle({ objectFit: 'contain', opacity: '1' });
});

it('shows a failure explanation when the image cannot be decoded', async () => {
    render(<ChatImage url="/api/chat/images/45" />);
    fireEvent.error(await screen.findByAltText('대화에 첨부한 사진'));
    expect(screen.getByText('사진을 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사진 크게 보기' })).toBeNull();
});

it.each([
    { label: 'legacy fallback', filename: undefined, type: 'image/png', expected: 'reserve-chat-photo-33.png' },
    { label: 'original Korean name', filename: '가게 사진 2026-10-04.png', type: 'image/png', expected: '가게 사진 2026-10-04.png' },
    { label: 'JPEG alias', filename: '사진.JPEG', type: 'image/jpeg', expected: '사진.JPEG' },
    { label: 'unsafe path and extension', filename: 'C:\\fakepath\\사진\r\n.html', type: 'image/png', expected: '사진.png' },
    { label: 'long Unicode name', filename: '사진🍊'.repeat(100) + '.png', type: 'image/png' },
])('downloads a protected image with $label and releases the temporary URL', async ({ filename, type, expected }) => {
    vi.useFakeTimers();
    chatService.getImage.mockResolvedValue(new Blob(['image'], { type }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
        if (expected) expect(this.download).toBe(expected);
        else {
            expect(new TextEncoder().encode(this.download).length).toBeLessThanOrEqual(255);
            expect(this.download).toMatch(/^사진.*\.png$/u);
            expect(this.download).not.toContain('\uFFFD');
        }
        expect(this.href).toBe('blob:first');
        expect(this.isConnected).toBe(true);
    });
    const controller = new AbortController();
    await downloadChatImage('/api/v1/chat/images/33', controller.signal, () => true, filename);
    expect(chatService.getImage).toHaveBeenCalledWith('/api/v1/chat/images/33', controller.signal);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
});

it('does not start a download after its account or request becomes stale', async () => {
    let finish;
    chatService.getImage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let current = true;
    const controller = new AbortController();
    const pending = downloadChatImage('/api/chat/images/33', controller.signal, () => current);
    current = false;
    finish(new Blob(['png'], { type: 'image/png' }));
    await pending;
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    controller.abort();
    await downloadChatImage('/api/chat/images/33', controller.signal, () => true);
    expect(chatService.getImage).toHaveBeenCalledTimes(1);
});

it('rejects arbitrary URLs and non-image responses before creating a download', async () => {
    await expect(getChatImageBlob('https://example.invalid/photo.png', new AbortController().signal)).rejects.toThrow('사진 주소');
    expect(chatService.getImage).not.toHaveBeenCalled();
    chatService.getImage.mockResolvedValue(new Blob(['html'], { type: 'text/html' }));
    await expect(downloadChatImage('/api/chat/images/33', new AbortController().signal, () => true)).rejects.toThrow('사진 응답 형식');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
});
