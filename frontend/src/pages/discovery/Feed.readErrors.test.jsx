import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Feed from './Feed';
import FeedAuthor from './FeedAuthor';
import FeedDetail from './FeedDetail';
import FeedNotifications from './FeedNotifications';

const state = vi.hoisted(() => ({ config: {}, profile: {}, list: {}, author: {}, post: {} }));
vi.mock('@tanstack/react-query', () => ({
    useQuery: ({ queryKey: key }) => key[1] === 'config' || key[2] === 'config' ? state.config
        : key[1] === 'me' && key[2] === 'profile' ? state.profile
            : key[1] === 'author' && key[3] !== 'posts' ? state.author
                : key[1] === 'post' ? state.post : state.list,
    keepPreviousData: data => data,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../store/useAuthStore', () => ({ default: selector => selector({ user: { id: 7 } }) }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../hooks/useListQueryNormalization', () => ({ default: () => {} }));
vi.mock('../../hooks/useListRefreshAnchor', () => ({ default: () => {} }));
vi.mock('../../hooks/useGoBack', () => ({ default: () => vi.fn() }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { error: vi.fn() } }) }));
vi.mock('../../hooks/useFeedNotificationCount', () => ({ default: () => ({ visible: false }) }));
vi.mock('../../hooks/useFeedActions', () => ({ default: () => ({}) }));
vi.mock('../../services/feedService', () => ({ default: {} }));
vi.mock('../../services/feedInteractionService', () => ({ default: {} }));
vi.mock('../../components/common', async () => ({
    DataState: (await import('../../components/common/DataState')).default,
    PageContainer: ({ children, ref }) => <main ref={ref}>{children}</main>,
    PageTitle: ({ children }) => <h1>{children}</h1>,
    FilterMenu: () => null,
    Avatar: () => null,
}));
vi.mock('../../components/common/AnimatedContent', () => ({ default: ({ children }) => children }));
vi.mock('../../components/common/IconTool', () => ({ default: ({ label, unavailableReason }) => <button disabled={Boolean(unavailableReason)}>{label}</button> }));
vi.mock('../../components/common/Pagination', () => ({ default: () => null }));
vi.mock('../../components/feed/FeedPostCard', () => ({ default: ({ post }) => <article>{post?.title}</article> }));
vi.mock('../../components/feed/FeedSkeleton', () => ({ default: () => null, FeedPageSkeleton: () => null, FeedNotificationsPageSkeleton: () => null }));
vi.mock('../../components/feed/FeedRegionSheet', () => ({ default: () => null }));
vi.mock('../../components/feed/FeedEditor', () => ({ default: () => null }));
vi.mock('../../components/feed/FeedComments', () => ({ default: () => null }));

const query = (data, error = null) => ({ data, error, isError: Boolean(error), isPending: false, isSuccess: !error,
    isFetching: false, refetch: vi.fn().mockResolvedValue({}) });
const offline = { code: 'ERR_NETWORK' };
const publicId = '11111111-1111-1111-1111-111111111111';
const show = (element, path = '/feed', route = '/feed') => render(<MemoryRouter initialEntries={[path]}>
    <Routes><Route path={route} element={element} /></Routes>
</MemoryRouter>);

beforeEach(() => {
    state.config = query({ enabled: true, notificationsEnabled: true });
    state.profile = query({ publicId });
    state.author = query({ publicId, nickname: '합성 작성자' });
    state.list = query({ content: [{ id: 3, title: '합성 게시물', state: 'PUBLISHED' }], totalElements: 1 });
    state.post = query({ id: 3, title: '합성 게시물', state: 'PUBLISHED' });
});

