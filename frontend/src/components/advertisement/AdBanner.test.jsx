import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AdBanner from './AdBanner';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';

vi.mock('../../api/axios', () => ({ default: { patch: vi.fn() } }));
vi.mock('../../hooks', () => ({ useReducedMotion: () => true }));
const ad = { id: 17, storeId: 42, title: '시험 광고', storeName: '시험 가게', description: '시험 안내' };
function Location() { return <output>{useLocation().pathname}</output>; }
function View({ ads }) { return <MemoryRouter><AdBanner ads={ads} /><Location /></MemoryRouter>; }
beforeEach(() => { api.patch.mockReset(); api.patch.mockResolvedValue(null); });

it('deduplicates impression records across rerenders but records a different ad', () => {
    const { rerender } = render(<View ads={[ad]} />);
    rerender(<View ads={[{ ...ad }]} />);
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith(API_ENDPOINTS.ADVERTISEMENT.IMPRESSION(17));
    rerender(<View ads={[{ ...ad, id: 18 }]} />);
    expect(api.patch).toHaveBeenCalledTimes(2);
    expect(api.patch).toHaveBeenLastCalledWith(API_ENDPOINTS.ADVERTISEMENT.IMPRESSION(18));
});
it('still opens the store when impression and click requests fail', async () => {
    api.patch.mockRejectedValue(new Error('offline'));
    render(<View ads={[ad]} />);
    fireEvent.click(screen.getByRole('button', { name: '시험 광고 광고 — 가게 상세로 이동' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('/store/42'));
    expect(api.patch).toHaveBeenCalledWith(API_ENDPOINTS.ADVERTISEMENT.CLICK(17));
    await act(async () => { await Promise.resolve(); });
});
