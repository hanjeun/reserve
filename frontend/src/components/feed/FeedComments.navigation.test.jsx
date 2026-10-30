import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import FeedComments from './FeedComments';
import PostInteractionBar from './PostInteractionBar';
import { interactionKeys } from '../../hooks/feedInteractionQueries';
import useAuthStore from '../../store/useAuthStore';

const fixture = vi.hoisted(() => ({ comments: vi.fn(), reduced: false }));
vi.mock('../../services/feedInteractionService', () => ({ default: {
    config: async () => ({ enabled: true }), status: async () => ({ commentCount: 1 }),
    comments: (...args) => fixture.comments(...args),
} }));
vi.mock('../../hooks/feedQueries', () => ({ useFeedProfile: () => ({ data: null }) }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: {}, confirm: vi.fn() }) }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => fixture.reduced }));
vi.mock('../chat/ChatComposer', () => ({ default: () => null }));
vi.mock('./ContentLikeButton', () => ({ default: () => null }));

const empty = { content: [], page: { totalElements: 0 } };
const clients = [];
let scroll;
beforeEach(() => {
    fixture.reduced = false;
    fixture.comments.mockReset().mockResolvedValue(empty);
    useAuthStore.setState({ user: null, sessionRevision: 0 });
    scroll = vi.fn();
    vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scroll });
});
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); });

function Harness() {
    const location = useLocation();
    return <><Link to="/feed/posts/23">게시물 열기</Link>
        <PostInteractionBar targetId={23} postId={23} />
        {location.pathname === '/feed/posts/23' && <FeedComments postId={23} />}</>;
}
function view(path = '/feed', cached = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } });
    clients.push(client);
    if (cached) client.setQueryData(interactionKeys.comments(23), { pages: [empty], pageParams: [0] });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Harness /></MemoryRouter></QueryClientProvider>);
    return client;
}

it('opens the comments link and waits for the first read before scrolling to the comments heading', async () => {
    let finish;
    fixture.comments.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    view();
    fireEvent.click(await screen.findByRole('link', { name: '댓글 보기' }));
    await waitFor(() => expect(fixture.comments).toHaveBeenCalledTimes(1));
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => finish(empty));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
    expect(scroll.mock.contexts[0]).toBe(screen.getByRole('region', { name: '댓글' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
});

it('scrolls cached comments once, ignores background reads, and responds to another explicit comment click', async () => {
    const client = view('/feed/posts/23#comments', true);
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));
    await act(async () => client.setQueryData(interactionKeys.comments(23), { pages: [{ ...empty }], pageParams: [0] }));
    expect(scroll).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByRole('link', { name: '댓글 보기' }));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
});

it('leaves a normal post visit at the post instead of jumping to its comments', async () => {
    view();
    fireEvent.click(screen.getByRole('link', { name: '게시물 열기' }));
    await screen.findByText('아직 댓글이 없어요.');
    expect(scroll).not.toHaveBeenCalled();
});

it('respects reduced motion and also reaches a comment read error without waiting forever', async () => {
    fixture.reduced = true;
    fixture.comments.mockRejectedValue(Object.assign(new Error('offline'), { status: 503 }));
    view('/feed/posts/23#comments');
    await screen.findByText('댓글을 불러오지 못했어요.');
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' }));
});
