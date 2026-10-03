import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ChatImage from './ChatImage';
import chatService from '../../services/chatService';

const state = vi.hoisted(() => ({ revision: 1 }));
vi.mock('../../store/useAuthStore', () => ({ default: selector => selector({ sessionRevision: state.revision }) }));
vi.mock('../../services/chatService', () => ({ default: { getImage: vi.fn() } }));
vi.mock('antd', () => ({ Image: props => <button aria-label={props['aria-label']}
    aria-expanded={props.preview.open} onKeyDown={props.onKeyDown}
    onClick={() => props.preview.onOpenChange(true)}><img src={props.src} alt={props.alt} /></button> }));
const NativeURL = URL;
beforeEach(() => {
    state.revision = 1;
    const urls = class extends NativeURL {};
    urls.createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    urls.revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', urls);
    chatService.getImage.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
});
afterEach(() => vi.unstubAllGlobals());

it('revokes the old account photo, closes its preview and aborts its request on account change', async () => {
    const { rerender, unmount } = render(<ChatImage url="/api/chat/photos/1" />);
    fireEvent.keyDown(await screen.findByRole('button', { name: '사진 크게 보기' }), { key: 'Enter' });
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    const signal = chatService.getImage.mock.calls[0][1];
    state.revision = 2;
    await act(async () => { rerender(<ChatImage url="/api/chat/photos/1" />); });
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:second'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    expect(signal.aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
});
