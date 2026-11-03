import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import MessengerStoreSearch from './MessengerStoreSearch';

const state = vi.hoisted(() => ({ result: {} }));
vi.mock('../../hooks/useMessengerSearch', () => ({ default: () => state.result }));
vi.mock('../../hooks/useSearchTransition', () => ({ default: () => ({ isClosing: false, leaveSearch: vi.fn(), motionClass: '' }) }));
vi.mock('../../store/useMessengerStore', () => ({ default: selector => selector({ sessionIdentity: 'synthetic', updateStoreSearch: vi.fn() }) }));
vi.mock('../common', async () => ({ DataState: (await import('../common/DataState')).default, Bone: () => null }));
vi.mock('../common/SearchControls', () => ({ default: () => null }));
vi.mock('../common/SegmentedControl', () => ({ default: () => null }));
vi.mock('../common/IconTool', () => ({ default: () => null }));
vi.mock('./MessengerAvatar', () => ({ default: () => null }));
vi.mock('./SupportIdentity', () => ({ SupportAvatar: () => null }));

const query = failed => ({ isError: failed, error: failed ? { code: 'ERR_NETWORK' } : null,
    isLoading: false, isFetching: false, refetch: vi.fn().mockResolvedValue({}) });
beforeEach(() => { state.result = {}; });

it.each([[true, true], [true, false], [false, true]])('shows one search error and retries only failed scopes (private=%s, store=%s)', async (privateFailed, storeFailed) => {
    const personal = query(privateFailed);
    const stores = query(storeFailed);
    state.result = { query: personal, ready: true, keyword: '카페', hasData: !privateFailed,
        conversations: [], messages: [], stores: { stores: [], total: 0, hasData: !storeFailed, query: stores } };
    render(<MessengerStoreSearch search={{ visible: true, keyword: '카페', category: 'all', page: 0 }} memberId={7} onBack={vi.fn()} onChoose={vi.fn()} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('서버에 연결할 수 없어');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' })));
    expect(personal.refetch).toHaveBeenCalledTimes(privateFailed ? 1 : 0);
    expect(stores.refetch).toHaveBeenCalledTimes(storeFailed ? 1 : 0);
});