describe('feed read failure ownership', () => {
    it.each([
        ['feed', <Feed />, '/feed', '/feed'],
        ['author', <FeedAuthor />, `/feed/authors/${publicId}`, '/feed/authors/:publicId'],
        ['detail', <FeedDetail />, '/feed/posts/3', '/feed/posts/:id'],
        ['notifications', <FeedNotifications />, '/feed/notifications', '/feed/notifications'],
    ])('retries only policy after %s is disabled even with stale denied content', async (_kind, element, path, route) => {
        state.config = query({ enabled: false, notificationsEnabled: false }, offline);
        for (const key of ['list', 'post', 'author', 'profile']) state[key] = query(state[key].data, { status: 403 });
        show(element, path, route);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        await act(async () => fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' })));
        expect(state.config.refetch).toHaveBeenCalledOnce();
        for (const key of ['list', 'post', 'author', 'profile']) expect(state[key].refetch).not.toHaveBeenCalled();
        expect(screen.queryByRole('article')).not.toBeInTheDocument();
    });
    it.each([
        [<FeedAuthor />, `/feed/authors/${publicId}`, '/feed/authors/:publicId'],
        [<FeedDetail />, '/feed/posts/3', '/feed/posts/:id'],
    ].flatMap(row => [offline, { status: 403 }].map(error => [...row, error])))('shows a profile-only failure beside usable primary content without repeating successful reads', async (element, path, route, error) => {
        state.profile = query(undefined, error);
        show(element, path, route);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveTextContent('공개 프로필을 불러오지 못했어요.');
        expect(screen.getByRole('article')).toHaveTextContent('합성 게시물');
        await act(async () => fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' })));
        expect(state.profile.refetch).toHaveBeenCalledOnce();
        for (const key of ['config', 'list', 'post', 'author']) expect(state[key].refetch).not.toHaveBeenCalled();
    });
    it('does not retry author posts until the failed author has been recovered', async () => {
        state.config = query(state.config.data, offline);
        state.author = query(undefined, offline);
        state.list = query(state.list.data, offline);
        show(<FeedAuthor />, `/feed/authors/${publicId}`, '/feed/authors/:publicId');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        await act(async () => fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' })));
        expect(state.author.refetch).toHaveBeenCalledOnce();
        expect(state.config.refetch).toHaveBeenCalledOnce();
        expect(state.list.refetch).not.toHaveBeenCalled();
    });
    it.each([
        ['feed', <Feed />, '/feed', '/feed'],
        ['author', <FeedAuthor />, `/feed/authors/${publicId}`, '/feed/authors/:publicId'],
        ['detail', <FeedDetail />, '/feed/posts/3', '/feed/posts/:id'],
        ['notifications', <FeedNotifications />, '/feed/notifications', '/feed/notifications'],
    ])('does not show inactive cached read failures after %s is disabled', (_kind, element, path, route) => {
        state.config = query({ enabled: false, notificationsEnabled: false });
        for (const key of ['list', 'post', 'author', 'profile']) state[key] = query(state[key].data, offline);
        show(element, path, route);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('article')).not.toBeInTheDocument();
    });
    it('shows one blocking post error for the three simultaneous failures and retries all failed reads', async () => {
        state.config = query({ enabled: true }, offline);
        state.profile = query({ publicId }, offline);
        state.list = query(undefined, offline);
        show(<Feed />);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveTextContent('게시물을 불러오지 못했어요.');
        expect(screen.getByRole('alert')).toHaveTextContent('서버에 연결할 수 없어요.');
        expect(screen.queryByText('공개 프로필을 갱신하지 못했어요.')).not.toBeInTheDocument();
        await act(async () => fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' })));
        for (const read of [state.config, state.profile, state.list]) expect(read.refetch).toHaveBeenCalledOnce();
    });

    it('keeps cached posts with one compact refresh failure', () => {
        state.config = query(state.config.data, offline);
        state.profile = query(state.profile.data, offline);
        state.list = query(state.list.data, offline);
        show(<Feed />);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveClass('reserve-data-state--compact');
        expect(screen.getByRole('article')).toHaveTextContent('합성 게시물');
    });

    it('retains a profile-only failure beside usable posts and blocks writing until it is recovered', async () => {
        state.profile = query(undefined, offline);
        show(<Feed />);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveTextContent('공개 프로필을 불러오지 못했어요.');
        expect(screen.getByRole('article')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '새 글 작성' })).toBeDisabled();
        await act(async () => fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' })));
        expect(state.profile.refetch).toHaveBeenCalledOnce();
        expect(state.list.refetch).not.toHaveBeenCalled();
        expect(state.config.refetch).not.toHaveBeenCalled();
    });

    it.each([401, 403])('hides stale posts after HTTP %s without an extra profile alert', status => {
        state.profile = query(state.profile.data, offline);
        state.list = query(state.list.data, { status });
        show(<Feed />);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.queryByRole('article')).not.toBeInTheDocument();
    });

    it.each([
        ['author', <FeedAuthor />, `/feed/authors/${publicId}`, '/feed/authors/:publicId'],
        ['detail', <FeedDetail />, '/feed/posts/3', '/feed/posts/:id'],
        ['notifications', <FeedNotifications />, '/feed/notifications', '/feed/notifications'],
    ])('suppresses a cached config failure beside a blocking %s failure', (kind, element, path, route) => {
        state.config = query(state.config.data, offline);
        if (kind === 'detail') state.post = query(undefined, offline);
        else state.list = query(undefined, offline);
        show(element, path, route);
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveTextContent('서버에 연결할 수 없어요.');
    });
});
