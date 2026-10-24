import { beforeEach, expect, it, vi } from 'vitest';
import api from '../api/axios';
import storeService from './storeService';

vi.mock('../api/axios', () => ({ default: { get: vi.fn() } }));
beforeEach(() => api.get.mockReset().mockResolvedValue({ content: [] }));

it('keeps existing search parameters and forwards an optional cancellation signal', async () => {
    const params = { keyword: '공방', page: 1, size: 20 };
    await storeService.getStores(params);
    expect(api.get).toHaveBeenLastCalledWith('/api/stores', { params });
    const controller = new AbortController();
    await storeService.getStores(params, controller.signal);
    expect(api.get).toHaveBeenLastCalledWith('/api/stores', { params, signal: controller.signal });
});
