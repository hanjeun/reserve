import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoreNewsTab from './StoreNewsTab';
import ChatIntroTab from './ChatIntroTab';

const state = vi.hoisted(() => ({ config: {}, stores: {}, list: {}, intro: {} }));
vi.mock('@tanstack/react-query', () => ({
    useQuery: ({ queryKey: key }) => key[1] === 'config' ? state.config : key[1] === 'stores' ? state.stores : state.list,
    keepPreviousData: data => data,
    useMutation: () => ({ isPending: false }),
    useQueryClient: () => ({}),
}));
vi.mock('../../hooks', () => ({
    useWindowWidth: () => 1200,
    useMyStores: () => ({ stores: state.stores.data, error: state.stores.error, loading: false, refetch: state.stores.refetch }),
    useQueryParamsState: defaults => [defaults, vi.fn()],
}));
vi.mock('../../hooks/useChatIntro', () => ({ default: () => state.intro }));
vi.mock('../../hooks/useQueryParamState', () => ({ default: defaults => [defaults, vi.fn()] }));
vi.mock('../../hooks/useStoreNewsEvents', () => ({ default: () => {} }));
vi.mock('../../hooks/useListRefreshAnchor', () => ({ default: () => {} }));
vi.mock('../../hooks/useLiveUpdatesStatus', () => ({ default: () => ({ domains: ['NEWS'] }) }));
vi.mock('../../hooks/useWorkspaceAction', () => ({ default: () => action => action() }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: {}, confirm: vi.fn() }) }));
vi.mock('../../store/useAuthStore', () => ({ default: selector => selector({ user: { id: 7, role: 'BUSINESS' } }) }));
vi.mock('../common', async () => ({
    DataState: (await import('../common/DataState')).default,
    Button: ({ children }) => <button>{children}</button>,
    FilterMenu: () => null,
    FilterToolbar: () => null,
    FormModal: () => null,
    RefreshButton: () => null,
}));
vi.mock('../common/AnimatedContent', () => ({ default: ({ children }) => children }));
vi.mock('../common/Pagination', () => ({ default: () => null }));
vi.mock('../store-news/StoreNewsEditor', () => ({ default: () => null }));
vi.mock('../store-news/StoreNewsPresentation', () => ({ BenefitDetailContent: () => null, StoreNewsMetadata: () => null }));
vi.mock('../store-news/StoreNewsActions', () => ({ StoreNewsWriteAction: () => null }));
vi.mock('../chat/ChatIntroEditor', () => ({ default: () => <div>합성 채팅 설정</div> }));

const failure = { status: 503 };
const query = (data, error = null) => ({ data, error, isError: Boolean(error), isSuccess: !error, isPending: false,
    isFetching: false, refetch: vi.fn().mockResolvedValue({}) });
const show = element => render(<MemoryRouter>{element}</MemoryRouter>);
beforeEach(() => {
    state.config = query({ enabled: true });
    state.stores = query([{ id: 12, name: '합성 가게' }]);
    state.list = query({ content: [{ id: 4, title: '합성 소식', state: 'DRAFT' }], totalElements: 1 });
    state.intro = { isError: false, isLoading: false, isFetching: false, refetch: vi.fn().mockResolvedValue({}) };
});

describe('business read failure ownership', () => {
    it.each([false, true])('collapses store, policy and news failures while preserving usable rows (%s)', async cached => {
        state.config = query(state.config.data, failure);
        state.stores = query(state.stores.data, failure);
        state.list = query(cached ? state.list.data : undefined, failure);
        show(<StoreNewsTab />);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveTextContent(cached ? '가게 소식을 갱신하지 못했어요.' : '내 소식을 불러오지 못했어요.');
        expect(Boolean(screen.queryByText('합성 소식'))).toBe(cached);
        await act(async () => fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' })));
        for (const read of [state.config, state.stores, state.list]) expect(read.refetch).toHaveBeenCalledOnce();
    });

    it('keeps a store-only failure beside usable news', () => {
        state.stores = query(undefined, failure);
        show(<StoreNewsTab />);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveTextContent('내 가게를 불러오지 못했어요.');
        expect(screen.getByText('합성 소식')).toBeInTheDocument();
    });

    it('does not expose cached news after a denied policy response', () => {
        state.config = query(state.config.data, { status: 403 });
        show(<StoreNewsTab />);
        expect(screen.getByRole('alert')).toHaveTextContent('조회 권한이 없어요.');
        expect(screen.queryByText('합성 소식')).not.toBeInTheDocument();
    });

    it('retries store and chat setting failures from one primary notice', async () => {
        state.stores = query(state.stores.data, failure);
        Object.assign(state.intro, { isError: true, error: failure });
        show(<ChatIntroTab />);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveTextContent('채팅 설정을 처리하지 못했어요');
        await act(async () => fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' })));
        expect(state.stores.refetch).toHaveBeenCalledOnce();
        expect(state.intro.refetch).toHaveBeenCalledOnce();
        expect(screen.queryByText('합성 채팅 설정')).not.toBeInTheDocument();
    });
});
