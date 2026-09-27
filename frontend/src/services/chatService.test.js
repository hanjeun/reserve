import { describe, expect, it, vi } from 'vitest';
import chatService from './chatService';
import api from '../api/axios';

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
describe('chat transport contracts', () => {
    it('opens rooms with explicit POST writes, not GET reads', () => {
        chatService.getSupport(); chatService.getStore(5); chatService.getStoreInboxRoom(6); chatService.getAdminSupportRoom(7);
        expect(api.post.mock.calls.map(([path]) => path)).toEqual([
            '/api/chat/support/open', '/api/chat/stores/5/open', '/api/chat/store-inbox/6/open', '/api/admin/chat/rooms/7/open',
        ]);
        expect(api.get).not.toHaveBeenCalled();
    });
    it('sends multipart photos without overriding the boundary and reads authenticated blobs', () => {
        api.post.mockClear();
        const photo = new File(['image'], 'photo.png', { type: 'image/png' });
        chatService.sendImage(10, photo, '', 'attempt');
        const [path, form, options] = api.post.mock.calls[0];
        expect(path).toBe('/api/chat/rooms/10/images');
        expect(form.get('image')).toBe(photo);
        expect(form.get('clientMessageId')).toBe('attempt');
        expect(options).toBeUndefined();
        chatService.getImage('/api/chat/images/33');
        expect(api.get).toHaveBeenCalledWith('/api/chat/images/33', { responseType: 'blob', signal: undefined });
    });
});
